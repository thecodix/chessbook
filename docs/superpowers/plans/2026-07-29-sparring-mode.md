# Sparring Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Sparring" training mode where the user starts mid-repertoire and faces a non-deterministic rival, without touching the existing linear SM-2 drill mode — plus the test harnesses (backend + frontend) needed to verify it, since neither exists in this repo today.

**Architecture:** Backend: two new endpoints (`GET /api/sparring/next`, `POST /api/sparring/evaluate`) backed by pure, unit-tested selection/evaluation logic in `app/sparring_logic.py`, plus one new model (`SparringStats`) tracked separately from `LineProgress` so sparring practice never touches the SM-2 schedule. Frontend: a new top-level screen (`SparringMode.jsx`) reusing the existing shared `Board` component, driven by a pure reducer (`sparringState.js`) so the state machine is unit-testable without simulating canvas clicks.

**Tech Stack:** FastAPI + SQLAlchemy + pytest (backend), React + Vitest + React Testing Library (frontend, newly added).

This plan supersedes `implementation.md`'s Fases 1–6 with the corrected design from that document's own "Análisis de Fase 0" section (no node/FEN tree exists — `Line`/`LineProgress` are flat; no Alembic in use; Stockfish lives server-side and is out of scope for v1).

## Global Constraints

- Backend commands run from the `backend/` directory. Install dev deps once: `pip install -e ".[dev]"`. Run tests with `python -m pytest` (not bare `pytest` — the app package must resolve via cwd on `sys.path`, which `python -m` guarantees).
- **Never let a test trigger FastAPI's startup events.** `app/main.py`'s `startup()` runs `Base.metadata.create_all` and `_seed()` against the real `DATABASE_URL` (defaults to a local Postgres instance), and `startup_stockfish()` spawns a subprocess. Starlette only fires these when `TestClient` is used as a context manager (`with TestClient(app) as c:`). Every fixture/test in this plan instantiates `TestClient(app)` directly, without `with`, so startup never runs.
- **No Alembic migrations in this codebase**, despite `alembic` being a listed dependency — there is no `alembic.ini` or migrations directory. Schema changes are just new SQLAlchemy model classes; `Base.metadata.create_all(bind=engine)` in `main.py:200` creates any new table automatically on next real startup. Do not add a migration file.
- **SAN comparison strips only `+`/`#`**, mirroring `frontend/src/utils/chess.js:stripSan` and how `Study.jsx:297` already checks drill-mode correctness (`stripSan(moveResult.san) === stripSan(expected)`). Do NOT reuse `backend/app/routers/games.py`'s `_strip` — that one also strips `x` and is for a different, cross-source (chess.com PGN vs. local) comparison.
- All new endpoints require `Depends(get_current_user)` (see `app/routers/repertoire.py` for the pattern), mount under `/api/sparring`, and Pydantic schemas use `ConfigDict(alias_generator=to_camel, populate_by_name=True)` — matches every existing router.
- Prefix/divergence grouping for rival-move selection is scoped to lines within the same `Opening` — matches `games.py::_compute_gaps`'s existing per-opening grouping. Cross-opening prefix sharing is negligible in the current catalog (5 openings, distinct first moves per color) and explicitly out of scope.
- FEN generation reuses `backend/app/routers/games.py::_fen_from_prefix` (python-chess `push_san` from an empty board) — do not reinvent it. It tolerates SAN without `+`/`#` suffixes, so the `+`/`#`-stripped move strings can be fed to it directly.
- Frontend test stack: Vitest + `@testing-library/react`, run via `npm test` (`vitest run`).
- Sparring is a **new top-level screen** (`SCREENS` entry in `App.jsx`), not a toggle inside `Study.jsx`. `App.jsx` already conditionally mounts exactly one screen at a time (`{screen === 'repertoire' && <Study .../>}`), which is the same isolation every other screen (Problems, Endgames) already relies on — no new isolation mechanism is needed, and none should be built.
- Full move-by-canvas-click flows are **not** covered by component tests in this plan — `Board.jsx` computes clicks from canvas pixel coordinates, which is impractical to drive from jsdom. State-machine correctness is instead fully covered by pure reducer unit tests (Task 9), and the component test only exercises the color-select → fetch → render path.

---

## Task 1: Backend test harness

**Files:**
- Create: `backend/tests/__init__.py` (empty)
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_health.py`

**Interfaces:**
- Produces: pytest fixtures `db_session` (a SQLAlchemy `Session` against an in-memory SQLite DB, fresh per test) and `client` (a `fastapi.testclient.TestClient` with `get_db` and `get_current_user` overridden) and `test_user` (a persisted `models.User`). Every later backend task's tests depend on these three fixture names.

- [ ] **Step 1: Write the harness**

```python
# backend/tests/__init__.py
```

```python
# backend/tests/conftest.py
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.database import Base, get_db
from app.auth import get_current_user
from app import models
from app.main import app


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def test_user(db_session):
    user = models.User(username="tester", hashed_password="x")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def client(db_session, test_user):
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: test_user
    # Deliberately NOT `with TestClient(app) as c:` — see Global Constraints:
    # that form fires @app.on_event("startup"), which touches the real DB.
    yield TestClient(app)
    app.dependency_overrides.clear()
```

- [ ] **Step 2: Write a smoke test proving the harness works end-to-end**

```python
# backend/tests/test_health.py
def test_health_endpoint(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
```

- [ ] **Step 3: Install dev deps and run**

Run: `cd backend && pip install -e ".[dev]" && python -m pytest tests/test_health.py -v`
Expected: 1 passed. If it fails with a connection error to Postgres, the `with TestClient(...)` mistake was made somewhere — double check `conftest.py`.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/__init__.py backend/tests/conftest.py backend/tests/test_health.py
git commit -m "test: add backend pytest harness with isolated SQLite + auth override"
```

---

## Task 2: Frontend test harness

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.js`
- Create: `frontend/src/test-setup.js`
- Create: `frontend/src/utils/chess.test.js`

**Interfaces:**
- Produces: `npm test` running Vitest with jsdom + `@testing-library/jest-dom` matchers available globally. Later frontend tasks' tests assume this is already wired.

- [ ] **Step 1: Install dev dependencies**

Run: `cd frontend && npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event`

- [ ] **Step 2: Wire Vitest into the existing Vite config**

```javascript
// frontend/vite.config.js
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': process.env.API_URL ?? 'http://localhost:8000'
    },
    watch: {
      usePolling: true,
      interval: 300,
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.js',
  },
})
```

```javascript
// frontend/src/test-setup.js
import '@testing-library/jest-dom'
```

- [ ] **Step 3: Add the `test` script**

In `frontend/package.json`, add to `"scripts"`:
```json
"test": "vitest run"
```

- [ ] **Step 4: Write a failing-then-passing smoke test against existing code**

```javascript
// frontend/src/utils/chess.test.js
import { describe, it, expect } from 'vitest'
import { stripSan } from './chess'

