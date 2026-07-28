import asyncio
import os
import shutil

import chess.engine
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import repertoire, games, users, analysis, problems, endgames
from app.database import Base, engine, SessionLocal
from app import models  # noqa: F401 — registers models with metadata

app = FastAPI(title="Chessbook API", version="0.1.0")

_cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router,      prefix="/api/users",      tags=["users"])
app.include_router(repertoire.router, prefix="/api/repertoire", tags=["repertoire"])
app.include_router(games.router,      prefix="/api/games",      tags=["games"])
app.include_router(analysis.router,   prefix="/api/analysis",   tags=["analysis"])
app.include_router(problems.router,   prefix="/api/problems",   tags=["problems"])
app.include_router(endgames.router,   prefix="/api/endgames",   tags=["endgames"])


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ── Seed data ─────────────────────────────────────────────────────────────────

_SEED = [
    {
        "id": "london", "name": "London System", "color": "white", "retention": 88.0,
        "description": "Solid, low-theory setup. Control d4 with Bf4 before Black can challenge it. The goal is a stable pawn structure (d4+e3+c3) that lets you outplay opponents positionally without memorising long forced lines. Works against almost everything Black plays.",
        "lines": [
            {
                "label": "Main line",
                "moves": ["d4","d5","Bf4","Nf6","e3","e6","Nf3","Be7","Bd3","O-O"],
                "idea": "Complete development with Bd3, Nbd2, O-O, and look to expand with c4 or e4 once your pieces are coordinated.",
            },
            {
                "label": "vs KID setup",
                "moves": ["d4","Nf6","Bf4","e6","e3","b6","Nf3","Bb7","Bd3","c5"],
                "idea": "Black fianchettoes the bishop. Stay solid — let Black commit before you react. Bd3 covers the h7 diagonal and eyes a future kingside attack.",
            },
            {
                "label": "vs c5 sideline",
                "moves": ["d4","d5","Bf4","c5","e3","Nc6","Nf3","Qb6","Qc1"],
                "idea": "Qc1 defends b2 without blocking development and keeps tension in the center. Don't trade on c5 yet; maintain the pawn on d4.",
            },
            {
                "label": "vs Queen's Indian setup",
                "moves": ["d4","Nf6","Bf4","e6","Nf3","b6","e3","Bb7","Bd3","Be7"],
                "idea": "Black fianchettoes on b7 instead. Keep developing normally — Nbd2, O-O, c4 when ready — the Bf4/Bd3 pair covers the long diagonal's key squares.",
            },
            {
                "label": "vs Grünfeld-style g6",
                "moves": ["d4","Nf6","Bf4","g6","Nf3","Bg7","e3","O-O","Be2","d5"],
                "idea": "Black fianchettoes and strikes with ...d5. Stay flexible with Be2 instead of Bd3 here, castle, and meet ...d5 with c4 to challenge the center.",
            },
            {
                "label": "vs Dutch Defense",
                "moves": ["d4","f5","Bf4","Nf6","Nf3","e6","e3","d5","Bd3","c5"],
                "idea": "Bf4 is already well placed against the Dutch's light squares. Trade on c5 or push e3-based development; Black's dark-squared bishop is often bad here.",
            },
        ],
    },
    {
        "id": "italian", "name": "Italian Game", "color": "white", "retention": 71.0,
        "description": "Classic open-game development. Place the bishop on c4 to target f7 and control the center. Rich middlegame positions with clear plans — ideal for building attacking intuition.",
        "lines": [
            {
                "label": "Giuoco Piano",
                "moves": ["e4","e5","Nf3","Nc6","Bc4","Bc5","c3","Nf6","d4"],
                "idea": "Seize the center with d4, castle kingside, use the open d-file to create pressure. Piece activity beats pawn structure here.",
            },
            {
                "label": "Slow Italian",
                "moves": ["e4","e5","Nf3","Nc6","Bc4","Nf6","d3","Bc5"],
                "idea": "Sidestep sharp theory with d3. Develop with Nc3, O-O, then decide between a kingside attack (f4) or a central break (d4) based on what Black does.",
            },
            {
                "label": "Two Knights / Fried Liver",
                "moves": ["e4","e5","Nf3","Nc6","Bc4","Nf6","Ng5","d5","exd5","Nxd5","Nxf7","Kxf7"],
                "idea": "The sharpest try in the whole repertoire. After Nxf7 Kxf7 you're only a pawn up in material terms but Black's king is stuck in the center — follow up with Qf3+ and Nc3 to keep it there.",
            },
            {
                "label": "Evans Gambit",
                "moves": ["e4","e5","Nf3","Nc6","Bc4","Bc5","b4","Bxb4","c3","Ba5"],
                "idea": "Give up a pawn for a big center and a full tempo of development. Follow with d4, O-O, and Qb3 to pile pressure on f7 before Black untangles.",
            },
            {
                "label": "vs Hungarian Defense",
                "moves": ["e4","e5","Nf3","Nc6","Bc4","Be7","d4","d6","O-O","Nf6"],
                "idea": "Black plays passively to dodge theory. Just take the full center and expand — dxe5 or c3+d5 later gives a comfortable, low-risk edge.",
            },
        ],
    },
    {
        "id": "sicilian", "name": "Sicilian Dragon", "color": "black", "retention": 91.0,
        "description": "Double-edged and uncompromising. Black gives up central symmetry for dynamic counterplay on the queenside and the long diagonal. Both sides castle on opposite wings and race to attack.",
        "lines": [
            {
                "label": "Dragon setup",
                "moves": ["e4","c5","Nf3","d6","d4","cxd4","Nxd4","Nf6","Nc3","g6"],
                "idea": "Fianchetto to g7 to dominate the long diagonal. Plan: O-O, Nc6, a5-a4 queenside expansion. In sharp lines every tempo counts.",
            },
            {
                "label": "Accelerated Dragon",
                "moves": ["e4","c5","Nf3","Nc6","d4","cxd4","Nxd4","g6","Nc3","Bg7"],
                "idea": "Reach the Dragon structure without d6, keeping ...d5 as a one-move threat. Avoids the Yugoslav Attack entirely.",
            },
            {
                "label": "Yugoslav Attack",
                "moves": ["e4","c5","Nf3","d6","d4","cxd4","Nxd4","Nf6","Nc3","g6","Be3","Bg7","f3","O-O"],
                "idea": "The critical main theoretical battle. White is about to castle long and storm h4-h5; race back with ...Nc6, ...a5-a4, ...Rc8 and trade off White's dark-squared bishop when possible.",
            },
            {
                "label": "vs Classical (Be2) setup",
                "moves": ["e4","c5","Nf3","d6","d4","cxd4","Nxd4","Nf6","Nc3","g6","Be2","Bg7","O-O","O-O"],
                "idea": "A quieter try — both sides castle short. Play naturally with ...Nc6, ...Bd7/...Rc8, and look for a central ...d5 break once fully developed.",
            },
            {
                "label": "vs Levenfish Attack",
                "moves": ["e4","c5","Nf3","d6","d4","cxd4","Nxd4","Nf6","Nc3","g6","f4","Bg7","Nf3","O-O"],
                "idea": "White grabs extra space with an early f4 instead of the standard setup. Continue normal development and hit back at e4 with ...Nc6/...Qb6 before White consolidates.",
            },
        ],
    },
    {
        "id": "carokann", "name": "Caro-Kann", "color": "black", "retention": 38.0,
        "description": "Solid and principled reply to 1.e4. Black supports d5 with c6 before committing, leading to a healthy pawn structure. Ideal if you want to avoid sharp theory while fighting for equality.",
        "lines": [
            {
                "label": "Classical",
                "moves": ["e4","c6","d4","d5","Nc3","dxe4","Nxe4","Bf5"],
                "idea": "Bf5 is the critical move — activate the bishop before it gets locked in. Focus on Nf6, e6, Be7 development with good endgame prospects.",
            },
            {
                "label": "Advance Variation",
                "moves": ["e4","c6","d4","d5","e5","Bf5","Nf3","e6","Be2","c5"],
                "idea": "Get the light-squared bishop out before playing ...e6. Challenge the center immediately with ...c5, then develop with ...Nc6/...Nge7 or ...Qb6.",
            },
            {
                "label": "Exchange Variation",
                "moves": ["e4","c6","d4","d5","exd5","cxd5","Bd3","Nc6","c3","Nf6"],
                "idea": "A symmetrical structure that's easy to equalize in. Develop naturally and watch for White's minority attack on the queenside — meet it with ...b5/...a5 counterplay.",
            },
            {
                "label": "Panov-Botvinnik Attack",
                "moves": ["e4","c6","d4","d5","exd5","cxd5","c4","Nf6","Nc3","e6"],
                "idea": "White gets an IQP structure similar to a QGD Exchange. Develop with ...Be7, ...O-O, ...b6, and target the isolated d4 pawn as pieces come off.",
            },
        ],
    },
    {
        "id": "french", "name": "French Defense", "color": "black", "retention": 62.0,
        "description": "Fight for the center with e6+d5. Black accepts a slightly cramped position in exchange for a rock-solid structure and clear counterplay plans.",
        "lines": [
            {
                "label": "Advance variation",
                "moves": ["e4","e6","d4","d5","Nc3","Nf6","e5","Nfd7","f4"],
                "idea": "Plan: c5 to attack d4, Nc6 to pressure the chain, castle queenside if possible. The knight on d7 reroutes to b6 to pressure d4.",
            },
            {
                "label": "Tarrasch Variation",
                "moves": ["e4","e6","d4","d5","Nd2","Nf6","e5","Nfd7","Bd3","c5"],
                "idea": "Challenge d4 right away with ...c5. Follow with ...Nc6/...Qb6/...cxd4 to open lines before White finishes regrouping the knight from d2.",
            },
            {
                "label": "Exchange Variation",
                "moves": ["e4","e6","d4","d5","exd5","exd5","Nf3","Nf6","Bd3","Bd6"],
                "idea": "A symmetrical, open position — Black equalizes fully. Prioritize fast, natural development and don't fear simplification into an equal endgame.",
            },
            {
                "label": "Winawer Variation",
                "moves": ["e4","e6","d4","d5","Nc3","Bb4","e5","c5","a3","Bxc3"],
                "idea": "The sharpest main line. Give up the bishop pair to damage White's queenside pawns (doubled c-pawns), then pressure d4/c3 with ...Ne7, ...Qc7, ...Nbc6.",
            },
        ],
    },
]


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    _seed()


