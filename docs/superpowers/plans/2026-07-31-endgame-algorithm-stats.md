# Endgame Algorithms — Win Count & Streak Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-position win count and win-streak tracking to the two-bishops-mate Algorithms drill, plus an explicit "Failed" heading on the stalemate/draw/insufficient-material result screen.

**Architecture:** Two new columns on the existing `EndgameProgress` row (`wins`, `win_streak`), gated behind a new `trackStreak` request flag on the progress-update endpoint so the tactics Puzzles screen — which shares the same table and endpoint — is completely unaffected. The frontend Algorithms screen sends the flag, stores the returned counts in its existing per-position progress map, and renders them in three places: the sidebar row, the checkmate panel, and a new "Failed" heading on the loss panel.

**Tech Stack:** FastAPI + SQLAlchemy + Pydantic (backend), React + Vitest/RTL (frontend), pytest (backend tests).

## Global Constraints

- Wins/streak are scoped **per position** (`puzzle_id`, e.g. `bishop-1`/`bishop-2`/`bishop-3`), never aggregated — confirmed explicitly by the user.
- "Times finished" means **wins only** (successful checkmates), not raw attempts — `attempts` already exists and is untouched.
- The feature must be **Algorithms-only**: the tactics Puzzles screen calls the exact same `POST /api/endgames/progress/{puzzle_id}` endpoint via the same `updateEndgameProgress` client function, and must see zero behavior change.
- Any non-win outcome (stalemate, draw, or insufficient material) resets the streak to 0 and does not increment wins — no per-reason branching needed, since the frontend already collapses all three into a single `solved=false` call.
- This project has no migration tool — `Base.metadata.create_all` only creates missing tables, never adds columns to existing ones. Any already-provisioned dev/prod DB needs a manual `ALTER TABLE` before this ships (called out at the end of Task 1, not automated here).
- Spec: `docs/superpowers/specs/2026-07-31-endgame-algorithm-stats-design.md`.

---

### Task 1: Backend — schema, endpoint flag, and streak logic

**Files:**
- Modify: `backend/app/models.py:155-165` (`EndgameProgress`)
- Modify: `backend/app/routers/endgames.py:19-33` (`ProgressOut`, `ProgressUpdate`), `:61-68` (`update_progress` body)
- Test: `backend/tests/test_endgames_progress.py` (new)

**Interfaces:**
- Produces: `EndgameProgress.wins: int` (default 0), `EndgameProgress.win_streak: int` (default 0) — consumed by Task 2/3's frontend via the JSON response.
- Produces: `POST /api/endgames/progress/{puzzle_id}` request body accepts an optional `trackStreak: bool` (default `false`); response body (`ProgressOut`) always includes `wins` and `winStreak`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_endgames_progress.py`:

```python
def test_progress_without_track_streak_leaves_wins_and_streak_at_zero(client):
    """Simulates the Puzzles call site, which never sends trackStreak."""
    resp = client.post("/api/endgames/progress/bishop-1", json={"solved": True})
    assert resp.status_code == 200
    body = resp.json()
    assert body["wins"] == 0
    assert body["winStreak"] == 0

    resp = client.post("/api/endgames/progress/bishop-1", json={"solved": False})
    assert resp.status_code == 200
    body = resp.json()
    assert body["wins"] == 0
    assert body["winStreak"] == 0


def test_track_streak_increments_wins_and_streak_on_consecutive_wins(client):
    client.post("/api/endgames/progress/bishop-1", json={"solved": True, "trackStreak": True})
    resp = client.post("/api/endgames/progress/bishop-1", json={"solved": True, "trackStreak": True})
    body = resp.json()
    assert body["wins"] == 2
    assert body["winStreak"] == 2


def test_track_streak_resets_streak_on_loss_without_incrementing_wins(client):
    client.post("/api/endgames/progress/bishop-1", json={"solved": True, "trackStreak": True})
    client.post("/api/endgames/progress/bishop-1", json={"solved": True, "trackStreak": True})
    resp = client.post("/api/endgames/progress/bishop-1", json={"solved": False, "trackStreak": True})
    body = resp.json()
    assert body["wins"] == 2
    assert body["winStreak"] == 0