describe('stripSan', () => {
  it('removes check and mate suffixes', () => {
    expect(stripSan('Nxd4+')).toBe('Nxd4')
    expect(stripSan('Qh5#')).toBe('Qh5')
  })

  it('leaves moves without suffixes untouched', () => {
    expect(stripSan('cxd4')).toBe('cxd4')
  })

  it('handles empty input', () => {
    expect(stripSan('')).toBe('')
  })
})
```

- [ ] **Step 5: Run**

Run: `cd frontend && npm test`
Expected: 3 passed (this exercises real, already-shipped code — a genuine smoke test that the harness works, not a placeholder).

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.js frontend/src/test-setup.js frontend/src/utils/chess.test.js
git commit -m "test: add Vitest + React Testing Library harness for the frontend"
```

---

## Task 3: `SparringStats` model, isolated from `LineProgress`

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/tests/test_sparring_stats_isolation.py`

**Interfaces:**
- Produces: `models.SparringStats` with composite primary key `(user_id, line_id, ply_index)` and columns `sparring_attempts: int`, `sparring_correct: int`, `last_sparring_result: Optional[str]` (`"correct" | "unknown"`), `last_attempt_at: Optional[datetime]`. Tasks 5 and 7 query/write this table.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_sparring_stats_isolation.py
from datetime import date

from app import models


def test_sparring_stats_does_not_affect_line_progress(db_session):
    user = models.User(username="u1", hashed_password="x")
    opening = models.Opening(id="test-op", name="Test", color="white")
    line = models.Line(opening_id="test-op", label="L1", moves=["e4", "e5", "Nf3"])
    db_session.add_all([user, opening, line])
    db_session.commit()
    db_session.refresh(user)
    db_session.refresh(line)

    progress = models.LineProgress(
        user_id=user.id, line_id=line.id,
        next_review=date(2026, 8, 1), interval_days=6, repetitions=2,
    )
    db_session.add(progress)
    db_session.commit()

    stats = models.SparringStats(
        user_id=user.id, line_id=line.id, ply_index=2,
        sparring_attempts=1, sparring_correct=1, last_sparring_result="correct",
    )
    db_session.add(stats)
    db_session.commit()

    db_session.refresh(progress)
    assert progress.next_review == date(2026, 8, 1)
    assert progress.interval_days == 6
    assert progress.repetitions == 2


def test_sparring_stats_composite_key_scopes_by_ply(db_session):
    user = models.User(username="u2", hashed_password="x")
    opening = models.Opening(id="test-op2", name="Test2", color="white")
    line = models.Line(opening_id="test-op2", label="L1", moves=["d4", "d5", "Bf4", "Nf6"])
    db_session.add_all([user, opening, line])
    db_session.commit()
    db_session.refresh(user)
    db_session.refresh(line)

    db_session.add(models.SparringStats(user_id=user.id, line_id=line.id, ply_index=2, sparring_attempts=3))
    db_session.add(models.SparringStats(user_id=user.id, line_id=line.id, ply_index=4, sparring_attempts=1))
    db_session.commit()

    rows = db_session.query(models.SparringStats).filter_by(user_id=user.id, line_id=line.id).all()
    assert {(r.ply_index, r.sparring_attempts) for r in rows} == {(2, 3), (4, 1)}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_sparring_stats_isolation.py -v`
Expected: FAIL — `AttributeError: module 'app.models' has no attribute 'SparringStats'`

- [ ] **Step 3: Add the model**

In `backend/app/models.py`, add after `LineProgress`:

```python
class SparringStats(Base):
    """Per-user, per-(line, ply) practice stats for Sparring mode. Kept
    fully separate from LineProgress/Line's SM-2 fields on purpose — sparring
    is a reinforcement signal, never an input to the spaced-repetition
    schedule for the linear drill mode."""
    __tablename__ = "sparring_stats"

    user_id   = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    line_id   = Column(Integer, ForeignKey("lines.id", ondelete="CASCADE"), primary_key=True)
    ply_index = Column(Integer, primary_key=True)

    sparring_attempts    = Column(Integer, default=0, nullable=False)
    sparring_correct     = Column(Integer, default=0, nullable=False)
    last_sparring_result = Column(String,  nullable=True)   # "correct" | "unknown"
    last_attempt_at      = Column(DateTime, nullable=True)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_sparring_stats_isolation.py -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/models.py backend/tests/test_sparring_stats_isolation.py
git commit -m "feat: add SparringStats model, isolated from LineProgress"
```

---

## Task 4: Position-selection pure logic (divergence + weighting)

**Files:**
- Create: `backend/app/sparring_logic.py`
- Create: `backend/tests/test_sparring_logic_selection.py`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure, DB-agnostic).
- Produces: `LineInfo` (dataclass: `line_id: int, opening_id: str, moves: list[str], repetitions: int`), `StatsInfo` (dataclass: `attempts: int = 0, last_result: Optional[str] = None, last_attempt_at: Optional[datetime] = None`), `SparringCandidate` (dataclass: `line_id: int, opening_id: str, ply_index: int, weight: float`), `build_sparring_candidates(lines, stats, color, now=None) -> list[SparringCandidate]`, `select_sparring_node(candidates, rng) -> Optional[SparringCandidate]`. Task 5's endpoint calls both; Task 10's audit script calls `count_divergent_positions` added in Task 10.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_sparring_logic_selection.py
import random
from datetime import datetime, timedelta

from app.sparring_logic import LineInfo, StatsInfo, build_sparring_candidates, select_sparring_node


def _line(line_id, opening_id, moves, repetitions=0):
    return LineInfo(line_id=line_id, opening_id=opening_id, moves=moves, repetitions=repetitions)


def test_candidates_exclude_positions_shallower_than_two_plies():
    lines = [_line(1, "op", ["e4", "e5", "Nf3", "Nc6"])]
    candidates = build_sparring_candidates(lines, {}, color="white")
    assert [c.ply_index for c in candidates] == [2]


