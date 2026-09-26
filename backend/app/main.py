import asyncio
import os
import shutil

import chess.engine
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import repertoire, games, users, analysis, problems, endgames, sparring
from app.database import SessionLocal
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
app.include_router(sparring.router,   prefix="/api/sparring",   tags=["sparring"])


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
        "id": "blackmar_diemer", "name": "Blackmar-Diemer Gambit", "color": "white", "retention": 50.0,
        "description": "An active answer to 1...d5: offer the e-pawn for rapid development, open lines, and pressure on the kingside. The repertoire covers Black's accepted defenses, countergambits, and the main ways to decline.",
        "lines": [
            {
                "label": "1. Bogoljubow: immediate g4",
                "moves": ["d4","d5","e4","dxe4","Nc3","Nf6","f3","Bf5","g4","Bg6","g5","Nd5"],
                "idea": "The main attacking setup. Gain space with g4-g5, then develop Nge2 and h4 to keep Black's kingside pieces under pressure.",
            },
            {
                "label": "2. Bogoljubow: Nge2 and h4",
                "moves": ["d4","d5","e4","dxe4","Nc3","Nf6","f3","Bf5","g4","Bg6","Nge2","e6","h4"],
                "idea": "Use Nge2 to support the centre and h4 to challenge the bishop. Castle long only when the centre and Black's tactical resources are under control.",
            },
            {
                "label": "3. Bogoljubow: Bc4 development",
                "moves": ["d4","d5","e4","dxe4","Nc3","Nf6","f3","Bf5","g4","Bg6","Bc4","e6","Nge2"],
                "idea": "Develop toward f7 before committing the king. Bc4 and Nge2 create natural pressure while preserving the option of fxe4.",
            },
            {
                "label": "4. Euwe Defense: Bc4",
                "moves": ["d4","d5","e4","dxe4","Nc3","Nf6","f3","e6","Bc4","Be7","fxe4"],
                "idea": "Against the solid Euwe setup, recover the centre with fxe4 and use Bc4 to make castling and piece coordination awkward for Black.",
            },
            {
                "label": "5. Euwe Defense: Bg5",
                "moves": ["d4","d5","e4","dxe4","Nc3","Nf6","f3","e6","Bg5","Be7","fxe4"],
                "idea": "Pin the knight before recapturing. The point is practical development: castle long only after checking Black's central counterplay.",
            },
            {
                "label": "6. Teichmann Defense",
                "moves": ["d4","d5","e4","dxe4","Nc3","Nf6","f3","Bg4","Bc4","exf3","Nxf3"],
                "idea": "Develop with tempo on f7 and recapture with the knight. White has open lines and a lead in development for the pawn.",
            },
            {
                "label": "7. Ryder Defense: ...c6",
                "moves": ["d4","d5","e4","dxe4","Nc3","Nf6","f3","c6","Bc4","Bf5","fxe4"],
                "idea": "Black supports the centre with ...c6. Bc4 keeps an eye on f7 while fxe4 restores a strong central pawn duo.",
            },
            {
                "label": "8. O'Kelly Defense: ...c5",
                "moves": ["d4","d5","e4","dxe4","Nc3","Nf6","f3","c5","d5","exf3","Nxf3"],
                "idea": "Advance d5 to gain space before recapturing. The knight on f3 develops with tempo and White keeps the initiative.",
            },
            {
                "label": "9. Fianchetto Defense: ...g6",
                "moves": ["d4","d5","e4","dxe4","Nc3","Nf6","f3","g6","Bc4","Bg7","fxe4"],
                "idea": "Complete development quickly and use the centre before Black's fianchetto becomes a defensive asset. Nge2 and O-O-O are natural follow-ups.",
            },
            {
                "label": "10. Hübsch Gambit: accept",
                "moves": ["d4","d5","e4","dxe4","Nc3","Nf6","f3","e5","dxe5","Qxd1+","Kxd1","Nfd7"],
                "idea": "Accept the countergambit. After queens come off, develop calmly with Nxe4 and keep Black from recovering the e5 pawn easily.",
            },
            {
                "label": "11. Lemberger Defense: ...c6",
                "moves": ["d4","d5","e4","c6","Nc3","Nf6","f3","dxe4","fxe4"],
                "idea": "Black delays the capture with ...c6. Recapture with the f-pawn and use the open f-file plus rapid Bc4 and Nf3 development.",
            },
            {
                "label": "12. French Declined: Advance",
                "moves": ["d4","d5","e4","e6","e5","c5","c3","Nc6","Nf3","Qb6","Bd3"],
                "idea": "When Black declines the gambit with ...e6, claim space with e5 and build an Advance French structure. Defend d4 and prepare O-O.",
            },
            {
                "label": "13. Alekhine Move Order",
                "moves": ["d4","Nf6","Nc3","d5","e4","dxe4","f3","exf3","Nxf3"],
                "idea": "Against the 1...Nf6 move order, regain the pawn with the knight and use the lead in development before Black can consolidate.",
            },
            {
                "label": "14. Symmetrical Declined: ...c5",
                "moves": ["d4","d5","e4","c5","exd5","Nf6","Nc3","Nxd5","Nxd5"],
                "idea": "Black challenges the centre instead of accepting. Trade the d-pawn, recapture on d5, and use the open lines to finish development quickly.",
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
        "description": "The main black repertoire against 1.e4: build the French center with ...e6 and ...d5, then choose the right break with ...c5. The plans are deliberately practical: keep the d5 pawn defended, route the kingside knight through e7, and attack the wing where White has castled.",
        "lines": [
            {
                "label": "1. Exchange: solid setup",
                "moves": ["e4","e6","d4","d5","exd5","exd5","Nf3","Bd6","Bd3","Ne7","O-O","O-O","Nc3","c6","Be3","Bf5","Qd2","Nd7"],
                "idea": "Build the solid ...d5 and ...c6 structure. Rook to e8 is the main improving move, followed by ...Nf8 and ...Ng6-e6, or ...b5 and ...a5 when the queenside expansion is safe.",
            },
            {
                "label": "2. Exchange with opposite-side castling",
                "moves": ["e4","e6","d4","d5","exd5","exd5","Bf4","Bd6","Qd2","Ne7","Nc3","c6","O-O-O","O-O","f3","b5","g4","a5","h4","a4","h5","b4","Nce2","b3","a3","bxc2","Kxc2","Ba6","h6","g6"],
                "idea": "White attacks on the kingside after castling long, so race on the queenside with ...b5-b4 and ...a5-a4. The key warning is the d5 pawn: before ...c5, calculate how it will remain defended.",
            },
            {
                "label": "3. Advance: ...Nh6 and ...c5",
                "moves": ["e4","e6","d4","d5","e5","c5","c3","Nc6","Nf3","Qb6","Bd3","cxd4","cxd4","Bd7","Be2","Nh6","Bxh6","Qxb2","Nbd2","gxh6"],
                "idea": "The ...Nh6 route avoids the knight manoeuvre to a3 and keeps the f8 bishop flexible for ...Bb4+. If White does not exchange the knight, continue with ...Nf5.",
            },
            {
                "label": "4. Advance with Be3",
                "moves": ["e4","e6","d4","d5","e5","c5","c3","Nc6","Be3","Qb6","Qd2","Nh6","Bd3","Ng4","Ne2","c4","Bc2","Qxb2"],
                "idea": "Develop the knight through h6-g4 and strike at b2. The advanced c-pawn restricts White's queenside pieces while the queen creates immediate practical pressure.",
            },
            {
                "label": "5. Advance with Be2",
                "moves": ["e4","e6","d4","d5","e5","c5","c3","Nc6","Nf3","Qb6","Be2","cxd4","cxd4","Nh6","O-O","Nf5"],
                "idea": "Against Be2, do not retreat the bishop to d7 first. Play ...Nh6 and reach f5 quickly; if White captures the knight, the queen enters on b2 as in the main idea.",
            },
            {
                "label": "6. Advance with a3",
                "moves": ["e4","e6","d4","d5","e5","c5","c3","Nc6","Nf3","Qb6","a3","Nh6","Bd3","cxd4","O-O","Nf5"],
                "idea": "White prepares b4, so do not release the central tension with an automatic ...cxd4 too early. Develop with ...Nh6-f5; after an exchange on f5, use the bishop on e6 to hold the pawn chain.",
            },
            {
                "label": "7a. Nc3 with Bg5: early exchange",
                "moves": ["e4","e6","d4","d5","Nc3","Nf6","Bg5","dxe4","Nxe4","Be7","Bd3","Nxe4","Bxe7","Qxe7","Bxe4","Qb4+","c3","Qxb2"],
                "idea": "Against Bg5, exchange on e4 immediately. Playing ...Be7 first allows e5 and can leave Black in a difficult position.",
            },
            {
                "label": "7b. Nc3 with Bg5: bishop exchange",
                "moves": ["e4","e6","d4","d5","Nc3","Nf6","Bg5","dxe4","Nxe4","Be7","Bxf6","Bxf6","Nf3","O-O","Nxf6+","Qxf6","Bd3","c5","c3","cxd4"],
                "idea": "The second Bg5 branch also starts with ...dxe4. After the exchanges, ...c5 is the freeing break and the structure remains easy to handle.",
            },
            {
                "label": "8. Nc3 with e5",
                "moves": ["e4","e6","d4","d5","Nc3","Nf6","e5","Nfd7","f4","c5","Nf3","Nc6","Be3","cxd4","Nxd4","Bc5","Nxc6","bxc6"],
                "idea": "Meet the Advance structure with ...c5 and ...Nc6. If White chooses Qd2 instead of Nxc6, simplify with ...Nxd4, ...Bxd4, ...Bxd4, ...Qxd4 and ...Qb6 for an equal endgame.",
            },
            {
                "label": "9a. Nc3 with Bd3",
                "moves": ["e4","e6","d4","d5","Nc3","Nf6","Bd3","c5","Nf3","c4","e5","cxd3","exf6","dxc2","Qxc2","gxf6"],
                "idea": "Against Bd3, play ...c5 immediately. Capturing the final pawn with the g-pawn matters: taking with the queen allows Nxd5 because the c8 bishop is then attacked.",
            },
            {
                "label": "9b. Nc3 with Bd3: early exchange",
                "moves": ["e4","e6","d4","d5","Nc3","Nf6","Bd3","c5","exd5","Nxd5","Nxd5","Qxd5","Nf3","cxd4"],
                "idea": "If White exchanges on d5, recapture with the knight and welcome the simplification. After ...cxd4, develop naturally and Black should have no structural problems.",
            },
            {
                "label": "10a. Tarrasch: central exchanges",
                "moves": ["e4","e6","d4","d5","Nd2","c5","Ngf3","cxd4","Nxd4","Nf6","exd5","Qxd5","Nb5","Qd8","Bd3","a6","Nc3","Nc6"],
                "idea": "The Tarrasch is easy to equalise when White exchanges in the centre. Develop naturally and use the open lines rather than forcing a premature attack.",
            },
            {
                "label": "10b. Tarrasch: queen recaptures",
                "moves": ["e4","e6","d4","d5","Nd2","c5","exd5","exd5","Ngf3","cxd4","Bc4","Qd6"],
                "idea": "When White chooses exd5 or Nf3, meet the position with ...Nf6 if needed and decide which central exchanges favour Black. The queen on d6 can later reposition toward c7.",
            },
            {
                "label": "10c. Tarrasch: ...Qxd5",
                "moves": ["e4","e6","d4","d5","Nd2","c5","exd5","Qxd5","Ngf3","cxd4","Bc4","Qd6"],
                "idea": "After ...Qxd5, develop with ...cxd4 and ...Qd6. Against anything other than exd5 or Nf3, play ...Nf6 and choose the central exchanges that best suit Black.",
            },
        ],
    },
]


@app.on_event("startup")
def startup():
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
