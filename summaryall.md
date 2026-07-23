# Chessbook — Session Summary

## How to run

```bash
cd chessbook

# First time or after adding deps (chess, bcrypt): rebuild backend image
docker compose build backend

# Start everything
docker compose up

# App:      http://localhost:5173
# API docs: http://localhost:8000/docs
```

If the frontend shows stale module errors after code changes, restart Vite:
```bash
docker compose restart frontend
```

If you add a new Python dependency, install it live in the running container
while developing (no full rebuild needed):
```bash
docker exec chessbook-backend-1 pip install <pkg>
```
Then add it to `backend/pyproject.toml` so the next image build bakes it in.

---

## Test account

| Field | Value |
|---|---|
| Username | `testuser` |
| Password | `chess1234` |
| Rating | 1500 |
| Chess.com username | *(not set — enter in Import screen)* |

---

## What was built this session

### Authentication (`/backend/app/auth.py`, `routers/users.py`)
- JWT tokens (30-day expiry, HS256, secret from `JWT_SECRET` env var)
- bcrypt password hashing (using `bcrypt` library directly — passlib 1.7 is
  incompatible with bcrypt ≥ 4.0 at startup detection, so passlib was removed)
- Routes: `POST /api/users/register`, `POST /api/users/login`,
  `GET /api/users/me`, `PATCH /api/users/me/rating`
- `get_current_user` / `get_optional_user` FastAPI dependencies
- Login screen (`frontend/src/screens/Login.jsx`) with Sign in / Create account
  tabs and a rating slider (800–2500) shown on register

### Database models (`/backend/app/models.py`)
Two new tables auto-created on startup:

| Table | Purpose |
|---|---|
| `users` | Chessbook accounts — `username`, `hashed_password`, `chesscom_username`, `platform_rating` |
| `frequency_cache` | Lichess Explorer results keyed by `(fen, ratings_key, speeds_key)` — fetched once, stored forever |

### Coverage gaps (`/backend/app/routers/games.py`)
- `GET /api/games/coverage-gaps?username=<chess.com user>&limit=300`
- Replays each imported game move-by-move against all repertoire lines
- At every opponent-to-move position where your moves stayed on-book, records
  what the opponent played and whether it's covered by a line
- Returns frequency as `count / total_at_that_position` → shown as "1 in N"
- **Lichess Explorer integration**: for each unique board position (FEN),
  queries `explorer.lichess.ovh/lichess` with `speeds=blitz,rapid` and
  rating buckets derived from the logged-in user's `platform_rating`
- **Two-level cache**: process-level dict (instant, lives until restart) +
  `frequency_cache` table (survives restarts, never re-fetches the same position)
- Rating → Lichess bucket mapping: finds 3 nearest buckets from
  `[1000,1200,1400,1600,1800,2000,2200,2500]`

### Frontend wiring (`/frontend/src/`)
| File | Change |
|---|---|
| `utils/api.js` | Full rewrite — Bearer token on all requests, 401 fires `chessbook:logout` event, exports `login`, `register`, `getMe`, `updateRating` |
| `screens/Login.jsx` | New — auth screen with mode tabs, rating slider, Chess.com username pre-fill |
| `App.jsx` | Auth state: `getMe()` on mount to restore session; login screen when `user === null`; username + rating in topbar; logout button |
| `screens/Dashboard.jsx` | `CoverageGaps` receives `user` prop; card header shows `"Lichess ~1500"` band |

### Coverage gaps display (Dashboard)
Each opening shows branch points like:
```
After 1.d4:
  ✓ d5    you 1 in 2  · ~1500 1 in 3   main    Main line · vs c5 sideline
  ✓ Nf6   you 1 in 3  · ~1500 1 in 4   main    vs KID setup
  ✗ e5    you 1 in 9  · ~1500 1 in 40  secondary  unprepared
  ✗ f5    you <2%     · ~1500 <2%                 unprepared
```
- **main** (≥1 in 3): red badge if gap, green if covered
- **secondary** (1 in 4–10): amber badge if gap
- **rare** (<1 in 11): dimmed

---

## Architecture overview