def test_divergent_prefix_gets_higher_weight_than_unique_prefix():
    lines = [
        _line(1, "op", ["e4", "c5", "Nf3", "d6", "d4", "cxd4"]),
        _line(2, "op", ["e4", "c5", "Nc3", "Nc6", "g3", "g6"]),
        _line(3, "op", ["d4", "d5", "Bf4", "Nf6", "e3", "e6"]),
    ]
    candidates = build_sparring_candidates(lines, {}, color="white")
    by_key = {(c.line_id, c.ply_index): c for c in candidates}
    assert by_key[(1, 2)].weight > by_key[(3, 2)].weight
    assert by_key[(2, 2)].weight > by_key[(3, 2)].weight


def test_recent_wrong_result_lowers_weight_via_cooldown():
    lines = [_line(1, "op", ["e4", "e5", "Nf3", "Nc6"])]
    now = datetime(2026, 7, 29, 12, 0, 0)
    recent = build_sparring_candidates(
        lines, {(1, 2): StatsInfo(attempts=1, last_result="unknown", last_attempt_at=now - timedelta(minutes=10))},
        color="white", now=now,
    )[0]
    stale = build_sparring_candidates(
        lines, {(1, 2): StatsInfo(attempts=1, last_result="unknown", last_attempt_at=now - timedelta(hours=2))},
        color="white", now=now,
    )[0]
    assert recent.weight < stale.weight


def test_select_sparring_node_returns_none_for_no_candidates():
    assert select_sparring_node([], random.Random(0)) is None


def test_select_sparring_node_is_deterministic_given_the_same_rng_seed():
    lines = [_line(1, "op", ["e4", "e5", "Nf3", "Nc6"]), _line(2, "op2", ["d4", "d5", "Bf4", "Nf6"])]
    candidates = build_sparring_candidates(lines, {}, color="white")
    a = select_sparring_node(candidates, random.Random(42))
    b = select_sparring_node(candidates, random.Random(42))
    assert (a.line_id, a.ply_index) == (b.line_id, b.ply_index)
```

Note: `last_result="unknown"` (not `"wrong"`) is deliberate — v1 has no engine, so the only two evaluate outcomes are `"correct"`/`"unknown"` (see Global Constraints and Task 6); the cooldown applies to any recent non-`"correct"` result.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_sparring_logic_selection.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.sparring_logic'`

- [ ] **Step 3: Implement**

```python
# backend/app/sparring_logic.py
"""Pure, DB-agnostic logic for Sparring mode: which position to serve next,
and (added in Task 6) how the rival replies and whether the user's move was
correct. Kept free of SQLAlchemy/FastAPI so it's fast and trivial to test."""
import random
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

COOLDOWN = timedelta(hours=1)


@dataclass
class LineInfo:
    line_id: int
    opening_id: str
    moves: list[str]       # already +/#-stripped SAN, full line
    repetitions: int       # from LineProgress; 0 if the user has none yet


@dataclass
class StatsInfo:
    attempts: int = 0
    last_result: Optional[str] = None
    last_attempt_at: Optional[datetime] = None


@dataclass
class SparringCandidate:
    line_id: int
    opening_id: str
    ply_index: int
    weight: float


def _is_user_ply(ply_index: int, color: str) -> bool:
    return (ply_index % 2 == 0) if color == "white" else (ply_index % 2 == 1)


def _divergence_map(lines: list[LineInfo], color: str) -> dict:
    """(opening_id, prefix) -> set of distinct next moves, at user-move plies
    only. A size >= 2 means the user could plausibly transpose between two
    of their own known lines at that position — see implementation.md's
    Fase 2 correction on why this must gate the 'free rival' value."""
    divergence: dict = {}
    for line in lines:
        for i in range(len(line.moves)):
            if not _is_user_ply(i, color):
                continue
            prefix = tuple(line.moves[:i])
            divergence.setdefault((line.opening_id, prefix), set()).add(line.moves[i])
    return divergence


def build_sparring_candidates(
    lines: list[LineInfo],
    stats: dict,
    color: str,
    now: Optional[datetime] = None,
) -> list[SparringCandidate]:
    """One candidate per (line, user-move ply) with ply_index >= 2 (skip the
    opening two plies so there's already some context), weighted by:
    divergence (does a sibling line diverge here?), practice recency
    (fewer past attempts -> higher weight), SM-2 maturity of the line, and a
    cooldown that deprioritizes positions the user got wrong recently."""
    now = now or datetime.utcnow()
    divergence = _divergence_map(lines, color)

    candidates = []
    for line in lines:
        for i in range(2, len(line.moves)):
            if not _is_user_ply(i, color):
                continue
            prefix = tuple(line.moves[:i])
            n_options = len(divergence.get((line.opening_id, prefix), set()))
            divergence_factor = 3.0 if n_options >= 2 else 1.0

            st = stats.get((line.line_id, i), StatsInfo())
            attempts_factor = 1.0 / (1 + st.attempts)
            maturity_factor = 1.0 + min(line.repetitions, 5) * 0.2

            cooldown_factor = 1.0
            if st.last_result is not None and st.last_result != "correct" \
                    and st.last_attempt_at and now - st.last_attempt_at < COOLDOWN:
                cooldown_factor = 0.2

            weight = divergence_factor * attempts_factor * maturity_factor * cooldown_factor
            candidates.append(SparringCandidate(
                line_id=line.line_id, opening_id=line.opening_id,
                ply_index=i, weight=weight,
            ))
    return candidates


def select_sparring_node(
    candidates: list[SparringCandidate],
    rng: random.Random,
) -> Optional[SparringCandidate]:
    if not candidates:
        return None
    weights = [c.weight for c in candidates]
    return rng.choices(candidates, weights=weights, k=1)[0]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_sparring_logic_selection.py -v`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/sparring_logic.py backend/tests/test_sparring_logic_selection.py
