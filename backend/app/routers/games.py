import re
import time
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy.orm import Session

from app.database import get_db
from app import models
from app.auth import get_optional_user

router = APIRouter()

CHESSCOM_BASE = "https://api.chess.com/pub/player"
HEADERS = {"User-Agent": "Chessbook/0.1 (learning app)"}


# ── Schemas ────────────────────────────────────────────────────────────────────

class DeviationOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    move:      int
    expected:  str
    played:    str
    line_name: Optional[str] = None
    note:      Optional[str] = None


class GameOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id:           str
    white:        str
    black:        str
    white_rating: Optional[int]
    black_rating: Optional[int]
    is_white:     bool
    result:       str
    my_result:    Optional[str]
    opp_result:   Optional[str]
    opening:      str
    moves:        list[str]
    deviation:    Optional[DeviationOut]
    date:         str
    time_control: str
    time_class:   Optional[str]
    rated:        bool
    accuracy:     Optional[dict]
    game_url:     Optional[str]
    tournament:   Optional[str]
    rules:        str = "chess"


# ── Helpers ────────────────────────────────────────────────────────────────────

def _extract_moves(pgn: str) -> list[str]:
    body = re.sub(r'\[.*?\]\n?', '', pgn)
    body = re.sub(r'\{[^}]*\}', '', body)
    body = re.sub(r'\([^)]*\)', '', body)
    body = re.sub(r'\d+\.\.\.', '', body)
    body = re.sub(r'\d+\.', '', body)
    tokens = body.split()
    terminal = {'1-0', '0-1', '1/2-1/2', '*'}
    return [t for t in tokens if t not in terminal][:20]


_REPERTOIRE = {
    "sicilian dragon": [
        {"label": "Dragon setup",       "moves": ["e4","c5","Nf3","d6","d4","cxd4","Nxd4","Nf6","Nc3","g6"]},
        {"label": "Accelerated Dragon", "moves": ["e4","c5","Nf3","Nc6","d4","cxd4","Nxd4","g6","Nc3","Bg7"]},
    ],
    "london system": [
        {"label": "Main line",    "moves": ["d4","d5","Bf4","Nf6","e3","e6","Nf3","Be7","Bd3","O-O"]},
        {"label": "vs KID setup", "moves": ["d4","Nf6","Bf4","e6","e3","b6","Nf3","Bb7","Bd3","c5"]},
        {"label": "vs c5 sideline","moves": ["d4","d5","Bf4","c5","e3","Nc6","Nf3","Qb6","Qc1"]},
    ],
    "italian game": [{"label": "Giuoco Piano", "moves": ["e4","e5","Nf3","Nc6","Bc4","Bc5","c3","Nf6","d4"]}],
    "caro-kann":    [{"label": "Classical",    "moves": ["e4","c6","d4","d5","Nc3","dxe4","Nxe4","Bf5"]}],
    "french defense":[{"label": "Advance",     "moves": ["e4","e6","d4","d5","Nc3","Nf6","e5","Nfd7","f4"]}],
}


def _strip(m: str) -> str:
    return m.replace('+','').replace('#','').replace('!','').replace('?','').replace('x','')


def _detect_deviation(moves: list[str], opening_key: str) -> Optional[DeviationOut]:
    lines = _REPERTOIRE.get(opening_key.lower(), [])
    if not lines:
        return None
    for line in lines:
        lm = line["moves"]
        for i in range(min(len(lm), len(moves))):
            if _strip(moves[i]) != _strip(lm[i]):
                return DeviationOut(
                    move=i // 2 + 1,
                    expected=lm[i],
                    played=moves[i],
                    line_name=line["label"],
                    note=f"Expected {lm[i]} ({line['label']}). You played {moves[i]}.",
                )
        return None   # matched this line fully
    return None


