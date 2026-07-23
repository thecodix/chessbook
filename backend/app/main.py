from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import repertoire, games, users
from app.database import Base, engine, SessionLocal
from app import models  # noqa: F401 — registers models with metadata

app = FastAPI(title="Chessbook API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router,      prefix="/api/users",      tags=["users"])
app.include_router(repertoire.router, prefix="/api/repertoire", tags=["repertoire"])
app.include_router(games.router,      prefix="/api/games",      tags=["games"])


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
        ],
    },
]


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    _seed()


def _seed():
    from datetime import date
    db = SessionLocal()
    try:
        if db.query(models.Opening).count() > 0:
            return
        for od in _SEED:
            opening = models.Opening(
                id=od["id"], name=od["name"],
                color=od["color"], description=od["description"],
            )
            db.add(opening)
            db.flush()
            for i, ld in enumerate(od["lines"]):
                db.add(models.Line(
                    opening_id=od["id"], position=i,
                    label=ld["label"], moves=ld["moves"], idea=ld.get("idea"),
                    retention=od["retention"],
                    next_review=date.today(),
                ))
        db.commit()
    finally:
        db.close()