git commit -m "feat: add pure sparring position-selection logic with divergence weighting"
```

---

## Task 5: `GET /api/sparring/next` endpoint

**Files:**
- Create: `backend/app/routers/sparring.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_sparring_next_endpoint.py`

**Interfaces:**
- Consumes: `models.SparringStats` (Task 3), `build_sparring_candidates`/`select_sparring_node`/`LineInfo`/`StatsInfo` (Task 4), `_fen_from_prefix` from `app.routers.games` (existing).
- Produces: `SparringNextOut` schema (`lineId, openingId, openingName, plyIndex, fen, color, movesSoFar`) and `_strip_san` helper. Task 7's evaluate endpoint reuses `_strip_san` (import from `app.routers.sparring`).

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_sparring_next_endpoint.py
from app import models


def test_sparring_next_requires_auth():
    from app.auth import get_current_user
    from app.main import app
    app.dependency_overrides.pop(get_current_user, None)
    from fastapi.testclient import TestClient
    resp = TestClient(app).get("/api/sparring/next?color=white")
    assert resp.status_code == 401
    app.dependency_overrides.clear()


def test_sparring_next_404s_when_no_line_has_two_plies(client, db_session, test_user):
    opening = models.Opening(id="op1", name="Op1", color="white")
    line = models.Line(opening_id="op1", label="L1", moves=["e4"])
    db_session.add_all([opening, line])
    db_session.commit()
    db_session.add(models.UserOpening(user_id=test_user.id, opening_id="op1"))
    db_session.commit()

    resp = client.get("/api/sparring/next?color=white")
    assert resp.status_code == 404


def test_sparring_next_returns_a_position(client, db_session, test_user):
    opening = models.Opening(id="op1", name="Op1", color="white")
    line = models.Line(opening_id="op1", label="L1", moves=["e4", "e5", "Nf3", "Nc6"])
    db_session.add_all([opening, line])
    db_session.commit()
    db_session.refresh(line)
    db_session.add(models.UserOpening(user_id=test_user.id, opening_id="op1"))
    db_session.commit()

    resp = client.get("/api/sparring/next?color=white")
    assert resp.status_code == 200
    body = resp.json()
    assert body["lineId"] == line.id
    assert body["plyIndex"] == 2
    assert body["color"] == "white"
    assert body["movesSoFar"] == ["e4", "e5"]
    assert body["fen"].split(" ")[1] == "w"   # ply_index=2 -> White to move next


def test_sparring_next_ignores_openings_not_in_the_users_selection(client, db_session, test_user):
    selected = models.Opening(id="op1", name="Selected", color="white")
    unselected = models.Opening(id="op2", name="Unselected", color="white")
    db_session.add_all([
        selected, unselected,
        models.Line(opening_id="op1", label="L1", moves=["e4", "e5", "Nf3", "Nc6"]),
        models.Line(opening_id="op2", label="L1", moves=["d4", "d5", "Bf4", "Nf6"]),
    ])
    db_session.commit()
    db_session.add(models.UserOpening(user_id=test_user.id, opening_id="op1"))
    db_session.commit()

    resp = client.get("/api/sparring/next?color=white")
    assert resp.status_code == 200
    assert resp.json()["openingId"] == "op1"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_sparring_next_endpoint.py -v`
