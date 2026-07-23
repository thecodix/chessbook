# Chessbook Roadmap

## Infrastructure
- [ ] Persist repertoire to PostgreSQL (openings, lines, moves)
- [ ] Persist imported games to PostgreSQL
- [ ] Wire user auth (skeleton already in `users.py`)

## Core Training Loop
- [ ] SM-2 / FSRS spaced repetition — each line gets a due date
- [ ] "Lines due today" widget on Dashboard
- [ ] **Unified Repertoire + Train layout** — board always visible, same chrome for study and drill
- [x] Opening/line strategic descriptions and goals ← done below

## Analysis
- [ ] Deviation heatmap — board overlay showing which squares you go wrong on most, click to see games
- [ ] Stockfish server-side — on deviation, return engine top line + short explanation of why repertoire move is better
- [ ] Line coverage gaps — detect opponent responses you have no line for and flag them

## Personalization
- [ ] Opponent model — after N imports, show which moves your real opponents play and how often you deviate against each
- [ ] Pre-game prep — given an opponent username, pull their games, surface which of your lines they're most likely to face you with

## UI / UX
- [x] Responsive board (ResizeObserver)
- [x] Full Chess.com import info (ratings, accuracy, end reason, game link)
- [ ] Unified color scheme (board squares match UI palette)
- [ ] Unified Repertoire / Train layout (same sidebar + board + panel)
- [ ] Mobile layout
