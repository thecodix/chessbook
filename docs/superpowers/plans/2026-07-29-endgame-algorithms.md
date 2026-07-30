# Endgame Algorithms Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live-engine checkmate-technique drill mode ("Algorithms") to the Endgames screen, alongside the existing scripted-puzzle mode, starting with the classic two-bishops-vs-king checkmate at three starting positions.

**Architecture:** One new stateless backend endpoint (`POST /api/endgames/engine-move`) that classifies a position's terminal state via a pure helper and, if the game continues, asks the server's existing shared Stockfish process for one reply move. `Endgames.jsx` becomes a thin mode-dispatcher between the existing puzzle-solving screen (extracted unchanged into `EndgamePuzzles.jsx`) and a new `EndgameAlgorithms.jsx`, driven by a pure reducer mirroring `sparringState.js`'s pattern.

**Tech Stack:** FastAPI + python-chess (backend, reusing the existing persistent Stockfish process), React + the existing Vitest/RTL harness (frontend).

Full design: `docs/superpowers/specs/2026-07-29-endgame-algorithms-design.md`.

## Global Constraints

- All new/modified endpoints require `Depends(get_current_user)`; schemas use `ConfigDict(alias_generator=to_camel, populate_by_name=True)` — matches every existing router, including `backend/app/routers/endgames.py` itself.
- The new endpoint reuses `request.app.state.stockfish` / `request.app.state.stockfish_lock` (already managed by `main.py`'s `startup_stockfish`, already consumed by `analysis.py`) — never spin up a second engine process. 503 if unavailable, matching `analysis.py`'s existing check exactly.
- **Tests must never trigger FastAPI's real startup events** (same reason as the Sparring mode plan: `startup()` touches a real Postgres DB, `startup_stockfish()` spawns a subprocess) — the `client` fixture from `backend/tests/conftest.py` already handles this; do not add a `with TestClient(app) as c:` anywhere.
- Because the existing test harness never runs `startup_stockfish()`, `app.state.stockfish` is unset in every test by default. Tests for the new endpoint that need an engine present must inject a lightweight fake object directly onto `app.state.stockfish` (an async `play(board, limit)` stub) and must reset it to `None` in teardown — never use or require a real Stockfish binary in tests.
- The terminal-state classification (checkmate/stalemate/75-move draw) lives in a **pure** function with zero engine/FastAPI dependency (`backend/app/algorithms_logic.py`, mirroring `backend/app/sparring_logic.py`'s pure/impure split) — this is the safety-critical part and gets full, direct unit-test coverage independent of any engine.
- No server-side move-legality validation — exactly like every other screen (Study, `EndgamePuzzles`, Sparring), the client's chess.js is trusted to only ever send legal moves. The backend only reasons about chess logic that genuinely requires it (terminal-state detection, asking Stockfish for its reply).
- Three-fold repetition is explicitly NOT detected (stateless design, no game history) — this is a deliberate, documented scope decision, not a gap to fix in this plan. Only checkmate, stalemate, and the 75-move rule are checked.
- `frontend/src/screens/Endgames.jsx`'s existing puzzle-solving behavior must be preserved byte-for-byte when extracted into `EndgamePuzzles.jsx` — that extraction is a pure move, not a rewrite.
- Frontend error handling (a visible error message + board re-enabled on any failed API call) is built into `EndgameAlgorithms.jsx`/`algorithmState.js` from the start — do not defer it to a later fix round.

---

## Task 1: Static algorithm-position data

**Files:**
- Create: `frontend/public/algorithms.json`

**Interfaces:**
- Produces: a static JSON file matching the shape below. Task 7 (`EndgameAlgorithms.jsx`) fetches it via `fetch('/algorithms.json')`, mirroring how `EndgamePuzzles.jsx` already fetches `/endgames.json`.

- [ ] **Step 1: Create the data file**

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

- [ ] **Step 2: Verify it's valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('frontend/public/algorithms.json'))" && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add frontend/public/algorithms.json
git commit -m "feat: add two-bishops-checkmate starting positions data"
```

---

## Task 2: Pure terminal-state classification

**Files:**
- Create: `backend/app/algorithms_logic.py`
- Create: `backend/tests/test_algorithms_logic.py`

**Interfaces:**
- Consumes: nothing (pure, only `chess` from the existing `python-chess` dependency).
- Produces: `classify_position(fen: str) -> Optional[str]` returning `"checkmate" | "stalemate" | "draw" | None`. Task 3's endpoint calls this both before and after the engine's move.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_algorithms_logic.py
import chess

from app.algorithms_logic import classify_position


def test_classify_position_detects_checkmate():
    # Fool's Mate: 1.f3 e5 2.g4 Qh4# — White to move, checkmated.
    fen = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"
    assert classify_position(fen) == "checkmate"


def test_classify_position_detects_stalemate():
    # Classic queen-stalemate trap: Black to move, no legal moves, not in check.
    fen = "k7/8/1Q6/8/8/8/8/7K b - - 0 1"
    assert classify_position(fen) == "stalemate"


def test_classify_position_detects_seventy_five_move_draw():
    fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 150 90"
    assert classify_position(fen) == "draw"


def test_classify_position_returns_none_for_an_ongoing_game():
    board = chess.Board()
    board.push_san("e4")
    board.push_san("e5")
    assert classify_position(board.fen()) is None


def test_classify_position_returns_none_for_the_starting_position():
    assert classify_position(chess.Board().fen()) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_algorithms_logic.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.algorithms_logic'`

- [ ] **Step 3: Implement**

```python
# backend/app/algorithms_logic.py
"""Pure, engine-agnostic terminal-state classification for live-engine
endgame drills (Endgame Algorithms mode). Kept separate from any Stockfish
call so it's fully unit-testable without a real engine process — mirrors
the pure/impure split in app/sparring_logic.py."""
from typing import Optional

import chess


def classify_position(fen: str) -> Optional[str]:
    """Returns "checkmate" | "stalemate" | "draw" if `fen` is terminal, or
    None if the game should continue. "draw" here covers only the 75-move
    rule (chess.Board.is_seventyfive_moves) — fully determinable from a
    single FEN's halfmove clock, no game history needed. Three-fold
    repetition is deliberately NOT detected (see
    docs/superpowers/specs/2026-07-29-endgame-algorithms-design.md)."""
    board = chess.Board(fen)
    if board.is_checkmate():
        return "checkmate"
    if board.is_stalemate():
        return "stalemate"
    if board.is_seventyfive_moves():
        return "draw"
    return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_algorithms_logic.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/algorithms_logic.py backend/tests/test_algorithms_logic.py
git commit -m "feat: add pure terminal-state classification for endgame algorithms"
```

---

## Task 3: `POST /api/endgames/engine-move` endpoint

**Files:**
- Modify: `backend/app/routers/endgames.py`
- Create: `backend/tests/test_endgames_engine_move.py`

**Interfaces:**
- Consumes: `classify_position` (Task 2), `request.app.state.stockfish` / `stockfish_lock` (existing, set up by `main.py`, consumed today only by `analysis.py`).
- Produces: `EngineMoveOut` schema (`status, engineMove, fen`). Task 6's frontend API client and Task 7's `EndgameAlgorithms.jsx` consume exactly this shape.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_endgames_engine_move.py
import asyncio
from types import SimpleNamespace

import chess
import pytest

from app.main import app


class _FakeEngine:
    """Test double for app.state.stockfish. Only .play() is ever called by
    the endpoint under test; returns a canned move via a SimpleNamespace
    standing in for chess.engine.PlayResult (only .move is read)."""
    def __init__(self, reply_move):
        self.reply_move = reply_move
        self.play_called = False

    async def play(self, board, limit):
        self.play_called = True
        return SimpleNamespace(move=self.reply_move)


@pytest.fixture()
def stockfish_state():
    app.state.stockfish_lock = asyncio.Lock()
    yield app.state
    app.state.stockfish = None


def test_engine_move_requires_auth():
    from app.auth import get_current_user
    from fastapi.testclient import TestClient
    app.dependency_overrides.pop(get_current_user, None)
    resp = TestClient(app).post("/api/endgames/engine-move", json={"fen": chess.Board().fen()})
    assert resp.status_code == 401
    app.dependency_overrides.clear()


def test_engine_move_503s_when_engine_unavailable(client, stockfish_state):
    stockfish_state.stockfish = None
    resp = client.post("/api/endgames/engine-move", json={"fen": chess.Board().fen()})
    assert resp.status_code == 503


def test_engine_move_returns_checkmate_without_calling_the_engine(client, stockfish_state):
    fen = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"  # Fool's Mate
    fake = _FakeEngine(reply_move=None)
    stockfish_state.stockfish = fake

    resp = client.post("/api/endgames/engine-move", json={"fen": fen})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "checkmate"
    assert body["engineMove"] is None
    assert body["fen"] is None
    assert fake.play_called is False


def test_engine_move_returns_stalemate_without_calling_the_engine(client, stockfish_state):
    fen = "k7/8/1Q6/8/8/8/8/7K b - - 0 1"
    fake = _FakeEngine(reply_move=None)
    stockfish_state.stockfish = fake

    resp = client.post("/api/endgames/engine-move", json={"fen": fen})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "stalemate"
    assert fake.play_called is False


def test_engine_move_plays_a_reply_when_the_game_continues(client, stockfish_state):
    board = chess.Board()
    board.push_san("e4")
    board.push_san("e5")
    reply = next(iter(board.legal_moves))
    expected_san = board.san(reply)
    board_after = board.copy()
    board_after.push(reply)

    fake = _FakeEngine(reply_move=reply)
    stockfish_state.stockfish = fake

    resp = client.post("/api/endgames/engine-move", json={"fen": board.fen()})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "in_progress"
    assert body["engineMove"] == expected_san
    assert body["fen"] == board_after.fen()
    assert fake.play_called is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_endgames_engine_move.py -v`
Expected: FAIL — 404 (route doesn't exist) on every test except the auth one, which fails differently or also 404s.

- [ ] **Step 3: Implement**

Add to the top of `backend/app/routers/endgames.py` (alongside the existing imports):

```python
import chess
import chess.engine
from fastapi import HTTPException, Request

from app.algorithms_logic import classify_position
```

Append to `backend/app/routers/endgames.py`:

```python
# ── Endgame Algorithms (live engine) ────────────────────────────────────────────

ENGINE_MOVE_LIMIT = chess.engine.Limit(depth=22)  # deep relative to analysis.py's 0.5s quick-eval budget


class EngineMoveIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    fen: str


class EngineMoveOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    status:      str
    engine_move: Optional[str] = None
    fen:         Optional[str] = None


@router.post("/engine-move", response_model=EngineMoveOut)
async def engine_move(
    body: EngineMoveIn,
    request: Request,
    user: models.User = Depends(get_current_user),
):
    status = classify_position(body.fen)
    if status is not None:
        return EngineMoveOut(status=status)

    engine_proc = getattr(request.app.state, "stockfish", None)
    if engine_proc is None:
        raise HTTPException(503, "Stockfish engine is not available on this server")

    board = chess.Board(body.fen)
    async with request.app.state.stockfish_lock:
        result = await engine_proc.play(board, ENGINE_MOVE_LIMIT)

    engine_move_san = board.san(result.move)
    board.push(result.move)
    new_status = classify_position(board.fen())

    return EngineMoveOut(
        status=new_status or "in_progress",
        engine_move=engine_move_san,
        fen=board.fen(),
    )
```

Note: `Optional` must already be imported in this file from `typing` — check the existing import block; add `from typing import Optional` if it isn't there yet.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_endgames_engine_move.py -v`
Expected: 5 passed

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && .venv/bin/python -m pytest -v`
Expected: all passing (no regression in existing `endgames.py` routes — `/progress` etc. — or any other router).

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/endgames.py backend/tests/test_endgames_engine_move.py
git commit -m "feat: add POST /api/endgames/engine-move endpoint"
```

---

## Task 4: Frontend API client addition

**Files:**
- Modify: `frontend/src/utils/api.js`
- Create: `frontend/src/utils/api.engineMove.test.js`

**Interfaces:**
- Produces: `getEngineMove(fen) -> Promise`. Task 6's `algorithmState.js`/`EndgameAlgorithms.jsx` import it.

- [ ] **Step 1: Write the failing test**

```javascript
// frontend/src/utils/api.engineMove.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getEngineMove, setToken } from './api'

function jsonResponse(body) {
  return Promise.resolve({
    ok: true, status: 200,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(body),
  })
}

beforeEach(() => {
  setToken('test-token')
  global.fetch = vi.fn()
})

describe('getEngineMove', () => {
  it('POSTs the fen to /endgames/engine-move', async () => {
    global.fetch.mockReturnValue(jsonResponse({ status: 'in_progress', engineMove: 'e5', fen: 'FEN' }))
    await getEngineMove('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')

    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/endgames/engine-move')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- api.engineMove`
Expected: FAIL — `getEngineMove is not a function`

- [ ] **Step 3: Implement**

Append to `frontend/src/utils/api.js` (near the existing `getEndgamesProgress`/`updateEndgameProgress` section):

```javascript
export const getEngineMove = (fen) =>
  req('/endgames/engine-move', {
    method: 'POST',
    body: JSON.stringify({ fen }),
  })
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npm test -- api.engineMove`
Expected: 1 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/api.js frontend/src/utils/api.engineMove.test.js
git commit -m "feat: add frontend API client for the live engine-move endpoint"
```

---

## Task 5: Pure `algorithmState` reducer

**Files:**
- Create: `frontend/src/utils/algorithmState.js`
- Create: `frontend/src/utils/algorithmState.test.js`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `initialAlgorithmState`, `algorithmReducer(state, action)`. Task 7's `EndgameAlgorithms.jsx` uses both via `useReducer`.

- [ ] **Step 1: Write the failing tests**

```javascript
// frontend/src/utils/algorithmState.test.js
import { describe, it, expect } from 'vitest'
import { initialAlgorithmState, algorithmReducer } from './algorithmState'

const START = { positionId: 'bishop-1', label: 'Bishops beside the king', fen: 'FEN0' }

describe('algorithmReducer', () => {
  it('started sets the position and enters awaiting-move', () => {
    const next = algorithmReducer(initialAlgorithmState, { type: 'started', payload: START })
    expect(next.status).toBe('awaiting-move')
    expect(next.positionId).toBe('bishop-1')
    expect(next.fen).toBe('FEN0')
    expect(next.error).toBe(null)
  })

  it('moved shows the users move immediately and locks the board', () => {
    const started = algorithmReducer(initialAlgorithmState, { type: 'started', payload: START })
    const moved = algorithmReducer(started, { type: 'moved', payload: { fen: 'FEN1' } })
    expect(moved.status).toBe('thinking')
    expect(moved.fen).toBe('FEN1')
  })

  it('replied with in_progress applies the engine move and returns to awaiting-move', () => {
    const thinking = { ...initialAlgorithmState, status: 'thinking', positionId: 'bishop-1', fen: 'FEN1' }
    const next = algorithmReducer(thinking, {
      type: 'replied',
      payload: { status: 'in_progress', engineMove: 'Kd6', fen: 'FEN2' },
    })
    expect(next.status).toBe('awaiting-move')
    expect(next.fen).toBe('FEN2')
  })

  it('replied with checkmate enters the checkmate status', () => {
    const thinking = { ...initialAlgorithmState, status: 'thinking', fen: 'FEN1' }
    const next = algorithmReducer(thinking, {
      type: 'replied',
      payload: { status: 'checkmate', engineMove: null, fen: null },
    })
    expect(next.status).toBe('checkmate')
  })

  it('replied with stalemate enters failed with the specific reason', () => {
    const thinking = { ...initialAlgorithmState, status: 'thinking', fen: 'FEN1' }
    const next = algorithmReducer(thinking, {
      type: 'replied',
      payload: { status: 'stalemate', engineMove: null, fen: null },
    })
    expect(next.status).toBe('failed')
    expect(next.failReason).toBe('stalemate')
  })

  it('replied with draw enters failed with the draw reason', () => {
    const thinking = { ...initialAlgorithmState, status: 'thinking', fen: 'FEN1' }
    const next = algorithmReducer(thinking, {
      type: 'replied',
      payload: { status: 'draw', engineMove: null, fen: null },
    })
    expect(next.status).toBe('failed')
    expect(next.failReason).toBe('draw')
  })

  it('failed sets an error message and unlocks the board', () => {
    const thinking = { ...initialAlgorithmState, status: 'thinking', fen: 'FEN1' }
    const next = algorithmReducer(thinking, { type: 'failed', payload: { message: 'network down' } })
    expect(next.status).toBe('awaiting-move')
    expect(next.error).toBe('network down')
  })

  it('reset returns to the initial idle state', () => {
    const dirty = { ...initialAlgorithmState, status: 'checkmate', positionId: 'bishop-1' }
    expect(algorithmReducer(dirty, { type: 'reset' })).toEqual(initialAlgorithmState)
  })
})
```

Note: the `'failed'` action here is the generic API-failure/error path (network/API errors), distinct from the `'replied'` action's `status: 'stalemate' | 'draw'` payloads (a successful API response reporting the *game* ended in a draw). Naming them `error` (state field, API failures) vs. `failReason` (state field, game-outcome failures) keeps the two concerns from colliding.

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- algorithmState`
Expected: FAIL — module `./algorithmState` not found.

- [ ] **Step 3: Implement**

```javascript
// frontend/src/utils/algorithmState.js
export const initialAlgorithmState = {
  status: 'idle',   // 'idle' | 'awaiting-move' | 'thinking' | 'checkmate' | 'failed'
  positionId: null,
  label: null,
  fen: null,
  failReason: null, // 'stalemate' | 'draw' | null
  error: null,       // API-failure message, or null
}

export function algorithmReducer(state, action) {
  switch (action.type) {
    case 'started': {
      const p = action.payload
      return {
        ...initialAlgorithmState,
        status: 'awaiting-move',
        positionId: p.positionId, label: p.label, fen: p.fen,
      }
    }
    case 'moved':
      return { ...state, status: 'thinking', fen: action.payload.fen, error: null }
    case 'replied': {
      const r = action.payload
      if (r.status === 'checkmate') {
        return { ...state, status: 'checkmate' }
      }
      if (r.status === 'stalemate' || r.status === 'draw') {
        return { ...state, status: 'failed', failReason: r.status }
      }
      return { ...state, status: 'awaiting-move', fen: r.fen }
    }
    case 'failed':
      return { ...state, status: 'awaiting-move', error: action.payload.message }
    case 'reset':
      return initialAlgorithmState
    default:
      return state
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npm test -- algorithmState`
Expected: 8 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/algorithmState.js frontend/src/utils/algorithmState.test.js
git commit -m "feat: add pure algorithmState reducer for live-engine endgame drills"
```

---

## Task 6: Extract `EndgamePuzzles.jsx` from `Endgames.jsx`

**Files:**
- Create: `frontend/src/screens/EndgamePuzzles.jsx`
- Modify: `frontend/src/screens/Endgames.jsx` (temporarily — this task makes it re-export; Task 8 turns it into the real dispatcher)

**Interfaces:**
- Produces: `EndgamePuzzles` default export, byte-for-byte identical behavior to today's `Endgames`. Task 8 imports it.

- [ ] **Step 1: Move the file**

```bash
git mv frontend/src/screens/Endgames.jsx frontend/src/screens/EndgamePuzzles.jsx
```

Do not change a single line of the moved file's contents in this step — this is a pure rename.

- [ ] **Step 2: Replace `Endgames.jsx` with a temporary re-export**

(This keeps `App.jsx`'s existing `import Endgames from './screens/Endgames'` working without any change in this task — Task 8 replaces this file's contents with the real mode-dispatcher.)

```javascript
// frontend/src/screens/Endgames.jsx
export { default } from './EndgamePuzzles'
```

- [ ] **Step 3: Verify the frontend still builds and all existing tests still pass**

Run: `cd frontend && npm test`
Expected: same pass count as before this task (this change touches no test files and no behavior).

Run: `cd frontend && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: extract Endgames.jsx puzzle-solving logic into EndgamePuzzles.jsx"
```

---

## Task 7: `EndgameAlgorithms` screen

**Files:**
- Create: `frontend/src/screens/EndgameAlgorithms.jsx`
- Create: `frontend/src/screens/EndgameAlgorithms.test.jsx`

**Interfaces:**
- Consumes: `getEngineMove` (Task 4), `initialAlgorithmState`/`algorithmReducer` (Task 5), `Board` (existing, unmodified), `getEndgamesProgress`/`updateEndgameProgress` (existing).
- Produces: `EndgameAlgorithms` default export (no props). Task 8's `Endgames.jsx` dispatcher renders it.

- [ ] **Step 1: Write the failing component test**

```jsx
// frontend/src/screens/EndgameAlgorithms.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import EndgameAlgorithms from './EndgameAlgorithms'
import * as api from '../utils/api'

vi.mock('../utils/api')

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      categories: [{
        id: 'bishop-mate', title: 'Two Bishops Checkmate',
        positions: [{ id: 'bishop-1', label: 'Bishops beside the king', fen: '4k3/8/8/3BBK2/8/8/8/8 w - - 0 1' }],
      }],
    }),
  })
  api.getEndgamesProgress.mockResolvedValue([])
})

