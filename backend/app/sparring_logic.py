"""Pure, DB-agnostic logic for Sparring mode: which position to serve next,
and (added in Task 6) how the rival replies and whether the user's move was
correct. Kept free of SQLAlchemy/FastAPI so it's fast and trivial to test."""
import random
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

COOLDOWN = timedelta(hours=1)


@dataclass
class LineInfo:
    line_id: int
    opening_id: str
    moves: list[str]       # already +/#-stripped SAN, full line
    repetitions: int       # from LineProgress; 0 if the user has none yet


@dataclass
class StatsInfo:
    attempts: int = 0
    last_result: Optional[str] = None
    last_attempt_at: Optional[datetime] = None


@dataclass
class SparringCandidate:
    line_id: int
    opening_id: str
    ply_index: int
    weight: float


def _is_user_ply(ply_index: int, color: str) -> bool:
    return (ply_index % 2 == 0) if color == "white" else (ply_index % 2 == 1)


def _divergence_map(lines: list[LineInfo], color: str) -> dict:
    """(opening_id, prefix) -> set of distinct next moves, at user-move plies
    only. A size >= 2 means the user could plausibly transpose between two
    of their own known lines at that position — see
    docs/superpowers/plans/2026-07-29-sparring-mode.md's Fase 2 correction
    on why this must gate the 'free rival' value."""
    divergence: dict = {}
    for line in lines:
        for i in range(len(line.moves)):
            if not _is_user_ply(i, color):
                continue
            prefix = tuple(line.moves[:i])
            divergence.setdefault((line.opening_id, prefix), set()).add(line.moves[i])
    return divergence


def build_sparring_candidates(
    lines: list[LineInfo],
    stats: dict,
    color: str,
    now: Optional[datetime] = None,
) -> list[SparringCandidate]:
    """One candidate per (line, user-move ply) with ply_index >= 2 (skip the
    opening two plies so there's already some context), weighted by:
    divergence (does a sibling line diverge here?), practice recency
    (fewer past attempts -> higher weight), SM-2 maturity of the line, and a
    cooldown that deprioritizes positions the user got wrong recently."""
    now = now or datetime.utcnow()
    divergence = _divergence_map(lines, color)

    candidates = []
    for line in lines:
        for i in range(2, len(line.moves)):
            if not _is_user_ply(i, color):
                continue
            prefix = tuple(line.moves[:i])
            n_options = len(divergence.get((line.opening_id, prefix), set()))
            divergence_factor = 3.0 if n_options >= 2 else 1.0

            st = stats.get((line.line_id, i), StatsInfo())
            attempts_factor = 1.0 / (1 + st.attempts)
            maturity_factor = 1.0 + min(line.repetitions, 5) * 0.2

            cooldown_factor = 1.0
            if st.last_result is not None and st.last_result != "correct" \
                    and st.last_attempt_at and now - st.last_attempt_at < COOLDOWN:
                cooldown_factor = 0.2

            weight = divergence_factor * attempts_factor * maturity_factor * cooldown_factor
            candidates.append(SparringCandidate(
                line_id=line.line_id, opening_id=line.opening_id,
                ply_index=i, weight=weight,
            ))
    return candidates


def select_sparring_node(
    candidates: list[SparringCandidate],
    rng: random.Random,
) -> Optional[SparringCandidate]:
    if not candidates:
        return None
    weights = [c.weight for c in candidates]
    return rng.choices(candidates, weights=weights, k=1)[0]


def choose_opponent_move(
    matching_lines: list,
    ply_index: int,
    rng: random.Random,
) -> Optional[str]:
    """Fase 3 Option A: the rival picks uniformly among whichever of the
    user's OWN repertoire lines still have a recorded move at ply_index,
    given `matching_lines` already filtered to ones consistent with the
    game so far. None means the user's book ends here."""
    options = [line[ply_index] for line in matching_lines if len(line) > ply_index]
    if not options:
        return None
    return rng.choice(options)


def count_divergent_positions(lines: list[LineInfo], color: str) -> int:
    """How many (opening, prefix) positions have >= 2 distinct next moves
    across `lines` — the real gauge of how much value the Fase 3 'free
    rival' adds. This is a runtime measurement over whatever catalog is
    passed in, not a fixed snapshot — see
    docs/superpowers/plans/2026-07-29-sparring-mode.md's closing analysis
    for how to interpret it. Only counts positions with ply_index >= 2,
    matching build_sparring_candidates's exclusion of the first two plies —
    otherwise this would overstate how many positions can actually be
    served."""
    divergence = _divergence_map(lines, color)
    return sum(
        1 for (_, prefix), options in divergence.items()
        if len(prefix) >= 2 and len(options) >= 2
    )


def classify_user_move(
    matching_lines: list,
    ply_index: int,
    move_played: str,
) -> str:
    """'correct' if move_played matches ANY sibling line's move at
    ply_index — covers transposing into a different known line that shares
    the same prefix. 'unknown' otherwise (no engine in v1)."""
    for line in matching_lines:
        if len(line) > ply_index and line[ply_index] == move_played:
            return "correct"
    return "unknown"
