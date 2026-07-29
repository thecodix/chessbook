# Endgame Algorithms Mode — Design

## Summary

Add a second mode to the Endgames screen: **Algorithms** — live-engine checkmate-technique drills, alongside the existing **Puzzles** mode (scripted Lichess tactics, unchanged). The first algorithm is the classic **two-bishops checkmate** (K+B+B vs. lone K), with three starting positions at increasing distance from the mating net. The user always plays the mating side (White); the lone king is played by the strongest Stockfish setting the server offers, replying live to every move — there is no scripted solution to match against.

## Goals

- Let the user practice actually *executing* a checkmate technique against a real, resisting opponent, not just recalling one correct move.
- Reuse everything the app already has: the shared `Board` component, the server's existing persistent Stockfish process, the existing `EndgameProgress` per-user tracking model, the existing Vitest/pytest harnesses.
- Keep the data model open to future techniques (K+Q vs K, K+R vs K, etc.) without code changes — adding one is just new JSON entries.

## Non-Goals (v1)

- Hints. There's no single "correct move" to hint toward against a live opponent — out of scope for this pass.
- Any technique other than the two-bishops mate. The data model supports more; only three bishop positions ship now.
- Server-side move legality validation. Exactly like every other screen in this app (Study, Endgames puzzles, Sparring), the client's chess.js is trusted to only ever produce legal moves; the backend only reasons about chess logic that actually requires it (terminal-state detection, asking Stockfish for its reply).
- Threefold-repetition draw detection. See "Draw detection" below for why this doesn't matter for this specific piece configuration.

## Data

New static file, `frontend/public/algorithms.json`, mirroring `endgames.json`'s shape:

```json
{
  "categories": [
    {
      "id": "bishop-mate",
      "title": "Two Bishops Checkmate",
      "positions": [
        { "id": "bishop-1", "label": "Bishops beside the king", "fen": "4k3/8/8/3BBK2/8/8/8/8 w - - 0 1" },
        { "id": "bishop-2", "label": "King already in the corner", "fen": "8/8/6k1/8/6BB/6K1/8/8 w - - 0 1" },
        { "id": "bishop-3", "label": "Starting from the back rank", "fen": "3k4/8/8/8/8/8/8/B2K1B2 w - - 0 1" }
      ]
    }
  ]
}
```