def _parse_game(raw: dict, username: str) -> GameOut:
    white_info = raw.get("white", {}) or {}
    black_info = raw.get("black", {}) or {}

    white = (white_info.get("username") or "").lower()
    is_white = white == username.lower()

    white_res = white_info.get("result", "")
    result = "1-0" if white_res == "win" else "0-1" if white_res == "lose" else "1/2-1/2"
    my_result  = (white_info if is_white else black_info).get("result")
    opp_result = (black_info if is_white else white_info).get("result")

    eco_url = raw.get("opening") or ""
    opening = eco_url.split("/")[-1].replace("-", " ") if eco_url else "Unknown"

    moves = _extract_moves(raw.get("pgn") or "")
    deviation = _detect_deviation(moves, opening)

    end_time = raw.get("end_time")
    date_str = time.strftime("%Y-%m-%d", time.localtime(end_time)) if end_time else "?"

    accuracies = raw.get("accuracies")

    game_id = (raw.get("url") or "").split("/")[-1] or str(id(raw))

    return GameOut(
        id=game_id,
        white=white_info.get("username") or "?",
        black=black_info.get("username") or "?",
        white_rating=white_info.get("rating"),
        black_rating=black_info.get("rating"),
        is_white=is_white,
        result=result,
        my_result=my_result,
        opp_result=opp_result,
        opening=opening,
        moves=moves,
        deviation=deviation,
        date=date_str,
        time_control=str(raw.get("time_control") or "?"),
        time_class=raw.get("time_class"),
        rated=raw.get("rated", True),
        accuracy=accuracies,
        game_url=raw.get("url"),
        tournament=raw.get("tournament"),
        rules=raw.get("rules") or "chess",
    )