Expected: FAIL — 404 (route doesn't exist) on every test.

- [ ] **Step 3: Implement the router**

```python
# backend/app/routers/sparring.py
import random
import re
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.routers.games import _fen_from_prefix
from app.sparring_logic import (
    LineInfo, StatsInfo, build_sparring_candidates, select_sparring_node,
)
from app import models

router = APIRouter()


def _strip_san(san: str) -> str:
    """Mirrors frontend/src/utils/chess.js:stripSan — strips only +/#, NOT
    games.py's `_strip` (which also removes 'x' for a different purpose)."""
    return re.sub(r"[+#]", "", san) if san else ""


def _stripped_moves(line: models.Line) -> list[str]:
    return [_strip_san(m) for m in line.moves]


# ── Schemas ────────────────────────────────────────────────────────────────────

class SparringNextOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    line_id:      int
    opening_id:   str
    opening_name: str
    ply_index:    int
    fen:          str
    color:        str
    moves_so_far: list[str]


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/next", response_model=SparringNextOut)
def sparring_next(
    color: Literal["white", "black"] = Query(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    selected_ids = [r[0] for r in db.query(models.UserOpening.opening_id).filter_by(user_id=user.id).all()]
    rows = (
        db.query(models.Line, models.Opening)
        .join(models.Opening)
        .filter(models.Opening.color == color, models.Opening.id.in_(selected_ids))
        .all()
    )
    if not rows:
        raise HTTPException(404, f"No {color} repertoire lines available for sparring")

    line_ids = [line.id for line, _ in rows]
    progress_by_line = {
        p.line_id: p
        for p in db.query(models.LineProgress).filter(
            models.LineProgress.user_id == user.id,
            models.LineProgress.line_id.in_(line_ids),
        ).all()
    }
    stats_map = {
        (s.line_id, s.ply_index): StatsInfo(
            attempts=s.sparring_attempts, last_result=s.last_sparring_result,
            last_attempt_at=s.last_attempt_at,
        )
        for s in db.query(models.SparringStats).filter(
            models.SparringStats.user_id == user.id,
            models.SparringStats.line_id.in_(line_ids),
        ).all()
    }

    line_infos = [
        LineInfo(
            line_id=line.id, opening_id=line.opening_id,
            moves=_stripped_moves(line),
            repetitions=progress_by_line[line.id].repetitions if line.id in progress_by_line else 0,
        )
        for line, _ in rows
    ]

    candidates = build_sparring_candidates(line_infos, stats_map, color)
    chosen = select_sparring_node(candidates, random.Random())
    if chosen is None:
        raise HTTPException(404, f"No {color} repertoire lines are deep enough for sparring yet (need >= 2 plies)")

    line, opening = next((l, o) for l, o in rows if l.id == chosen.line_id)
    stripped = _stripped_moves(line)
    prefix = stripped[: chosen.ply_index]
    fen = _fen_from_prefix(prefix)
    if fen is None:
        raise HTTPException(500, "Could not derive a position from this line")

    return SparringNextOut(
        line_id=line.id, opening_id=opening.id, opening_name=opening.name,
        ply_index=chosen.ply_index, fen=fen, color=color, moves_so_far=prefix,
    )
```

Mount it in `backend/app/main.py`:

```python
# add to the import line
from app.routers import repertoire, games, users, analysis, problems, endgames, sparring
```

```python
# add alongside the other app.include_router(...) calls
app.include_router(sparring.router,    prefix="/api/sparring",    tags=["sparring"])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_sparring_next_endpoint.py -v`
Expected: 4 passed

- [ ] **Step 5: Run the full backend suite to catch regressions**

Run: `cd backend && python -m pytest -v`
Expected: all passing (no test in Tasks 1–4 should be affected by this router addition).

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/sparring.py backend/app/main.py backend/tests/test_sparring_next_endpoint.py
git commit -m "feat: add GET /api/sparring/next endpoint"
```

---

## Task 6: Rival-move and evaluation pure logic

**Files:**
- Modify: `backend/app/sparring_logic.py`
- Create: `backend/tests/test_sparring_logic_evaluation.py`

**Interfaces:**
- Consumes: nothing new (pure).
- Produces: `choose_opponent_move(matching_lines, ply_index, rng) -> Optional[str]`, `classify_user_move(matching_lines, ply_index, move_played) -> str` (`"correct" | "unknown"`). Task 7's endpoint calls both.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_sparring_logic_evaluation.py
import random

from app.sparring_logic import choose_opponent_move, classify_user_move


def test_classify_user_move_correct_via_transposition():
    # User's sparring node came from line A, but plays the move that's only
    # recorded in sibling line B, which shares the same prefix — must still
    # count as correct (implementation.md's Fase 4 correction).
    matching = [
        ["e4", "c5", "Nf3", "d6"],
        ["e4", "c5", "Nf3", "Nc6"],
    ]
    assert classify_user_move(matching, ply_index=3, move_played="Nc6") == "correct"


def test_classify_user_move_unknown_when_not_in_any_sibling():
    matching = [["e4", "c5", "Nf3", "d6"]]
    assert classify_user_move(matching, ply_index=3, move_played="a6") == "unknown"


def test_choose_opponent_move_only_returns_existing_continuations():
    matching = [["e4", "c5", "Nf3", "Nc6", "d4"], ["e4", "c5", "Nf3", "Nc6", "Bb5"]]
    for _ in range(20):
        move = choose_opponent_move(matching, ply_index=4, rng=random.Random())
        assert move in {"d4", "Bb5"}


def test_choose_opponent_move_none_when_book_ends():
    matching = [["e4", "c5", "Nf3", "Nc6"]]
    assert choose_opponent_move(matching, ply_index=4, rng=random.Random()) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_sparring_logic_evaluation.py -v`
Expected: FAIL — `ImportError: cannot import name 'choose_opponent_move'`

- [ ] **Step 3: Implement**

Append to `backend/app/sparring_logic.py`:

```python
def choose_opponent_move(
    matching_lines: list,
    ply_index: int,
    rng: random.Random,
) -> Optional[str]:
    """Fase 3 Option A: the rival picks uniformly among whichever of the
    user's OWN repertoire lines still have a recorded move at ply_index,
    given `matching_lines` already filtered to ones consistent with the
    game so far. None means the user's book ends here."""
    options = [line[ply_index] for line in matching_lines if len(line) > ply_index]
    if not options:
        return None
    return rng.choice(options)


def classify_user_move(
    matching_lines: list,
    ply_index: int,
    move_played: str,
) -> str:
    """'correct' if move_played matches ANY sibling line's move at
    ply_index — covers transposing into a different known line that shares
    the same prefix. 'unknown' otherwise (no engine in v1)."""
    for line in matching_lines:
        if len(line) > ply_index and line[ply_index] == move_played:
            return "correct"
    return "unknown"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_sparring_logic_evaluation.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/sparring_logic.py backend/tests/test_sparring_logic_evaluation.py
git commit -m "feat: add pure rival-move and move-classification logic"
```

---

## Task 7: `POST /api/sparring/evaluate` endpoint

**Files:**
- Modify: `backend/app/routers/sparring.py`
- Create: `backend/tests/test_sparring_evaluate_endpoint.py`

**Interfaces:**
- Consumes: `choose_opponent_move`/`classify_user_move` (Task 6), `_strip_san`/`_stripped_moves` (Task 5, same file), `models.SparringStats` (Task 3).
- Produces: `SparringEvaluateOut` schema (`result, opponentMove, opponentFen, sessionOver`). Task 9's frontend API client and reducer consume exactly this shape.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_sparring_evaluate_endpoint.py
from app import models


def _setup_sicilian(db_session):
    opening = models.Opening(id="op1", name="Sicilian", color="black")
    line_a = models.Line(opening_id="op1", label="A", moves=["e4", "c5", "Nf3", "d6", "d4", "cxd4"])
    line_b = models.Line(opening_id="op1", label="B", moves=["e4", "c5", "Nf3", "Nc6", "Bb5", "a6"])
    db_session.add_all([opening, line_a, line_b])
    db_session.commit()
    db_session.refresh(line_a)
    db_session.refresh(line_b)
    return line_a, line_b


def test_evaluate_correct_move_via_transposition_returns_opponent_reply(client, db_session, test_user):
    line_a, line_b = _setup_sicilian(db_session)

    resp = client.post("/api/sparring/evaluate", json={
        "lineId": line_b.id, "plyIndex": 3, "movePlayed": "d6",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["result"] == "correct"
    assert body["opponentMove"] == "d4"
    assert body["opponentFen"]
    assert body["sessionOver"] is False


def test_evaluate_unknown_move_ends_the_session(client, db_session, test_user):
    line_a, _ = _setup_sicilian(db_session)

    resp = client.post("/api/sparring/evaluate", json={
        "lineId": line_a.id, "plyIndex": 3, "movePlayed": "a6",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["result"] == "unknown"
    assert body["opponentMove"] is None
    assert body["sessionOver"] is True


def test_evaluate_persists_sparring_stats(client, db_session, test_user):
    line_a, _ = _setup_sicilian(db_session)

    client.post("/api/sparring/evaluate", json={"lineId": line_a.id, "plyIndex": 3, "movePlayed": "d6"})

    stats = db_session.query(models.SparringStats).filter_by(
        user_id=test_user.id, line_id=line_a.id, ply_index=3,
    ).first()
    assert stats is not None
    assert stats.sparring_attempts == 1
    assert stats.sparring_correct == 1
    assert stats.last_sparring_result == "correct"


def test_evaluate_second_attempt_at_same_node_increments_attempts(client, db_session, test_user):
    line_a, _ = _setup_sicilian(db_session)

    client.post("/api/sparring/evaluate", json={"lineId": line_a.id, "plyIndex": 3, "movePlayed": "a6"})
    client.post("/api/sparring/evaluate", json={"lineId": line_a.id, "plyIndex": 3, "movePlayed": "d6"})

    stats = db_session.query(models.SparringStats).filter_by(
        user_id=test_user.id, line_id=line_a.id, ply_index=3,
    ).first()
    assert stats.sparring_attempts == 2
    assert stats.sparring_correct == 1
    assert stats.last_sparring_result == "correct"


def test_evaluate_requires_auth():
    from app.auth import get_current_user
    from app.main import app
    from fastapi.testclient import TestClient
    app.dependency_overrides.pop(get_current_user, None)
    resp = TestClient(app).post("/api/sparring/evaluate", json={"lineId": 1, "plyIndex": 1, "movePlayed": "e5"})
    assert resp.status_code == 401
    app.dependency_overrides.clear()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_sparring_evaluate_endpoint.py -v`
Expected: FAIL — 404 (route doesn't exist yet) on the non-auth tests.

- [ ] **Step 3: Implement**

Append to `backend/app/routers/sparring.py` (add `from datetime import datetime` and `from app.sparring_logic import choose_opponent_move, classify_user_move` to the existing import block at the top, alongside the Task-5 imports):

```python
class SparringEvaluateIn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    line_id:     int
    ply_index:   int
    move_played: str


class SparringEvaluateOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    result:         str
    opponent_move:  Optional[str] = None
    opponent_fen:   Optional[str] = None
    session_over:   bool


@router.post("/evaluate", response_model=SparringEvaluateOut)
def sparring_evaluate(
    body: SparringEvaluateIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    line = db.query(models.Line).filter_by(id=body.line_id).first()
    if not line:
        raise HTTPException(404, "Line not found")

    sibling_lines = db.query(models.Line).filter_by(opening_id=line.opening_id).all()
    stripped_by_line = {sib.id: _stripped_moves(sib) for sib in sibling_lines}

    prefix = stripped_by_line[line.id][: body.ply_index]
    matching = [mv for mv in stripped_by_line.values() if mv[: body.ply_index] == prefix]

    move_played = _strip_san(body.move_played)
    result = classify_user_move(matching, body.ply_index, move_played)

    stats = db.query(models.SparringStats).filter_by(
        user_id=user.id, line_id=body.line_id, ply_index=body.ply_index,
    ).first()
    if stats is None:
        stats = models.SparringStats(user_id=user.id, line_id=body.line_id, ply_index=body.ply_index)
        db.add(stats)
    stats.sparring_attempts += 1
    if result == "correct":
        stats.sparring_correct += 1
    stats.last_sparring_result = result
    stats.last_attempt_at = datetime.utcnow()
    db.commit()

    opponent_move: Optional[str] = None
    opponent_fen:  Optional[str] = None
    if result == "correct":
        continuing = [mv for mv in matching if len(mv) > body.ply_index and mv[body.ply_index] == move_played]
        opponent_move = choose_opponent_move(continuing, body.ply_index + 1, random.Random())
        if opponent_move is not None:
            opponent_fen = _fen_from_prefix(prefix + [move_played, opponent_move])

    return SparringEvaluateOut(
        result=result, opponent_move=opponent_move, opponent_fen=opponent_fen,
        session_over=(result != "correct" or opponent_move is None),
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_sparring_evaluate_endpoint.py -v`
Expected: 5 passed

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && python -m pytest -v`
Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/sparring.py backend/tests/test_sparring_evaluate_endpoint.py
git commit -m "feat: add POST /api/sparring/evaluate endpoint"
```

---

## Task 8: Frontend API client for Sparring

**Files:**
- Modify: `frontend/src/utils/api.js`
- Create: `frontend/src/utils/api.sparring.test.js`

**Interfaces:**
- Produces: `getSparringNext(color) -> Promise`, `evaluateSparringMove(lineId, plyIndex, movePlayed) -> Promise`. Task 9's `SparringMode.jsx` imports both.

- [ ] **Step 1: Write the failing tests**

```javascript
// frontend/src/utils/api.sparring.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSparringNext, evaluateSparringMove, setToken } from './api'

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

describe('sparring api client', () => {
  it('getSparringNext calls GET /sparring/next with the color query param and auth header', async () => {
    global.fetch.mockReturnValue(jsonResponse({ lineId: 1 }))
    await getSparringNext('white')
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/sparring/next?color=white',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) }),
    )
  })

  it('evaluateSparringMove POSTs the move payload as camelCase JSON', async () => {
    global.fetch.mockReturnValue(jsonResponse({ result: 'correct' }))
    await evaluateSparringMove(7, 3, 'd6')
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/sparring/evaluate')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ lineId: 7, plyIndex: 3, movePlayed: 'd6' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- api.sparring`
Expected: FAIL — `getSparringNext is not a function`

- [ ] **Step 3: Implement**

Append to `frontend/src/utils/api.js`:

```javascript
// ── Sparring ───────────────────────────────────────────────────────────────────

export const getSparringNext = (color) =>
  req(`/sparring/next?color=${encodeURIComponent(color)}`)

export const evaluateSparringMove = (lineId, plyIndex, movePlayed) =>
  req('/sparring/evaluate', {
    method: 'POST',
    body: JSON.stringify({ lineId, plyIndex, movePlayed }),
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- api.sparring`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/api.js frontend/src/utils/api.sparring.test.js
git commit -m "feat: add frontend API client for sparring endpoints"
```

---

## Task 9: Sparring state reducer + `SparringMode` screen

**Files:**
- Create: `frontend/src/utils/sparringState.js`
- Create: `frontend/src/utils/sparringState.test.js`
- Create: `frontend/src/screens/SparringMode.jsx`
- Create: `frontend/src/screens/SparringMode.test.jsx`

**Interfaces:**
- Consumes: `getSparringNext`/`evaluateSparringMove` (Task 8), `Board` (existing, `frontend/src/components/Board.jsx`).
- Produces: default export `SparringMode` (no props). Task 10's `App.jsx` renders it.

- [ ] **Step 1: Write the failing reducer tests**

```javascript
// frontend/src/utils/sparringState.test.js
import { describe, it, expect } from 'vitest'
import { initialSparringState, sparringReducer } from './sparringState'

const NEXT_PAYLOAD = { lineId: 1, openingId: 'op1', openingName: 'Op1', plyIndex: 2, fen: 'FEN1', color: 'white' }

describe('sparringReducer', () => {
  it('started sets the position from the /next response', () => {
    const next = sparringReducer(initialSparringState, { type: 'started', payload: NEXT_PAYLOAD })
    expect(next.status).toBe('awaiting-move')
    expect(next.lineId).toBe(1)
    expect(next.plyIndex).toBe(2)
    expect(next.fen).toBe('FEN1')
    expect(next.feedback).toBe(null)
  })

  it('evaluated records correctness and stores the pending opponent reply', () => {
    const started = sparringReducer(initialSparringState, { type: 'started', payload: NEXT_PAYLOAD })
    const evaluated = sparringReducer(started, {
      type: 'evaluated',
      payload: { result: 'correct', opponentMove: 'd4', opponentFen: 'FEN2', sessionOver: false },
    })
    expect(evaluated.status).toBe('feedback')
    expect(evaluated.feedback).toBe('correct')
    expect(evaluated.sessionAttempts).toBe(1)
    expect(evaluated.sessionCorrect).toBe(1)
  })

  it('evaluated with an unknown result does not increment sessionCorrect', () => {
    const started = sparringReducer(initialSparringState, { type: 'started', payload: NEXT_PAYLOAD })
    const evaluated = sparringReducer(started, {
      type: 'evaluated',
      payload: { result: 'unknown', opponentMove: null, opponentFen: null, sessionOver: true },
    })
    expect(evaluated.sessionAttempts).toBe(1)
    expect(evaluated.sessionCorrect).toBe(0)
  })

  it('advanced moves to the opponent position when the session continues', () => {
    const state = {
      ...initialSparringState, status: 'feedback', plyIndex: 2, fen: 'FEN1',
      pendingOpponentFen: 'FEN2', pendingSessionOver: false,
    }
    const next = sparringReducer(state, { type: 'advanced' })
    expect(next.status).toBe('awaiting-move')
    expect(next.plyIndex).toBe(4)
    expect(next.fen).toBe('FEN2')
  })

  it('advanced shows the summary once the session is over', () => {
    const state = { ...initialSparringState, status: 'feedback', pendingSessionOver: true }
    const next = sparringReducer(state, { type: 'advanced' })
    expect(next.status).toBe('summary')
  })

  it('reset returns to the initial idle state', () => {
    const dirty = { ...initialSparringState, status: 'summary', sessionAttempts: 5, sessionCorrect: 3 }
    expect(sparringReducer(dirty, { type: 'reset' })).toEqual(initialSparringState)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- sparringState`
Expected: FAIL — module `./sparringState` not found.

- [ ] **Step 3: Implement the reducer**

```javascript
// frontend/src/utils/sparringState.js
export const initialSparringState = {
  status: 'idle',   // 'idle' | 'awaiting-move' | 'feedback' | 'summary'
  lineId: null,
  openingId: null,
  openingName: null,
  plyIndex: null,
  fen: null,
  color: null,
  feedback: null,   // 'correct' | 'unknown' | null
  pendingOpponentFen: null,
  pendingSessionOver: false,
  sessionCorrect: 0,
  sessionAttempts: 0,
}

export function sparringReducer(state, action) {
  switch (action.type) {
    case 'started': {
      const n = action.payload
      return {
        ...initialSparringState,
        status: 'awaiting-move',
        lineId: n.lineId, openingId: n.openingId, openingName: n.openingName,
        plyIndex: n.plyIndex, fen: n.fen, color: n.color,
        sessionCorrect: state.sessionCorrect, sessionAttempts: state.sessionAttempts,
      }
    }
    case 'evaluated': {
      const r = action.payload
      return {
        ...state,
        status: 'feedback',
        feedback: r.result,
        sessionAttempts: state.sessionAttempts + 1,
        sessionCorrect: state.sessionCorrect + (r.result === 'correct' ? 1 : 0),
        pendingOpponentFen: r.opponentFen ?? null,
        pendingSessionOver: r.sessionOver,
      }
    }
    case 'advanced': {
      if (state.pendingSessionOver) {
        return { ...state, status: 'summary', feedback: null }
      }
      return {
        ...state,
        status: 'awaiting-move',
        feedback: null,
        plyIndex: state.plyIndex + 2,
        fen: state.pendingOpponentFen,
      }
    }
    case 'reset':
      return initialSparringState
    default:
      return state
  }
}
```

- [ ] **Step 4: Run to verify the reducer tests pass**

Run: `cd frontend && npm test -- sparringState`
Expected: 6 passed

- [ ] **Step 5: Write the failing component test**

```jsx
// frontend/src/screens/SparringMode.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SparringMode from './SparringMode'
import * as api from '../utils/api'

vi.mock('../utils/api')

beforeEach(() => { vi.clearAllMocks() })

describe('SparringMode', () => {
  it('fetches and displays a position after picking a color and starting', async () => {
    api.getSparringNext.mockResolvedValue({
      lineId: 1, openingId: 'op1', openingName: 'Sicilian Dragon', plyIndex: 3,
      fen: 'rnbqkb1r/pp2pppp/3p1n2/2p5/3PP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 4',
      color: 'black',
    })

    render(<SparringMode />)
    fireEvent.click(screen.getByText(/black/i))
    fireEvent.click(screen.getByText(/start/i))

    await waitFor(() => expect(api.getSparringNext).toHaveBeenCalledWith('black'))
    expect(await screen.findByText(/Sicilian Dragon/i)).toBeInTheDocument()
  })
})
```

Note: this deliberately does not simulate a canvas click to complete a move — see Global Constraints on why full move-by-click flows are out of scope for this component test. State-machine behavior after a move is already fully covered by the reducer tests above.

- [ ] **Step 6: Run to verify it fails**

Run: `cd frontend && npm test -- SparringMode`
Expected: FAIL — module `./SparringMode` not found.

- [ ] **Step 7: Implement the component**

```jsx
// frontend/src/screens/SparringMode.jsx
import { useReducer, useState } from 'react'
import Board from '../components/Board'
import { getSparringNext, evaluateSparringMove } from '../utils/api'
import { initialSparringState, sparringReducer } from '../utils/sparringState'

const FEEDBACK_LABEL = {
  correct: 'Correct!',
  unknown: "Not in your repertoire — worth reviewing.",
}

export default function SparringMode() {
  const [color, setColor] = useState('white')
  const [state, dispatch] = useReducer(sparringReducer, initialSparringState)
  const [loading, setLoading] = useState(false)

  const start = async () => {
    setLoading(true)
    try {
      const next = await getSparringNext(color)
      dispatch({ type: 'started', payload: next })
    } finally {
      setLoading(false)
    }
  }

  const handleMove = async (moveResult) => {
    if (state.status !== 'awaiting-move') return
    const evaluation = await evaluateSparringMove(state.lineId, state.plyIndex, moveResult.san)
    dispatch({ type: 'evaluated', payload: evaluation })
    setTimeout(() => dispatch({ type: 'advanced' }), 900)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 24 }}>
      {state.status === 'idle' && (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setColor('white')} style={{ fontWeight: color === 'white' ? 700 : 400 }}>White</button>
            <button onClick={() => setColor('black')} style={{ fontWeight: color === 'black' ? 700 : 400 }}>Black</button>
          </div>
          <button className="btn-green" disabled={loading} onClick={start}>
            {loading ? 'Loading…' : 'Start sparring'}
          </button>
        </>
      )}

      {state.status !== 'idle' && (
        <>
          <div style={{ fontSize: 14, color: 'var(--text3)' }}>{state.openingName}</div>

          {state.status !== 'summary' && (
            <Board
              fen={state.fen}
              size={420}
              flipped={state.color === 'black'}
              interactive={state.status === 'awaiting-move'}
              onMove={handleMove}
              layers={{ attacks: false, coverage: false, targets: true, hanging: false, winning: false, selection: true }}
            />
          )}

          {state.feedback && (
            <div style={{ color: state.feedback === 'correct' ? 'var(--green)' : 'var(--red)' }}>
              {FEEDBACK_LABEL[state.feedback]}
            </div>
          )}

          {state.status === 'summary' && (
            <>
              <div>{state.sessionCorrect} / {state.sessionAttempts} correct this session</div>
              <button className="btn-green" onClick={start}>New position</button>
            </>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 8: Run to verify tests pass**

Run: `cd frontend && npm test`
Expected: all passing.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/utils/sparringState.js frontend/src/utils/sparringState.test.js frontend/src/screens/SparringMode.jsx frontend/src/screens/SparringMode.test.jsx
git commit -m "feat: add SparringMode screen with a pure, unit-tested state reducer"
```

---

## Task 10: Wire into `App.jsx` + Fase 6.3 catalog divergence audit

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `backend/app/sparring_logic.py`
- Modify: `backend/tests/test_sparring_logic_selection.py`
- Create: `backend/scripts/sparring_divergence_audit.py`

**Interfaces:**
- Consumes: `SparringMode` (Task 9), `_divergence_map` (Task 4, same module).
- Produces: nothing consumed by later tasks — this is the last task.

- [ ] **Step 1: Add the screen tab**

In `frontend/src/App.jsx`, add the import:

```javascript
import SparringMode from './screens/SparringMode'
```

Add to the `SCREENS` array (after `'repertoire'`):

```javascript
{ id: 'sparring',   label: 'Sparring' },
```

Add the render branch (after the `repertoire` branch):

```jsx
{screen === 'sparring'   && <SparringMode />}
```

- [ ] **Step 2: Manually verify the tab in the running app**

Run: `cd frontend && npm run dev` (and `cd backend && uvicorn app.main:app --reload` in another terminal), log in, click the new "Sparring" tab, pick a color, click "Start sparring", confirm a board renders. This step has no automated assertion — it's a manual sanity check that the wiring compiles and renders, since `App.jsx` itself has no test harness in this plan.

- [ ] **Step 3: Write the failing test for the divergence-count audit function**

Add to `backend/tests/test_sparring_logic_selection.py`:

```python
from app.sparring_logic import count_divergent_positions


def test_count_divergent_positions():
    lines = [
        _line(1, "op", ["e4", "c5", "Nf3", "d6"]),
        _line(2, "op", ["e4", "c5", "Nc3", "Nc6"]),
        _line(3, "op2", ["d4", "d5", "Bf4", "Nf6"]),
    ]
    assert count_divergent_positions(lines, color="white") == 1
```

- [ ] **Step 4: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_sparring_logic_selection.py -v`
Expected: FAIL — `ImportError: cannot import name 'count_divergent_positions'`

- [ ] **Step 5: Implement, reusing `_divergence_map` from Task 4**

Append to `backend/app/sparring_logic.py`:

```python
def count_divergent_positions(lines: list[LineInfo], color: str) -> int:
    """How many (opening, prefix) positions have >= 2 distinct next moves
    across `lines` — the real gauge of how much value the Fase 3 'free
    rival' adds today. See implementation.md's closing analysis: 24 lines
    across 5 openings as of this writing."""
    divergence = _divergence_map(lines, color)
    return sum(1 for options in divergence.values() if len(options) >= 2)
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_sparring_logic_selection.py -v`
Expected: 7 passed

- [ ] **Step 7: Write the audit script**

```python
# backend/scripts/sparring_divergence_audit.py
"""Fase 6.3 data audit: how many real divergence points exist in the
current catalog, per color? Gates whether SparringMode's 'free rival'
(Fase 3 Option A) is worth the UX investment before expanding it further —
see implementation.md's closing analysis.

Run from backend/: python -m scripts.sparring_divergence_audit
"""
from app.database import SessionLocal
from app import models
from app.sparring_logic import LineInfo, count_divergent_positions


def main():
    db = SessionLocal()
    try:
        rows = db.query(models.Line, models.Opening).join(models.Opening).all()
    finally:
        db.close()

    for color in ("white", "black"):
        lines = [
            LineInfo(line_id=line.id, opening_id=opening.id, moves=line.moves, repetitions=0)
            for line, opening in rows if opening.color == color
        ]
        n = count_divergent_positions(lines, color=color)
        print(f"{color}: {n} divergent position(s) across {len(lines)} line(s)")


if __name__ == "__main__":
    main()
```

Create `backend/scripts/__init__.py` (empty) so `python -m scripts.sparring_divergence_audit` resolves.

- [ ] **Step 8: Run the script against the real catalog (manual, informational)**

Run: `cd backend && python -m scripts.sparring_divergence_audit`
Expected: prints two lines (`white: N ...`, `black: N ...`). No pass/fail — this is the Fase 6.3 data point implementation.md calls for before investing further in Fase 3 Option B (Stockfish). Report the numbers back; no code change is gated on a specific value.

- [ ] **Step 9: Run the full test suites one last time**

Run: `cd backend && python -m pytest -v`
Run: `cd frontend && npm test`
Expected: all passing on both.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/App.jsx backend/app/sparring_logic.py backend/tests/test_sparring_logic_selection.py backend/scripts/__init__.py backend/scripts/sparring_divergence_audit.py
git commit -m "feat: wire SparringMode into the app nav; add catalog divergence audit"
```