Each position has no scripted `moves` array (unlike `endgames.json`'s puzzles) — there's nothing to script against a live opponent. `id` values (`bishop-1`, etc.) double as the `puzzle_id` sent to the existing `EndgameProgress` endpoints, so progress tracking needs zero backend schema changes.

## Backend

### New endpoint: `POST /api/endgames/engine-move`

```python
class EngineMoveIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    fen: str

class EngineMoveOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    status:      str            # "in_progress" | "checkmate" | "stalemate" | "draw"
    engine_move: Optional[str]  # SAN, None if the game already ended before the engine had to move
    fen:         Optional[str]  # resulting FEN after the engine's move; None if already terminal
```

Requires `Depends(get_current_user)`, same as every other endpoint in the app.

**Logic**, given `body.fen` (the position *after* the user's move — client sends this, same pattern as every other screen):

1. Parse into a `chess.Board`.
2. Classify the position via a pure helper (see Testing below):
   - `board.is_checkmate()` → `status="checkmate"`, `engine_move=None`, `fen=None`. (The user just delivered mate — nothing more to do.)
   - `board.is_stalemate()` → `status="stalemate"`, same nulls.
   - `board.is_seventyfive_moves()` → `status="draw"`, same nulls.
   - Otherwise: continue to step 3.
3. Reuse `request.app.state.stockfish` / `request.app.state.stockfish_lock` (already managed by `main.py`'s `startup_stockfish`, already consumed by `analysis.py`) — 503 if unavailable, matching `analysis.py`'s existing check.
4. `await engine_proc.play(board, chess.engine.Limit(depth=DEEP_DEPTH))` — a materially deeper/slower limit than `analysis.py`'s `ANALYSIS_TIME = 0.5` quick-eval setting, since this endpoint is asking the engine to actually *play*, at the server's strongest available setting ("the deepest Stockfish"). Exact depth/time value is an implementation-time tuning decision, not a design constraint — anything clearly deeper than the existing 0.5s analysis budget satisfies the intent.
5. Push the engine's move. Re-run the same classification on the resulting position (defensive — a bare king can't check/mate/stalemate White in this specific piece configuration, but the check costs nothing and doesn't assume that invariant holds if this endpoint is ever reused for a different technique later).
6. Return `status` (from step 5, or `"in_progress"` if nothing terminal), `engine_move` (SAN), `fen` (resulting FEN).

### Draw detection

With no pawns and no possible captures (a lone king cannot capture a bishop it can never legally move onto safely against a king it's fleeing, and White never has anything worth losing), the halfmove clock embedded in the FEN's own 5th field increments on *every* move — so `is_seventyfive_moves()` is a complete, correct, stateless check for this piece configuration. Threefold repetition is the only draw type a stateless design can't see (no history), but it isn't a realistic path to a draw here: repeating a position three times while a lone king merely evades chase does not on its own end the game early enough to matter before the 75-move counter would anyway, and this drill's entire pedagogical point is teaching the user to close the net progressively, not to actually get stuck long enough to matter. Not implementing it is a deliberate scope decision, not an oversight.

### Progress

No changes. Frontend calls the existing `POST /api/endgames/progress/{puzzle_id}` with `puzzle_id="bishop-1"` etc. when `status="checkmate"` comes back, exactly like the existing puzzle flow's `markProgress`.

## Frontend

### File structure

- Extract the current contents of `frontend/src/screens/Endgames.jsx` (puzzle-solving logic, unchanged) into `frontend/src/screens/EndgamePuzzles.jsx` — a pure rename/move, no behavior change.
- `Endgames.jsx` becomes a thin (~30-line) mode dispatcher: a "Puzzles" / "Algorithms" toggle at the top, rendering `EndgamePuzzles` or the new `EndgameAlgorithms` beneath it. `App.jsx`'s existing `{screen === 'endgames' && <Endgames />}` branch is untouched — the toggle lives inside the screen, not the app-level nav.
- New `frontend/src/screens/EndgameAlgorithms.jsx` for the live-engine mode.
- New `frontend/src/utils/algorithmState.js` — a pure reducer for the live-engine session state machine, following the exact pattern `sparringState.js` established: `idle → awaiting-move → thinking → (checkmate | failed) `, fully unit-testable without rendering anything.

### `algorithmState.js` states

- `idle` — category/position picker shown, no board.
- `awaiting-move` — board interactive, user to move.
- `thinking` — board locked, waiting on `POST /api/endgames/engine-move`.
- `checkmate` — success; show a celebration (adapt the existing `SolvedModal` pattern), call `updateEndgameProgress(positionId, true)`.
- `failed` — stalemate or draw; show a specific, named explanation (stalemate ≠ generic draw — this drill exists precisely to teach avoiding stalemate, so say so), with a retry action that resets to the same starting FEN.

Error handling is built into the reducer/component from the start (an `error` field surfaced as a visible message on a failed API call, with the board rolled back to interactive) — Sparring mode needed a fix round to retrofit this; this design specifies it up front.

### API client

One new function in `frontend/src/utils/api.js`:

```javascript
export const getEngineMove = (fen) =>
  req('/endgames/engine-move', { method: 'POST', body: JSON.stringify({ fen }) })
```

### Flow

1. User picks a position from `algorithms.json` → board renders at that FEN, White to move, `interactive=true`.
2. User makes a legal move (chess.js already guarantees this, same as every other screen) → dispatch to `thinking`, call `getEngineMove(resultingFen)`.
3. Response `status="in_progress"` → apply `engineMove`/`fen` to the board (small delay for pacing, matching the existing 600ms scripted-opponent delay elsewhere in `EndgamePuzzles.jsx`), back to `awaiting-move`.
4. Response `status="checkmate"` → `checkmate` state, mark progress, show success.
5. Response `status` in (`"stalemate"`, `"draw"`) → `failed` state with the specific reason, call `updateEndgameProgress(positionId, false)` (increments `attempts` without marking solved — matches `EndgamePuzzles.jsx`'s existing `markProgress(puzzle.puzzle_id, false)` call on a wrong move), offer retry.
6. Network/API failure at any point → `error` state, board re-enabled, user can retry the same move.

## Testing

**Constraint discovered from the existing harness:** `backend/tests/conftest.py`'s `client` fixture deliberately never triggers FastAPI's real startup events (to avoid touching a real Postgres/Stockfish subprocess in tests — see the Sparring mode plan's Global Constraints). This means `app.state.stockfish` is always unset in tests. Two-pronged fix, isolating the untestable external dependency exactly the way Sparring mode isolated the database:

1. **Pure classification function**, e.g. `classify_position(fen: str) -> Optional[str]` returning `"checkmate" | "stalemate" | "draw" | None`, living in a new `backend/app/algorithms_logic.py` (mirroring `sparring_logic.py`'s pure/impure split) — fully unit-tested with real `python-chess` `Board` objects and zero engine dependency. This is the safety-critical part (correctly recognizing the terminal states that decide pass/fail) and gets full, direct test coverage.
2. **Endpoint-level tests** inject a lightweight fake engine object into `app.state.stockfish` (a stub with an async `play(board, limit)` method returning a canned move) via the test's own setup — never a real Stockfish binary — to exercise the endpoint's full request/response wiring (auth, schema, calling the pure classifier before *and* after the engine's move, building the response) without needing the real engine present in CI/sandboxed environments.

Frontend: reuses the Vitest + RTL + canvas-stub harness Sparring mode already built, no new infrastructure. `algorithmState.js`'s reducer gets full unit-test coverage of every transition (mirroring `sparringState.test.js`); `EndgameAlgorithms.jsx` gets a shallow component test (position-select → board renders) in the same spirit as `SparringMode.test.jsx`, not a full canvas-click simulation.

## Open Questions / Follow-ups (non-blocking)

- Exact Stockfish `depth`/`time` limit for "deepest" is an implementation-time tuning choice.
- Whether the mode toggle's UI (buttons vs. dropdown) matches "dropdown" literally as first described, or a button pair like `EndgamePuzzles`'s existing internal toggles — a small UI-polish decision left to implementation, not a design constraint.