def test_wins_and_streak_are_scoped_per_puzzle_id(client):
    client.post("/api/endgames/progress/bishop-1", json={"solved": True, "trackStreak": True})
    client.post("/api/endgames/progress/bishop-1", json={"solved": True, "trackStreak": True})

    resp = client.post("/api/endgames/progress/bishop-2", json={"solved": True, "trackStreak": True})
    body = resp.json()
    assert body["wins"] == 1        # bishop-2's own count, unaffected by bishop-1's 2 wins
    assert body["winStreak"] == 1
```

Uses the existing `client` fixture from `backend/tests/conftest.py` (fresh in-memory SQLite + fake user per test, no real DB/Stockfish needed — this endpoint doesn't touch Stockfish at all).

- [ ] **Step 2: Run tests to verify they fail**

Run (from `backend/`, with the project venv active): `pytest tests/test_endgames_progress.py -v`
Expected: FAIL — `ProgressOut`/response has no `wins`/`winStreak` keys (`KeyError` in the test, or a `422`/`AssertionError` depending on where it breaks).

- [ ] **Step 3: Add the columns to the model**

In `backend/app/models.py`, replace lines 155-165:

```python
class EndgameProgress(Base):
    __tablename__ = "endgame_progress"

    id        = Column(Integer, primary_key=True, autoincrement=True)
    user_id   = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    puzzle_id = Column(String,  nullable=False, index=True)
    solved    = Column(Boolean, default=False)
    attempts  = Column(Integer, default=0)
    solved_at = Column(DateTime, nullable=True)

    # Algorithms-drill-only stats (see routers/endgames.py's `track_streak` flag) —
    # always 0 for tactics-Puzzle rows, since that screen never sets track_streak.
    wins       = Column(Integer, default=0, nullable=False)
    win_streak = Column(Integer, default=0, nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "puzzle_id", name="uq_user_endgame"),)
```

- [ ] **Step 4: Update the endpoint schemas and logic**

In `backend/app/routers/endgames.py`, replace lines 19-33:

```python
# ── Schemas ────────────────────────────────────────────────────────────────────

class ProgressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, alias_generator=to_camel, populate_by_name=True)

    puzzle_id:  str
    solved:     bool
    attempts:   int
    wins:       int
    win_streak: int


class ProgressUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    solved:       bool
    # True only for calls from the Algorithms drill (EndgameAlgorithms.jsx). Defaults
    # to False so the Puzzles screen's existing calls — which never send this field —
    # leave wins/win_streak untouched forever.
    track_streak: bool = False
```

Then replace lines 61-68 (the body of `update_progress`, from `row.attempts += 1` through `return row`):

```python
    row.attempts += 1
    if body.solved and not row.solved:
        row.solved    = True
        row.solved_at = datetime.utcnow()

    if body.track_streak:
        if body.solved:
            row.wins       += 1
            row.win_streak += 1
        else:
            row.win_streak = 0

    db.commit()
    db.refresh(row)
    return row
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_endgames_progress.py -v`
Expected: PASS (4 tests). Also run the full backend suite to confirm nothing else broke: `pytest -v`

- [ ] **Step 6: Commit**

```bash
git add backend/app/models.py backend/app/routers/endgames.py backend/tests/test_endgames_progress.py
git commit -m "feat: add per-position win count and streak to endgame progress"
```

**Deploy note (not a code step, just flag it in the PR/commit description or to whoever deploys):** any already-provisioned dev/prod Postgres DB needs
`ALTER TABLE endgame_progress ADD COLUMN wins INTEGER NOT NULL DEFAULT 0, ADD COLUMN win_streak INTEGER NOT NULL DEFAULT 0;`
run manually before this ships — `Base.metadata.create_all()` (called on startup in `main.py`) does not add columns to an existing table.

---

### Task 2: Frontend — wire the `trackStreak` flag through the API client and call site

**Files:**
- Modify: `frontend/src/utils/api.js:129-133` (`updateEndgameProgress`)
- Modify: `frontend/src/screens/EndgameAlgorithms.jsx:48-56` (progress-map building), `:62-69` (`markProgress`)
- Modify: `frontend/src/screens/EndgameAlgorithms.test.jsx:60-73` (fix an assertion this task changes the shape of)

**Interfaces:**
- Consumes: Task 1's `POST /api/endgames/progress/{puzzle_id}` accepting `trackStreak` and returning `wins`/`winStreak`.
- Produces: `updateEndgameProgress(puzzleId, solved, { trackStreak })` (3rd arg optional, defaults `{ trackStreak: false }`) — used unchanged by `EndgamePuzzles.jsx`'s existing 2-arg call site. Produces `progress[positionId] = { solved, attempts, wins, winStreak }` in `EndgameAlgorithms.jsx` state — consumed by Task 3's rendering.

- [ ] **Step 1: Write/update the failing tests**

In `frontend/src/screens/EndgameAlgorithms.test.jsx`, update the existing checkmate test (lines 60-73) — it currently asserts a 2-arg call and a response shape without `wins`/`winStreak`:

```javascript
  it('records progress and shows the checkmate UI when the engine replies with checkmate', async () => {
    api.getEngineMove.mockResolvedValue({ status: 'checkmate', engineMove: null, fen: null })
    api.updateEndgameProgress.mockResolvedValue({ solved: true, attempts: 1, wins: 1, winStreak: 1 })

    render(<EndgameAlgorithms />)
    await screen.findByText(/Two Bishops Checkmate/i)
    fireEvent.click(screen.getByText(/Bishops beside the king/i))
    await screen.findByText(/White to move/i)

    fireEvent.click(screen.getByText('Play move'))

    await waitFor(() => expect(api.updateEndgameProgress).toHaveBeenCalledWith('bishop-1', true, { trackStreak: true }))
    expect(await screen.findByText(/Checkmate!/)).toBeInTheDocument()
  })