def _upsert_game(db: Session, g: GameOut, username: str):
    existing = db.query(models.Game).filter_by(id=g.id).first()
    dev = g.deviation.model_dump(by_alias=False) if g.deviation else None
    if existing:
        return
    db.add(models.Game(
        id=g.id, username=username,
        white=g.white, black=g.black,
        white_rating=g.white_rating, black_rating=g.black_rating,
        is_white=g.is_white, result=g.result,
        my_result=g.my_result, opp_result=g.opp_result,
        opening=g.opening, moves=g.moves, deviation=dev,
        date=g.date, time_control=g.time_control, time_class=g.time_class,
        rated=g.rated, accuracy=g.accuracy, game_url=g.game_url,
        tournament=g.tournament,
    ))


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/import", response_model=list[GameOut])
async def import_games(
    username: str = Query(...),
    months:   int = Query(1, ge=1, le=6),
    db: Session = Depends(get_db),
):
    from datetime import datetime
    results: list[GameOut] = []

    async with httpx.AsyncClient(timeout=15) as client:
        for i in range(months):
            now = datetime.now()
            month = (now.month - i - 1) % 12 + 1
            year  = now.year - ((now.month - i - 1) // 12)
            url = f"{CHESSCOM_BASE}/{username.lower()}/games/{year}/{month:02d}"
            try:
                resp = await client.get(url, headers=HEADERS)
                if resp.status_code == 404:
                    continue
                if not resp.is_success:
                    raise HTTPException(resp.status_code, f"Chess.com: {resp.text[:200]}")
                for raw in resp.json().get("games", []):
                    g = _parse_game(raw, username)
                    results.append(g)
                    _upsert_game(db, g, username)
            except httpx.TimeoutException:
                raise HTTPException(504, "Chess.com API timeout")

    db.commit()
    return sorted(results, key=lambda g: g.date, reverse=True)


# ── Coverage-gap schemas ────────────────────────────────────────────────────────

class CoverageEntry(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    move:       str
    count:      int
    total:      int
    frequency:  float
    covered:    bool
    covered_by: list[str]
    # Lichess explorer data (populated after async query)
    lichess_frequency: Optional[float] = None
    lichess_count:     Optional[int]   = None
    lichess_total:     Optional[int]   = None


class CoveragePosition(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    prefix:  list[str]
    depth:   int
    entries: list[CoverageEntry]


class CoverageGapOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    opening_id:     str
    opening_name:   str
    color:          str
    games_analyzed: int
    positions:      list[CoveragePosition]


# ── Coverage-gap helpers ────────────────────────────────────────────────────────

def _display(m: str) -> str:
    return m.replace('+', '').replace('#', '').replace('!', '').replace('?', '')


def _compute_gaps(
    games: list,
    lines_with_openings: list,
) -> list[CoverageGapOut]:
    lines_by_opening: dict = defaultdict(list)
    openings_map: dict = {}
    for line, opening in lines_with_openings:
        lines_by_opening[opening.id].append(line)
        openings_map[opening.id] = opening

    results: list[CoverageGapOut] = []

    for opening_id, lines in lines_by_opening.items():
        opening = openings_map[opening_id]
        color = opening.color  # 'white' | 'black'

        # coverage[stripped_prefix_tuple][stripped_opp_move] = [line_label, ...]
        coverage: dict = defaultdict(lambda: defaultdict(list))
        for line in lines:
            sm = [_strip(mv) for mv in line.moves]
            opp_idxs = range(1, len(sm), 2) if color == 'white' else range(0, len(sm), 2)
            for i in opp_idxs:
                coverage[tuple(sm[:i])][sm[i]].append(line.label)

        # pos_data[prefix_tuple][stripped_move] = {count, covered, covered_by, display}
        pos_data: dict = defaultdict(lambda: defaultdict(lambda: {
            'count': 0, 'covered': False, 'covered_by': [], 'display': '',
        }))
        pos_display_prefix: dict = {}   # stripped prefix → display version (preserves 'x')
        pos_totals: dict = defaultdict(int)
        games_analyzed = 0

        for game in games:
            if color == 'white' and not game.is_white:
                continue
            if color == 'black' and game.is_white:
                continue

            raw_moves: list = game.moves or []
            if not raw_moves:
                continue

            sm_game   = [_strip(mv)   for mv in raw_moves]
            disp_game = [_display(mv) for mv in raw_moves]
            active    = list(lines)
            entered   = False

            for i, move in enumerate(sm_game):
                if not active:
                    break
                is_our_move = (i % 2 == 0) if color == 'white' else (i % 2 == 1)

                if is_our_move:
                    active = [l for l in active if i < len(l.moves) and _strip(l.moves[i]) == move]
                    if not active:
                        break
                    if not entered:
                        entered = True
                        games_analyzed += 1
                else:
                    if not entered:
                        # Black opening: opponent's first move — just filter, don't record yet
                        active = [l for l in active if i < len(l.moves) and _strip(l.moves[i]) == move]
                        continue

                    prefix = tuple(sm_game[:i])
                    if prefix not in pos_display_prefix:
                        pos_display_prefix[prefix] = list(disp_game[:i])
                    pos_totals[prefix] += 1

                    entry = pos_data[prefix][move]
                    entry['count'] += 1
                    if not entry['display']:
                        entry['display'] = disp_game[i]
                    if not entry['covered']:
                        covered_moves = coverage.get(prefix, {})
                        if move in covered_moves:
                            entry['covered'] = True
                            entry['covered_by'] = list(covered_moves[move])

                    active = [l for l in active if i < len(l.moves) and _strip(l.moves[i]) == move]

        if not games_analyzed:
            continue

        positions: list[CoveragePosition] = []
        for prefix in sorted(pos_data, key=len):
            total = pos_totals[prefix]
            entries: list[CoverageEntry] = []
            for move_key, data in sorted(pos_data[prefix].items(), key=lambda x: -x[1]['count']):
                if data['count'] < 2:
                    continue
                entries.append(CoverageEntry(
                    move=data['display'] or move_key,
                    count=data['count'],
                    total=total,
                    frequency=data['count'] / total if total else 0,
                    covered=data['covered'],
                    covered_by=data['covered_by'],
                ))
            if entries:
                positions.append(CoveragePosition(
                    prefix=pos_display_prefix.get(prefix, list(prefix)),
                    depth=len(prefix) + 1,
                    entries=entries,
                ))

        results.append(CoverageGapOut(
            opening_id=opening_id,
            opening_name=opening.name,
            color=color,
            games_analyzed=games_analyzed,
            positions=positions,
        ))

    # ── Root-level gap: opponent's very first move, aggregated across the
    # whole Black repertoire. Per-opening analysis above can't catch "opponent
    # played 1.d4 and I have no Black opening for it" because each opening's
    # move list is filtered to games that already match its first move(s).
    black_entries = [(line, opening) for line, opening in lines_with_openings if opening.color == 'black']
    if black_entries:
        root_covered_by: dict = defaultdict(list)
        for line, opening in black_entries:
            if not line.moves:
                continue
            root_covered_by[_strip(line.moves[0])].append(f"{opening.name} · {line.label}")

        root_counts:  dict = defaultdict(int)
        root_display: dict = {}
        root_games_analyzed = 0
        for game in games:
            if game.is_white:
                continue
            raw_moves: list = game.moves or []
            if not raw_moves:
                continue
            root_games_analyzed += 1
            first = _strip(raw_moves[0])
            root_counts[first] += 1
            root_display.setdefault(first, _display(raw_moves[0]))

        if root_games_analyzed:
            root_entries: list[CoverageEntry] = []
            for move_key, count in sorted(root_counts.items(), key=lambda x: -x[1]):
                if count < 2:
                    continue
                covered_by = root_covered_by.get(move_key, [])
                root_entries.append(CoverageEntry(
                    move=root_display.get(move_key, move_key),
                    count=count,
                    total=root_games_analyzed,
                    frequency=count / root_games_analyzed,
                    covered=bool(covered_by),
                    covered_by=covered_by,
                ))
            if root_entries:
                results.insert(0, CoverageGapOut(
                    opening_id="_root_black",
                    opening_name="Black repertoire — opponent's 1st move",
                    color="black",
                    games_analyzed=root_games_analyzed,
                    positions=[CoveragePosition(prefix=[], depth=1, entries=root_entries)],
                ))

    return results


# ── Lichess explorer helpers ────────────────────────────────────────────────────

_LICHESS_SPEEDS  = "blitz,rapid"
_LICHESS_BUCKETS = [1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500]
_FREQUENCY_CACHE_TTL = timedelta(days=30)
_mem_cache: dict[str, dict] = {}   # process-level cache; survives between requests


def _rating_to_buckets(rating: int) -> str:
    idx = min(range(len(_LICHESS_BUCKETS)), key=lambda i: abs(_LICHESS_BUCKETS[i] - rating))
    lo  = max(0, idx - 1)
    hi  = min(len(_LICHESS_BUCKETS), idx + 2)
    return ",".join(str(b) for b in _LICHESS_BUCKETS[lo:hi])


def _fen_from_prefix(prefix: list[str]) -> Optional[str]:
    try:
        import chess
        board = chess.Board()
        for san in prefix:
            board.push_san(san)
        return board.fen()
    except Exception:
        return None


async def _fetch_lichess(
    client:  httpx.AsyncClient,
    fen:     str,
    ratings: str,
) -> dict:
    key = f"{fen}|{ratings}"
    if key in _mem_cache:
        return _mem_cache[key]
    try:
        resp = await client.get(
            "https://explorer.lichess.ovh/lichess",
            params={
                "variant":     "standard",
                "speeds":      _LICHESS_SPEEDS,
                "ratings":     ratings,
                "fen":         fen,
                "topGames":    0,
                "recentGames": 0,
            },
            timeout=8,
            headers={"Accept-Encoding": "gzip"},
        )
        if resp.is_success:
            data = resp.json()
            _mem_cache[key] = data
            return data
    except Exception:
        pass
    return {}


def _apply_lichess(pos: "CoveragePosition", moves: list, total: int) -> None:
    if not total:
        return
    lmap = {m["san"]: m for m in moves}
    for entry in pos.entries:
        if entry.move in lmap:
            lm     = lmap[entry.move]
            lcount = lm["white"] + lm["draws"] + lm["black"]
            entry.lichess_frequency = lcount / total
            entry.lichess_count     = lcount
            entry.lichess_total     = total


# ── Coverage-gap route ──────────────────────────────────────────────────────────

@router.get("/coverage-gaps", response_model=list[CoverageGapOut])
async def coverage_gaps(
    username:     str            = Query(...),
    limit:        int            = Query(300, ge=1, le=500),
    db:           Session        = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_optional_user),
):
    import asyncio

    rating  = (current_user.platform_rating if current_user and current_user.platform_rating else 1800)
    buckets = _rating_to_buckets(rating)

    games = (
        db.query(models.Game)
        .filter_by(username=username)
        .order_by(models.Game.date.desc())
        .limit(limit)
        .all()
    )
    lines_with_openings = (
        db.query(models.Line, models.Opening)
        .join(models.Opening)
        .all()
    )
    results = _compute_gaps(games, lines_with_openings)

    # Separate positions by cache status
    cached_positions:   list[tuple[int, int, list, int]] = []
    uncached_positions: list[tuple[int, int, str]]       = []

    for oi, opening in enumerate(results):
        for pi, pos in enumerate(opening.positions):
            fen = _fen_from_prefix(pos.prefix)
            if not fen:
                continue
            row = db.query(models.FrequencyCache).filter_by(
                fen=fen, ratings_key=buckets, speeds_key=_LICHESS_SPEEDS,
            ).first()
            is_fresh = row and (datetime.utcnow() - row.fetched_at) < _FREQUENCY_CACHE_TTL
            if is_fresh:
                cached_positions.append((oi, pi, row.moves, row.total))
            else:
                uncached_positions.append((oi, pi, fen))

    # Apply cached data immediately
    for oi, pi, moves, total in cached_positions:
        _apply_lichess(results[oi].positions[pi], moves, total)

    # Fetch uncached positions from Lichess concurrently
    if uncached_positions:
        async with httpx.AsyncClient() as client:
            lichess_results = await asyncio.gather(
                *[_fetch_lichess(client, fen, buckets) for _, _, fen in uncached_positions],
                return_exceptions=True,
            )

        to_commit = False
        for (oi, pi, fen), ldata in zip(uncached_positions, lichess_results):
            if isinstance(ldata, Exception) or not ldata:
                continue
            moves = ldata.get("moves", [])
            total = sum(m["white"] + m["draws"] + m["black"] for m in moves)
            if not total:
                continue

            try:
                db.merge(models.FrequencyCache(
                    fen=fen,
                    ratings_key=buckets,
                    speeds_key=_LICHESS_SPEEDS,
                    moves=moves,
                    total=total,
                    fetched_at=datetime.utcnow(),
                ))
                to_commit = True
            except Exception:
                db.rollback()

            _apply_lichess(results[oi].positions[pi], moves, total)

        if to_commit:
            try:
                db.commit()
            except Exception:
                db.rollback()

    return results


@router.get("/", response_model=list[GameOut])
def list_games(username: str = Query(...), db: Session = Depends(get_db)):
    rows = (
        db.query(models.Game)
        .filter_by(username=username)
        .order_by(models.Game.date.desc())
        .all()
    )
    out = []
    for r in rows:
        dev = DeviationOut(**r.deviation) if r.deviation else None
        out.append(GameOut(
            id=r.id, white=r.white, black=r.black,
            white_rating=r.white_rating, black_rating=r.black_rating,
            is_white=r.is_white, result=r.result,
            my_result=r.my_result, opp_result=r.opp_result,
            opening=r.opening, moves=r.moves or [], deviation=dev,
            date=r.date, time_control=r.time_control, time_class=r.time_class,
            rated=r.rated if r.rated is not None else True,
            accuracy=r.accuracy, game_url=r.game_url, tournament=r.tournament,
        ))
    return out
