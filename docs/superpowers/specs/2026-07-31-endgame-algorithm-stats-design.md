# Endgame Algorithms — Win Count & Streak — Design

## Summary

Add per-position stats to the two-bishops-mate Algorithms drill (`EndgameAlgorithms.jsx`):
a count of how many times the user has delivered checkmate on that starting position, a
current consecutive-win streak, and an explicit "Failed" label on the existing
stalemate/draw/insufficient-material result screen. Stats are per position (`bishop-1`,
`bishop-2`, `bishop-3`), not aggregated across the category, and persist server-side.

## Goals

- Track total wins and current win streak per bishop-mate starting position.
- Any non-win outcome (stalemate, draw, insufficient material) resets the streak to 0 and
  does not increment the win count — including draws, which is the case this was
  specifically raised for.
- Make the failed result screen explicitly say "Failed", not just show red explanatory text.
- Do this without changing behavior for the tactics Puzzles screen, which shares the same
  `EndgameProgress` table and `POST /api/endgames/progress/{puzzle_id}` endpoint.

## Non-Goals

- Longest-streak-ever ("best streak") tracking — not requested, YAGNI.
- Aggregating stats across the three bishop-mate positions or across categories.
- Extending win/streak tracking to the Puzzles screen.
- A real migration tool. This project has none (`Base.metadata.create_all` only creates
  missing tables, not missing columns on existing ones) — noted as a deploy step, not solved
  here.

## Data model

`backend/app/models.py` — `EndgameProgress` gains two columns:

```python
wins       = Column(Integer, default=0, nullable=False)
win_streak = Column(Integer, default=0, nullable=False)
```

`solved`, `attempts`, `solved_at` are untouched and keep their current meaning/behavior for
both Puzzles and Algorithms.

**Deploy note:** any already-provisioned dev/prod Postgres DB needs a manual
`ALTER TABLE endgame_progress ADD COLUMN wins INTEGER NOT NULL DEFAULT 0, ADD COLUMN win_streak INTEGER NOT NULL DEFAULT 0;`
before this ships — `create_all` won't add columns to an existing table.

## Backend

### Why the shared endpoint needs a flag

`POST /api/endgames/progress/{puzzle_id}` is called by both `EndgameAlgorithms.jsx` and
`EndgamePuzzles.jsx` today, via the same `updateEndgameProgress` client function. Since wins/
streak must be Algorithms-only, the endpoint needs to know which caller it's serving.

### `ProgressUpdate` (request body)

```python
class ProgressUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    solved: bool
    track_streak: bool = False   # true only for calls from EndgameAlgorithms
```

Defaulting to `False` means the existing Puzzles call site — which sends `{ solved }` only —
is byte-for-byte unaffected; `wins`/`win_streak` stay at 0 for every puzzle row forever.

### `update_progress` logic addition

Existing `attempts += 1` / `solved` / `solved_at` logic is unchanged and runs unconditionally.
Add, only when `body.track_streak` is `True`:

```python
if body.solved:
    row.wins += 1
    row.win_streak += 1
else:
    row.win_streak = 0
```

No branching on stalemate vs. draw vs. insufficient-material — the frontend already collapses
all three into a single `markProgress(id, false)` call (see `FAILURE_STATUSES` in
`EndgameAlgorithms.jsx`), so "any non-win resets the streak" falls out for free.

### `ProgressOut` (response body)

Add `wins: int` and `win_streak: int` (→ `winStreak` on the wire), sourced directly from the
row like every other field. Present (as 0) on Puzzle rows too — harmless, just unused by that
screen.

## Frontend

### `frontend/src/utils/api.js`

```javascript
export const updateEndgameProgress = (puzzleId, solved, { trackStreak = false } = {}) =>
  req(`/endgames/progress/${puzzleId}`, {
    method: 'POST',
    body: JSON.stringify({ solved, trackStreak }),
  })
```

`EndgamePuzzles.jsx`'s call site (`updateEndgameProgress(puzzleId, solved)`) needs no edit —
the new third argument defaults to `{ trackStreak: false }`.

### `frontend/src/screens/EndgameAlgorithms.jsx`

- `markProgress` calls `updateEndgameProgress(positionId, solved, { trackStreak: true })`.
- `progress` state map extends from `{ solved, attempts }` to
  `{ solved, attempts, wins, winStreak }`, populated from the same response as today.
- Sidebar per-position row (`.oi-meta`) shows the new counts alongside the existing
  `✓ solved` marker, e.g.:
  ```
  ✓ solved · 3 wins · streak 2
  ```
  (omit the wins/streak segment entirely when `wins === 0`, same spirit as the existing
  empty-string fallback for an unsolved position.)
- Checkmate result panel additionally shows the just-updated `wins`/`winStreak` for that
  position (e.g. "Win streak: 4 · 7 wins total"), reading from `progress[state.positionId]`
  after the `markProgress` response lands.
- Failed result panel gets an explicit heading:
  ```jsx
  {state.status === 'failed' && (
    <div style={{ fontSize: 14, textAlign: 'center', color: 'var(--red)' }}>
      <div style={{ fontWeight: 600 }}>Failed</div>
      <div>{FAIL_MESSAGE[state.failReason]}</div>
      ...
    </div>
  )}
  ```
  This applies uniformly to all three `failReason` values (`stalemate`, `draw`,
  `insufficient_material`) since they already share the same `state.status === 'failed'`
  branch — draws get the "Failed" heading with no special-casing needed.

## Testing

Following the same pure/impure split the rest of this feature already uses:

- **Backend** (`test_algorithms_logic.py` / a new/extended endgames router test): cover
  `update_progress` with `track_streak=True` for the win-then-win (streak increments), and
  win-then-loss (streak resets to 0, wins count stops incrementing) sequences; and confirm a
  `track_streak`-omitted request (simulating the Puzzles call site) leaves `wins`/`win_streak`
  at 0 regardless of `solved`.
- **Frontend** (`EndgameAlgorithms.test.jsx`): confirm `markProgress` is called with
  `{ trackStreak: true }`; confirm the failed panel renders the literal text "Failed" for a
  `draw` result.

## Open Questions / Follow-ups (non-blocking)

- Exact sidebar/result-panel copy ("3 wins · streak 2" vs. other phrasing) is a small
  UI-polish decision left to implementation, same as prior specs in this project.