describe('EndgameAlgorithms', () => {
  it('loads categories and renders the board after picking a position', async () => {
    render(<EndgameAlgorithms />)
    expect(await screen.findByText(/Two Bishops Checkmate/i)).toBeInTheDocument()

    fireEvent.click(screen.getByText(/Bishops beside the king/i))

    expect(await screen.findByText(/White to move/i)).toBeInTheDocument()
  })
})
```

Note: like `SparringMode.test.jsx`, this deliberately does not simulate a canvas click to complete a move — full move-by-click flows are out of scope for component tests (see the Sparring mode plan's Global Constraints for why). State-machine correctness is fully covered by Task 5's reducer tests.

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- EndgameAlgorithms`
Expected: FAIL — module `./EndgameAlgorithms` not found.

- [ ] **Step 3: Implement**

```jsx
// frontend/src/screens/EndgameAlgorithms.jsx
import { useState, useEffect, useReducer, useRef, useCallback } from 'react'
import Board from '../components/Board'
import { getEngineMove, getEndgamesProgress, updateEndgameProgress } from '../utils/api'
import { initialAlgorithmState, algorithmReducer } from '../utils/algorithmState'

function useBoardSize(ref) {
  const [size, setSize] = useState(480)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize(Math.max(200, Math.floor(Math.min(width, height))))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

const FAIL_MESSAGE = {
  stalemate: 'Stalemate — the lone king had no legal move but wasn’t in check. Avoid boxing it in without checking it.',
  draw: 'Draw by the 75-move rule — you weren’t making progress toward mate.',
}

export default function EndgameAlgorithms() {
  const [data, setData] = useState(null)
  const [progress, setProgress] = useState({})
  const [state, dispatch] = useReducer(algorithmReducer, initialAlgorithmState)
  const boardWrapRef = useRef(null)
  const boardSize = useBoardSize(boardWrapRef)

  useEffect(() => {
    fetch('/algorithms.json').then(r => r.json()).then(setData).catch(console.warn)
  }, [])

  useEffect(() => {
    getEndgamesProgress()
      .then(rows => {
        const map = {}
        rows.forEach(r => { map[r.puzzleId] = { solved: r.solved, attempts: r.attempts } })
        setProgress(map)
      })
      .catch(console.warn)
  }, [])

  const selectPosition = useCallback((position) => {
    dispatch({ type: 'started', payload: { positionId: position.id, label: position.label, fen: position.fen } })
  }, [])

  const handleMove = useCallback(async (moveResult) => {
    if (state.status !== 'awaiting-move') return
    dispatch({ type: 'moved', payload: { fen: moveResult.fen } })
    try {
      const reply = await getEngineMove(moveResult.fen)
      dispatch({ type: 'replied', payload: reply })
      if (reply.status === 'checkmate') {
        updateEndgameProgress(state.positionId, true).catch(console.warn)
      } else if (reply.status === 'stalemate' || reply.status === 'draw') {
        updateEndgameProgress(state.positionId, false).catch(console.warn)
      }
    } catch (err) {
      dispatch({ type: 'failed', payload: { message: err.message || 'Could not reach the server — please try again.' } })
    }
  }, [state.status, state.positionId])

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div className="sidebar">
        <div className="sidebar-head"><span style={{ fontSize: 13, fontWeight: 500 }}>Algorithms</span></div>
        {data?.categories?.map(cat => (
          <div key={cat.id}>
            <div className="sidebar-section">{cat.title}</div>
            {cat.positions.map(pos => (
              <div
                key={pos.id}
                className={`opening-item${state.positionId === pos.id ? ' active' : ''}`}
                onClick={() => selectPosition(pos)}
              >
                <div className="oi-name">{pos.label}</div>
                <div className="oi-meta">
                  <span>{progress[pos.id]?.solved ? '✓ solved' : ''}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="board-area" style={{ padding: 12, gap: 10 }}>
        {state.error && (
          <div style={{ width: '100%', maxWidth: boardSize, fontSize: 12, color: 'var(--red)' }}>
            {state.error}
          </div>
        )}

        {state.status !== 'idle' && (
          <div
            ref={boardWrapRef}
            style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Board
              fen={state.fen}
              size={boardSize}
              flipped={false}
              interactive={state.status === 'awaiting-move'}
              onMove={handleMove}
              layers={{ attacks: false, coverage: false, targets: true, hanging: false, winning: false, selection: true }}
            />
          </div>
        )}

        {state.status === 'awaiting-move' && <div style={{ fontSize: 13, textAlign: 'center' }}>White to move</div>}
        {state.status === 'thinking' && <div style={{ fontSize: 13, textAlign: 'center', color: 'var(--text4)' }}>Engine thinking…</div>}
        {state.status === 'checkmate' && (
          <div style={{ fontSize: 14, textAlign: 'center', color: 'var(--green)' }}>
            Checkmate! 🎉
            <div><button className="btn-green" onClick={() => dispatch({ type: 'reset' })}>Back to positions</button></div>
          </div>
        )}
        {state.status === 'failed' && (
          <div style={{ fontSize: 14, textAlign: 'center', color: 'var(--red)' }}>
            {FAIL_MESSAGE[state.failReason]}
            <div><button className="btn-green" onClick={() => selectPosition({ id: state.positionId, label: state.label, fen: data.categories.flatMap(c => c.positions).find(p => p.id === state.positionId)?.fen })}>Retry</button></div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify tests pass**

Run: `cd frontend && npm test -- EndgameAlgorithms`
Expected: 1 passed

- [ ] **Step 5: Run the full frontend suite**

Run: `cd frontend && npm test`
Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/screens/EndgameAlgorithms.jsx frontend/src/screens/EndgameAlgorithms.test.jsx
git commit -m "feat: add EndgameAlgorithms live-engine drill screen"
```

