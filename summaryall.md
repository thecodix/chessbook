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
│       ├── main.py             FastAPI app, CORS, startup seed
│       └── routers/
│           ├── users.py        /api/users/*
│           ├── games.py        /api/games/* (import, list, coverage-gaps)
│           └── repertoire.py   /api/repertoire/* (SM-2 spaced repetition)
└── frontend/
    └── src/
        ├── App.jsx             Auth state, topbar, screen routing
        ├── screens/
        │   ├── Login.jsx       Sign in / Create account
        │   ├── Dashboard.jsx   Heatmap, due lines, coverage gaps
        │   ├── Import.jsx      Chess.com import + analytics (ELO chart, results by month)
        │   ├── Study.jsx       Repertoire browser
        │   └── Train.jsx       Drill mode
        └── utils/
            ├── api.js          All backend calls + auth token management
            ├── chess.js        Move gen, FEN, attack maps (simplified — no en passant)
            └── chesscom.js     Chess.com parser + MOCK_GAMES fallback
```

---

## ROADMAP — what's left

### High priority (core training loop)
- [ ] **SM-2 spaced repetition UI** — `Train.jsx` exists but isn't wired to
  `GET /api/repertoire/due` or `POST /api/repertoire/{id}/review`. The backend
  logic is complete; just needs the frontend drill flow.
- [ ] **Clickable deviation heatmap** — Dashboard board shows hot squares but
  clicking a square should filter the "Recent deviations" list to games
  where you deviated on that square.
- [ ] **Unified Repertoire/Train layout** — board always visible in the same
  chrome for both Study and Drill modes (currently separate screens).

### Coverage gaps follow-up
- [ ] **First-move gaps for Black openings** — current algorithm starts
  recording after your first move, so "opponent played 1.d4 and you have no
  Sicilian for it" isn't flagged yet. Need a separate pass at depth-0.
- [ ] **Line coverage gaps in Repertoire screen** — show uncovered opponent
  responses inline next to each line, not just on the Dashboard.
- [ ] **User rating update UI** — `PATCH /api/users/me/rating` exists but there's
  no settings page to call it. Add a small rating input in the topbar or a
  settings modal.

### Personalization
- [ ] **Opponent model** — after N imports, show which moves your real opponents
  play and how often you deviate against each specific opponent.
- [ ] **Pre-game prep** — given an opponent's Chess.com username, pull their
  recent games, surface which of your lines they're most likely to face you with.

### Infrastructure
- [ ] **chess.js** — `src/utils/chess.js` is a simplified move generator (no
  en passant, castling rights, pin detection). Replace with the `chess.js` npm
  package for correctness in Study/Train screens.
- [ ] **Stockfish server-side** — on deviation, return engine's top line + short
  explanation of why the repertoire move is better.
- [ ] **User-scoped repertoire** — currently all users share the same seeded
  openings. Each user should have their own repertoire they can add/remove lines from.
- [ ] **Wire Chess.com username to user profile** — when user imports games in
  the Import screen, auto-save the Chess.com username to `users.chesscom_username`
  so it persists across sessions without localStorage.
- [ ] **JWT_SECRET env var** — set a real secret in `docker-compose.yml` or a
  `.env` file for production. Default is `dev-secret-change-in-production`.
- [ ] **Frequency cache TTL** — `frequency_cache` rows never expire. Add a
  `fetched_at` check (e.g. refresh after 30 days) for long-running deployments.

### UI / UX
- [ ] **Unified color scheme** — board squares should match the dark UI palette.
- [ ] **Mobile layout** — currently desktop-only.
- [ ] **Settings page** — rating, Chess.com username, time control preference
  for Lichess frequency queries.