```

Add a new test right after it, in the same `describe` block:

```javascript
  it('calls updateEndgameProgress with trackStreak true and solved false on a draw', async () => {
    api.getEngineMove.mockResolvedValue({ status: 'draw', engineMove: null, fen: null })
    api.updateEndgameProgress.mockResolvedValue({ solved: false, attempts: 2, wins: 1, winStreak: 0 })

    render(<EndgameAlgorithms />)
    await screen.findByText(/Two Bishops Checkmate/i)
    fireEvent.click(screen.getByText(/Bishops beside the king/i))
    await screen.findByText(/White to move/i)

    fireEvent.click(screen.getByText('Play move'))

    await waitFor(() => expect(api.updateEndgameProgress).toHaveBeenCalledWith('bishop-1', false, { trackStreak: true }))
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `frontend/`): `npm test -- EndgameAlgorithms`
Expected: FAIL — both assertions on `toHaveBeenCalledWith(..., { trackStreak: true })` fail because the current call site only passes 2 arguments.

- [ ] **Step 3: Update the API client**

In `frontend/src/utils/api.js`, replace lines 129-133:

```javascript
export const updateEndgameProgress = (puzzleId, solved, { trackStreak = false } = {}) =>
  req(`/endgames/progress/${encodeURIComponent(puzzleId)}`, {
    method: 'POST',
    body: JSON.stringify({ solved, trackStreak }),
  })
```

- [ ] **Step 4: Wire the call site and progress-map shape**

In `frontend/src/screens/EndgameAlgorithms.jsx`, replace lines 48-56:

```javascript
  useEffect(() => {
    getEndgamesProgress()
      .then(rows => {
        const map = {}
        rows.forEach(r => { map[r.puzzleId] = { solved: r.solved, attempts: r.attempts, wins: r.wins, winStreak: r.winStreak } })
        setProgress(map)
      })
      .catch(console.warn)
  }, [])
```

Replace lines 62-69:

```javascript
  const markProgress = useCallback((positionId, solved) => {
    updateEndgameProgress(positionId, solved, { trackStreak: true })
      .then(res => {
        setProgress(p => ({ ...p, [positionId]: { solved: res.solved, attempts: res.attempts, wins: res.wins, winStreak: res.winStreak } }))
        setProgressError(null)
      })
      .catch(err => setProgressError(`Couldn't save your progress — it wasn't recorded: ${err.message}`))
  }, [])
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- EndgameAlgorithms`
Expected: PASS (5 tests: 4 original + 1 new).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/api.js frontend/src/screens/EndgameAlgorithms.jsx frontend/src/screens/EndgameAlgorithms.test.jsx
git commit -m "feat: wire trackStreak flag through endgame-algorithms progress calls"
```

---

### Task 3: Frontend — display wins/streak and the "Failed" heading

**Files:**
- Modify: `frontend/src/screens/EndgameAlgorithms.jsx:101-103` (sidebar `.oi-meta`), `:151-162` (checkmate/failed panels)
- Modify: `frontend/src/screens/EndgameAlgorithms.test.jsx` (add new tests)

**Interfaces:**
- Consumes: `progress[positionId] = { solved, attempts, wins, winStreak }` from Task 2.
- No new interfaces produced — this is the leaf rendering layer.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/screens/EndgameAlgorithms.test.jsx`, inside the existing `describe('EndgameAlgorithms', ...)` block:

```javascript
  it('shows the sidebar wins/streak summary once progress has loaded', async () => {
    api.getEndgamesProgress.mockResolvedValue([
      { puzzleId: 'bishop-1', solved: true, attempts: 5, wins: 3, winStreak: 2 },
    ])

    render(<EndgameAlgorithms />)

    expect(await screen.findByText(/3 wins/)).toBeInTheDocument()
    expect(screen.getByText(/streak 2/)).toBeInTheDocument()
  })

  it('shows win count and streak on the checkmate panel', async () => {
    api.getEngineMove.mockResolvedValue({ status: 'checkmate', engineMove: null, fen: null })
    api.updateEndgameProgress.mockResolvedValue({ solved: true, attempts: 3, wins: 3, winStreak: 2 })

    render(<EndgameAlgorithms />)
    await screen.findByText(/Two Bishops Checkmate/i)
    fireEvent.click(screen.getByText(/Bishops beside the king/i))
    await screen.findByText(/White to move/i)
    fireEvent.click(screen.getByText('Play move'))

    expect(await screen.findByText(/Win streak: 2/)).toBeInTheDocument()
    expect(screen.getByText(/3 wins total/)).toBeInTheDocument()
  })

  it('shows a "Failed" heading when the drill ends in a draw', async () => {
    api.getEngineMove.mockResolvedValue({ status: 'draw', engineMove: null, fen: null })
    api.updateEndgameProgress.mockResolvedValue({ solved: false, attempts: 2, wins: 1, winStreak: 0 })

    render(<EndgameAlgorithms />)
    await screen.findByText(/Two Bishops Checkmate/i)
    fireEvent.click(screen.getByText(/Bishops beside the king/i))
    await screen.findByText(/White to move/i)
    fireEvent.click(screen.getByText('Play move'))

    expect(await screen.findByText('Failed')).toBeInTheDocument()
    expect(screen.getByText(/Draw by the 75-move rule/)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `frontend/`): `npm test -- EndgameAlgorithms`
Expected: FAIL — the sidebar/checkmate/failed text these tests query for doesn't exist yet.

- [ ] **Step 3: Update the sidebar row**

In `frontend/src/screens/EndgameAlgorithms.jsx`, replace lines 101-103:

```jsx
                <div className="oi-meta">
                  <span>{progress[pos.id]?.solved ? '✓ solved' : ''}</span>
                  <span>{progress[pos.id]?.wins ? ` · ${progress[pos.id].wins} win${progress[pos.id].wins === 1 ? '' : 's'}` : ''}</span>
                  <span>{progress[pos.id]?.winStreak ? ` · streak ${progress[pos.id].winStreak}` : ''}</span>
                </div>
```

- [ ] **Step 4: Update the checkmate and failed panels**

Replace lines 151-162:

```jsx
        {state.status === 'checkmate' && (
          <div style={{ fontSize: 14, textAlign: 'center', color: 'var(--green)' }}>
            Checkmate! 🎉
            <div style={{ fontSize: 12, color: 'var(--text4)', marginTop: 4 }}>
              Win streak: {progress[state.positionId]?.winStreak ?? 0} · {progress[state.positionId]?.wins ?? 0} wins total
            </div>
            <div><button className="btn-green" onClick={() => dispatch({ type: 'reset' })}>Back to positions</button></div>
          </div>
        )}
        {state.status === 'failed' && (
          <div style={{ fontSize: 14, textAlign: 'center', color: 'var(--red)' }}>
            <div style={{ fontWeight: 600 }}>Failed</div>
            <div>{FAIL_MESSAGE[state.failReason]}</div>
            <div><button className="btn-green" onClick={() => selectPosition({ id: state.positionId, label: state.label, fen: data.categories.flatMap(c => c.positions).find(p => p.id === state.positionId)?.fen })}>Retry</button></div>
          </div>
        )}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- EndgameAlgorithms`
Expected: PASS (8 tests: 5 from Task 2 + 3 new).

Also run the full frontend suite to confirm nothing else broke: `npm test`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/screens/EndgameAlgorithms.jsx frontend/src/screens/EndgameAlgorithms.test.jsx
git commit -m "feat: display win count, streak, and a Failed heading in endgame algorithms"
```