---

## Task 8: Mode-dispatcher `Endgames.jsx`

**Files:**
- Modify: `frontend/src/screens/Endgames.jsx` (replace the Task 6 re-export with the real dispatcher)
- Create: `frontend/src/screens/Endgames.test.jsx`

**Interfaces:**
- Consumes: `EndgamePuzzles` (Task 6), `EndgameAlgorithms` (Task 7).
- Produces: `Endgames` default export (no props) — unchanged interface from `App.jsx`'s point of view (`{screen === 'endgames' && <Endgames />}` needs no changes).

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/screens/Endgames.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Endgames from './Endgames'

vi.mock('./EndgamePuzzles', () => ({ default: () => <div>puzzles-mode</div> }))
vi.mock('./EndgameAlgorithms', () => ({ default: () => <div>algorithms-mode</div> }))

describe('Endgames mode dispatcher', () => {
  it('shows Puzzles mode by default and switches to Algorithms on click', () => {
    render(<Endgames />)
    expect(screen.getByText('puzzles-mode')).toBeInTheDocument()

    fireEvent.click(screen.getByText(/Algorithms/i))
    expect(screen.getByText('algorithms-mode')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- Endgames.test`
Expected: FAIL — the current `Endgames.jsx` just re-exports `EndgamePuzzles`, has no mode toggle, so the "Algorithms" click target doesn't exist.

- [ ] **Step 3: Implement**

```jsx
// frontend/src/screens/Endgames.jsx
import { useState } from 'react'
import EndgamePuzzles from './EndgamePuzzles'
import EndgameAlgorithms from './EndgameAlgorithms'

export default function Endgames() {
  const [mode, setMode] = useState('puzzles') // 'puzzles' | 'algorithms'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '0.5px solid var(--border)' }}>
        <button
          onClick={() => setMode('puzzles')}
          style={{
            padding: '6px 14px', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 500,
            background: mode === 'puzzles' ? 'var(--green-bg)' : 'var(--bg2)',
            border: `0.5px solid ${mode === 'puzzles' ? 'var(--green-border)' : 'var(--border)'}`,
            color: mode === 'puzzles' ? 'var(--green)' : 'var(--text2)',
          }}
        >
          Puzzles
        </button>
        <button
          onClick={() => setMode('algorithms')}
          style={{
            padding: '6px 14px', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 500,
            background: mode === 'algorithms' ? 'var(--green-bg)' : 'var(--bg2)',
            border: `0.5px solid ${mode === 'algorithms' ? 'var(--green-border)' : 'var(--border)'}`,
            color: mode === 'algorithms' ? 'var(--green)' : 'var(--text2)',
          }}
        >
          Algorithms
        </button>
      </div>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {mode === 'puzzles' ? <EndgamePuzzles /> : <EndgameAlgorithms />}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npm test -- Endgames.test`
Expected: 1 passed

- [ ] **Step 5: Run the full frontend suite, then a full build**

Run: `cd frontend && npm test`
Expected: all passing.

Run: `cd frontend && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/screens/Endgames.jsx frontend/src/screens/Endgames.test.jsx
git commit -m "feat: wire EndgameAlgorithms into Endgames as a mode toggle"
```
