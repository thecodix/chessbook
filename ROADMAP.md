# Chessbook Roadmap

## Infrastructure
- [x] Persist repertoire to PostgreSQL (openings, lines, moves)
- [x] Persist imported games to PostgreSQL
- [x] Wire user auth (JWT + bcrypt, `users.py`)
- [x] `JWT_SECRET` configurable via env / `.env` file (see `.env.example`)
- [x] Frequency cache TTL — `frequency_cache` rows refresh after 30 days
- [ ] User-scoped repertoire — currently all users share the same seeded openings
- [ ] Replace `frontend/src/utils/chess.js` (simplified move generator, no en
  passant/castling rights/pins) with the `chess.js` npm package

## Core Training Loop
- [x] SM-2 spaced repetition — each line has a due date (`repertoire.py` `_sm2`)
- [x] "Lines due today" widget on Dashboard
- [x] SM-2 review UI wired end-to-end — `Study.jsx` drills a line, then shows
  Again/Hard/Good/Easy buttons that call `POST /api/repertoire/{id}/review`
  and update retention/interval locally
- [x] Opening/line strategic descriptions and goals
- [ ] **Unified Repertoire + Train layout** — done in practice: `Study.jsx` now
  handles both study and drill in one screen/board/panel. `Train.jsx` and
  `screens/Repertoire.jsx` are legacy, unused (not imported by `App.jsx`) and
  can be deleted once confirmed nothing else needs them.
- [ ] "Start review session" button on Dashboard just switches to the
  Repertoire screen — it doesn't yet auto-select the first due line/opening.

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
- [ ] Stockfish server-side — on deviation, return engine top line + short
  explanation of why repertoire move is better

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