@app.on_event("startup")
async def startup_stockfish():
    app.state.stockfish = None
    app.state.stockfish_lock = asyncio.Lock()
    path = os.getenv("STOCKFISH_PATH") or shutil.which("stockfish") or "/usr/games/stockfish"
    try:
        _, uci_engine = await chess.engine.popen_uci(path)
        app.state.stockfish = uci_engine
    except Exception as exc:  # binary missing, unreadable, etc. — analysis endpoint returns 503
        print(f"Stockfish engine unavailable at '{path}' ({exc}); deviation analysis disabled.")


@app.on_event("shutdown")
async def shutdown_stockfish():
    uci_engine = getattr(app.state, "stockfish", None)
    if uci_engine:
        await uci_engine.quit()


def _seed():
    """Idempotent catalog upsert: safe to re-run after _SEED gains new
    openings/lines. Matches Openings by id and Lines by label-within-opening;
    updates catalog content (moves/idea/description) in place and inserts
    anything new, but never touches an existing Line's SM-2 progress fields.
    """
    from datetime import date
    db = SessionLocal()
    try:
        for od in _SEED:
            opening = db.query(models.Opening).filter_by(id=od["id"]).first()
            if opening is None:
                opening = models.Opening(
                    id=od["id"], name=od["name"],
                    color=od["color"], description=od["description"],
                )
                db.add(opening)
                db.flush()
            else:
                opening.name = od["name"]
                opening.color = od["color"]
                opening.description = od["description"]

            existing_lines = {line.label: line for line in opening.lines}
            for i, ld in enumerate(od["lines"]):
                line = existing_lines.get(ld["label"])
                if line is None:
                    db.add(models.Line(
                        opening_id=od["id"], position=i,
                        label=ld["label"], moves=ld["moves"], idea=ld.get("idea"),
                        retention=od["retention"],
                        next_review=date.today(),
                    ))
                else:
                    line.position = i
                    line.moves = ld["moves"]
                    line.idea = ld.get("idea")
        db.commit()
    finally:
        db.close()