```
chessbook/
├── docker-compose.yml          postgres + backend + frontend
├── backend/
│   ├── pyproject.toml          deps: fastapi, httpx, sqlalchemy, chess, bcrypt, python-jose
│   └── app/
│       ├── auth.py             JWT + bcrypt helpers + FastAPI deps
│       ├── models.py           Opening, Line, Game, User, FrequencyCache
│       ├── database.py         SQLAlchemy engine (DATABASE_URL env var)
│       ├── main.py             FastAPI app, CORS, startup seed, Stockfish engine lifecycle
│       └── routers/
│           ├── users.py        /api/users/*
│           ├── games.py        /api/games/* (import, list, coverage-gaps)
│           ├── repertoire.py   /api/repertoire/* (SM-2 spaced repetition)
│           └── analysis.py     /api/analysis/* (Stockfish deviation analysis)
└── frontend/
    └── src/
        ├── App.jsx             Auth state, topbar, screen routing
        ├── screens/
        │   ├── Login.jsx       Sign in / Create account
        │   ├── Dashboard.jsx   Heatmap, due lines, coverage gaps, Ask Stockfish
        │   ├── Import.jsx      Chess.com import + analytics (ELO chart, results by month)
        │   └── Study.jsx       Repertoire browser + drill mode (unified)
        └── utils/
            ├── api.js          All backend calls + auth token management
            ├── chess.js        Thin wrapper around the `chess.js` npm package
            └── chesscom.js     Chess.com parser + MOCK_GAMES fallback
```

---

## ROADMAP — what's left

See [ROADMAP.md](./ROADMAP.md) for the up-to-date, checked-off list. Summary of
this session's autonomous pass:

### Done this session
- [x] Confirmed SM-2 review UI is fully wired — `Study.jsx` (used as the
  "Repertoire" screen) drills a line then posts Again/Hard/Good/Easy to
  `POST /api/repertoire/{id}/review`. `Train.jsx` and `screens/Repertoire.jsx`
  turned out to be superseded/unused leftovers (not imported by `App.jsx`).
- [x] `JWT_SECRET` now configurable via `.env` (see `.env.example`) instead of
  only the hardcoded dev default.
- [x] `frequency_cache` rows now expire after 30 days and are refreshed.
- [x] First-move coverage gaps for Black openings — new root-level
  "Black repertoire — opponent's 1st move" block flags e.g. "opponent played
  1.d4 and you have no Black opening for it".
- [x] Chess.com username is now persisted to the user's profile
  (`PATCH /api/users/me/chesscom-username`) after a successful import.
- [x] Deviation heatmap on the Dashboard is now clickable — filters "Recent
  deviations" to games that deviated on the clicked square.
- [x] Rating is now editable inline from the topbar
  (`PATCH /api/users/me/rating`), no more settings-page dependency for that.

### Still open (high priority)
- [ ] User-scoped repertoire — all users currently share the same seeded
  openings; no per-user CRUD yet.
- [ ] Line coverage gaps inline in the Study/Repertoire screen (currently only
  on the Dashboard).

### Still open (lower priority)
- [ ] Opponent model, pre-game prep (personalization features).
- [ ] Unified color scheme, mobile layout.

### Done in the second session (chess.js + Stockfish pass)
- [x] Replaced the hand-rolled move generator in `utils/chess.js` with the
  `chess.js` npm package — `Board.jsx` and `Study.jsx` now work off FEN
  strings + SAN comparison (`stripSan`), so castling, en passant, promotion
  and pins are handled correctly (previously broken/unsupported).
- [x] `Board.jsx` accepts a `fen` prop and derives the grid/attack maps/legal
  moves from it via chess.js, calling `onMove({ san, fen, from, to })`
  instead of raw coordinates.
- [x] Deleted dead code: `screens/Train.jsx`, `screens/Repertoire.jsx` and
  `hooks/useStockfish.js` (client-side WebWorker engine, superseded by the
  new server-side Stockfish endpoint).
- [x] "Start review session" on the Dashboard now passes the first due line
  to `Study.jsx`, which auto-selects it and jumps straight into drill mode.
- [x] Stockfish server-side — new `GET /api/analysis/deviation/{game_id}`
  endpoint (`analysis.py`) replays the game up to the deviation with
  `python-chess`, runs the engine on the pre-deviation position plus the
  expected/played moves, and returns an eval delta + tiered explanation.
  Engine binary installed via `apt-get install stockfish` in `Dockerfile`;
  lifecycle managed with `chess.engine.popen_uci` in `main.py` startup/
  shutdown hooks (falls back to a 503 if the binary isn't found). Wired up
  as an "Ask Stockfish" expandable panel on each deviation card.
