# Chessbook Roadmap

## Infrastructure
- [x] Persist repertoire to PostgreSQL (openings, lines, moves)
- [x] Persist imported games to PostgreSQL
- [x] Wire user auth (JWT + bcrypt, `users.py`)
- [x] `JWT_SECRET` configurable via env / `.env` file (see `.env.example`)
- [x] Frequency cache TTL — `frequency_cache` rows refresh after 30 days
- [ ] User-scoped repertoire — currently all users share the same seeded openings
- [x] Replace `frontend/src/utils/chess.js` (simplified move generator, no en
  passant/castling rights/pins) with the `chess.js` npm package — `Board.jsx`
  and `Study.jsx` now use FEN + SAN throughout, so castling, en passant,
  promotion and pins are handled correctly

## Core Training Loop
- [x] SM-2 spaced repetition — each line has a due date (`repertoire.py` `_sm2`)
- [x] "Lines due today" widget on Dashboard
- [x] SM-2 review UI wired end-to-end — `Study.jsx` drills a line, then shows
  Again/Hard/Good/Easy buttons that call `POST /api/repertoire/{id}/review`
  and update retention/interval locally
- [x] Opening/line strategic descriptions and goals
- [x] **Unified Repertoire + Train layout** — `Study.jsx` handles both study
  and drill in one screen/board/panel. Legacy `Train.jsx` and
  `screens/Repertoire.jsx` deleted (unused, superseded by `Study.jsx`).
- [x] "Start review session" button on Dashboard passes the first due line to
  the Study screen, which auto-selects it and jumps straight into drill mode.

## Analysis
- [x] Deviation heatmap — board overlay showing which squares you go wrong on
  most; **now clickable** — clicking a square filters "Recent deviations" to
  games where you deviated on that square
- [x] Line coverage gaps — detects opponent responses you have no line for,
  with Lichess Explorer frequency comparison (`games.py` `coverage-gaps`)
- [x] First-move gaps for Black openings — added a root-level
  "Black repertoire — opponent's 1st move" entry so e.g. "opponent played
  1.d4 and you have no Black opening for it" is now flagged (previously the
  per-opening analysis silently filtered these out)
- [ ] Line coverage gaps shown inline in the Repertoire/Study screen next to
  each line (currently Dashboard-only)
- [x] Stockfish server-side — `GET /api/analysis/deviation/{game_id}` runs the
  engine (via `python-chess`'s `chess.engine`, Stockfish installed in the
  backend Docker image) on the pre-deviation position plus the expected and
  played moves, and returns an eval delta + tiered explanation. Wired up as
  an "Ask Stockfish" expandable panel on each deviation card in `Dashboard.jsx`.

## Personalization
- [ ] Opponent model — after N imports, show which moves your real opponents
  play and how often you deviate against each
- [ ] Pre-game prep — given an opponent username, pull their games, surface
  which of your lines they're most likely to face you with
- [x] Chess.com username now auto-saved to the user profile
  (`PATCH /api/users/me/chesscom-username`) after a successful import, so it
  persists across sessions/devices instead of only living in `localStorage`

## UI / UX
- [x] Responsive board (ResizeObserver)
- [x] Full Chess.com import info (ratings, accuracy, end reason, game link)
- [x] Rating settings UI — click your rating in the topbar to edit it inline
  (`PATCH /api/users/me/rating`)
- [ ] Unified color scheme (board squares match UI palette)
- [ ] Mobile layout
