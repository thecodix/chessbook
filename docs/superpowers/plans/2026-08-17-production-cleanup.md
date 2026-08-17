# Production Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the production connection failures caused by Render free-tier cold starts, and retire the Portal Chess / Grandes Maestros / Compendio minigames before launch.

**Architecture:** Two independent, unrelated changes bundled in one plan because both came out of the same review pass:
1. **Reliability fix** (frontend-only): fire a fire-and-forget warm-up ping to `/api/health` as soon as the app mounts (starts waking a sleeping Render instance before the user reaches a screen that needs it), and widen `api.js`'s retry window so it doesn't give up before a full cold start finishes. This is mitigation, not a root-cause fix — the root cause is running a paying product on Render's free web-service plan, which spins down after ~15 min idle and takes up to ~1 minute to wake. Moving off the free plan is an ops decision tracked in `DEPLOYMENT_CHECKLIST.md` §9, not code.
2. **Scope reduction** (frontend-only): delete the Portal Chess roguelike (`PortalChess.jsx`, `PortalChessGM.jsx`, `Compendium.jsx` and their supporting components/utils) and its three nav tabs. Confirmed zero backend dependency and zero references from any file outside its own tree except `App.jsx`.

**Tech Stack:** React + the existing Vitest/RTL harness (frontend only — no backend changes in this plan).

**Spec:** `chessbook/DEPLOYMENT_CHECKLIST.md` §9–10 (production reliability + minigame removal), informed by direct code investigation during this session (see root-cause notes in each task below).

## Global Constraints

- Frontend-only plan — do not touch `backend/` in any task here.
- Existing tests must stay green after every task; run `npm test` (Vitest) from `frontend/` after each deletion/edit, not just after the whole plan.
- Match existing test file naming: feature-scoped test files (`api.sparring.test.js`, `api.engineMove.test.js`), not one monolithic `api.test.js` — Task 3's new test follows this pattern.
- Match existing mocking pattern for screen/App tests: `vi.mock('./utils/api')` (or `'../utils/api'` from a screen) then `api.<fn>.mockResolvedValue(...)` per test — see `frontend/src/screens/SparringMode.test.jsx`.

---

## Task 1: Remove Portal Chess, Grandes Maestros, and Compendio

**Files:**
- Modify: `frontend/src/App.jsx:2-11` (imports), `frontend/src/App.jsx:20-30` (`SCREENS` array), `frontend/src/App.jsx:223-241` (render switch)
- Delete: `frontend/src/screens/PortalChess.jsx`
- Delete: `frontend/src/screens/PortalChessGM.jsx`
- Delete: `frontend/src/screens/Compendium.jsx`
- Delete: `frontend/src/components/PortalBoard.jsx`
- Delete: `frontend/src/components/PortalMap.jsx`
- Delete: `frontend/src/components/CompendiumEntry.jsx`
- Delete: `frontend/src/components/portalChess.css`
- Delete: `frontend/src/utils/portalChess/` (entire directory — `actThemes.js`, `actThemes.test.js`, `aiStrength.test.js`, `cards.js`, `compendiumData.js`, `difficulty.js`, `enemyFamilies.js`, `enemyFamilies.test.js`, `engine.js`, `events.js`, `gmSystem.js`, `gmSystem.test.js`, `mapGen.js`, `mapGen.test.js`, `modifiers.js`, `narrator.js`, `narrator.test.js`, `runMeta.js`, `runMeta.test.js`, `scoring.js`, `scoring.test.js`, `setup.js`, `setup.test.js`, `sound.js`, `tiles.js`)

**Interfaces:**
- Consumes: nothing from other tasks in this plan.
- Produces: nothing consumed by other tasks. `App.jsx`'s `SCREENS` array and render switch are the only integration point for the rest of the app; after this task they list only `dashboard`, `repertoire`, `sparring`, `problems`, `endgames`, `import`.

Confirmed during investigation (2026-08-17): `grep -rlE "PortalChess|PortalBoard|PortalMap|Compendium|portalChess" frontend/src` returns only files inside this task's own delete list plus `App.jsx`. No backend router, no `public/` asset, and no `tourSteps.js` step references any of `portalchess`, `portalchess-gm`, or `compendium` — the guided tour never routes through these screens, so no tour edit is needed.

- [x] **Step 1: Remove the three imports from `App.jsx`**

In `frontend/src/App.jsx`, delete these lines:

```js
import PortalChess   from './screens/PortalChess'
import PortalChessGM from './screens/PortalChessGM'
import Compendium    from './screens/Compendium'
```

- [x] **Step 2: Remove the three entries from the `SCREENS` array**

Change:

```js
const SCREENS = [
  { id: 'dashboard',  label: 'Dashboard' },
  { id: 'repertoire', label: 'Repertoire' },
  { id: 'sparring',   label: 'Sparring' },
  { id: 'problems',   label: 'Problems' },
  { id: 'endgames',   label: 'Endgames' },
  { id: 'import',     label: 'Import games' },
  { id: 'portalchess',   label: 'Portal Chess' },
  { id: 'portalchess-gm', label: 'Grandes Maestros' },
  { id: 'compendium', label: 'Compendio' },
]
```

to:

```js
const SCREENS = [
  { id: 'dashboard',  label: 'Dashboard' },
  { id: 'repertoire', label: 'Repertoire' },
  { id: 'sparring',   label: 'Sparring' },
  { id: 'problems',   label: 'Problems' },
  { id: 'endgames',   label: 'Endgames' },
  { id: 'import',     label: 'Import games' },
]
```

- [x] **Step 3: Remove the three render branches**

In the `<main className="main">` block, delete:

```js
{screen === 'portalchess'    && <PortalChess />}
{screen === 'portalchess-gm' && <PortalChessGM />}
{screen === 'compendium'     && <Compendium />}
```

- [x] **Step 4: Run the full test suite to confirm nothing outside the doomed files depended on them**

Run: `cd frontend && npm test`
Expected: PASS, same test count minus the Portal Chess/Compendium test files (which still exist on disk until Step 5, so at this point they still run and pass — the app just no longer routes to the screens).

- [x] **Step 5: Delete the screens, components, and the whole `utils/portalChess/` directory**

```bash
git rm frontend/src/screens/PortalChess.jsx frontend/src/screens/PortalChessGM.jsx frontend/src/screens/Compendium.jsx
git rm frontend/src/components/PortalBoard.jsx frontend/src/components/PortalMap.jsx frontend/src/components/CompendiumEntry.jsx frontend/src/components/portalChess.css
git rm -r frontend/src/utils/portalChess/
```

- [x] **Step 6: Run the full test suite again to confirm it's still green with the files gone**

Run: `cd frontend && npm test`
Expected: PASS, with the Portal Chess/Compendium `*.test.js` files no longer present in the run output at all (they were deleted in Step 5, not just skipped).

- [x] **Step 7: Build to confirm no dangling import slipped through**

Run: `cd frontend && npm run build`
Expected: build succeeds — a leftover import of a deleted file would fail the build even if Vitest didn't catch it (e.g. a stray reference in a file neither grep pass caught).

- [x] **Step 8: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "Remove Portal Chess, Grandes Maestros, and Compendio minigames"
```

---

## Task 2: Warm the backend up as soon as the app loads

**Files:**
- Modify: `frontend/src/App.jsx` (add one `useEffect`)
- Create: `frontend/src/App.test.jsx`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by other tasks. This uses the raw global `fetch`, not `utils/api.js`'s `req()` — intentional: this is a fire-and-forget wake-up call, not a request whose result matters, so it doesn't need `req()`'s retry/auth/error-parsing behavior.

Root cause this mitigates: the Render free-tier backend spins down after ~15 min idle and can take up to ~1 minute to respond to the *first* request after waking. Today that first request is whatever API call the user's current screen happens to make (e.g. `getMe()` on load, or `getProblemsProgress()` on the Problems screen) — pinging `/api/health` unconditionally on `App` mount starts that wake-up as early as possible, before the user has picked a screen, so by the time a real data request goes out the backend has a head start.

- [x] **Step 1: Write the failing test**

Create `frontend/src/App.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import App from './App'
import * as api from './utils/api'

vi.mock('./utils/api')

beforeEach(() => {
  vi.clearAllMocks()
  api.getMe.mockResolvedValue(null) // keeps the test on the Login screen, no further setup needed
  global.fetch = vi.fn(() => Promise.resolve({ ok: true }))
})

describe('App', () => {
  it('pings /api/health on mount to start waking a sleeping Render backend early', async () => {
    render(<App />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/health'))
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/App.test.jsx`
Expected: FAIL — `global.fetch` is never called with `/api/health'` because `App.jsx` doesn't ping it yet.

- [x] **Step 3: Add the warm-up ping to `App.jsx`**

In `frontend/src/App.jsx`, add this effect next to the existing "Restore session on mount" effect (inside the `App` component, near the top of the function body):

```js
  // Fire-and-forget: starts waking a sleeping Render free-tier instance as
  // early as possible, before the user has picked a screen — by the time a
  // real data request goes out the backend has had a head start. Result and
  // errors are both irrelevant here; getMe()/screen data calls below go
  // through utils/api.js's own retrying req() and handle failures there.
  useEffect(() => {
    fetch('/api/health').catch(() => {})
  }, [])
```

- [x] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/App.test.jsx`
Expected: PASS

- [x] **Step 5: Run the full test suite**

Run: `cd frontend && npm test`
Expected: PASS, no regressions in other screens.

- [x] **Step 6: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.test.jsx
git commit -m "Ping /api/health on app load to start waking a sleeping Render backend early"
```

---

## Task 3: Widen the API retry window to cover a full cold start

**Files:**
- Modify: `frontend/src/utils/api.js:15` (`MAX_RETRIES`)
- Create: `frontend/src/utils/api.retry.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by other tasks. Pure constant change inside `req()`, which every exported `api.js` function already funnels through.

Root cause: `req()`'s retry loop (`frontend/src/utils/api.js:20-64`) already retries on network failure and on 502/503/504, which is the right mechanism — it just gives up too soon. Today: `MAX_RETRIES = 8`, `RETRY_DELAY_MS = 5000` → 8 retries × 5s = 40s of retrying (9 total attempts) before throwing `'Could not reach the server. Please check your connection and try again.'`. The code's own comment on `RETRYABLE_STATUSES` already documents the Render free tier taking "up to ~a minute" to wake — 40s is short of that worst case, so a request made right as the instance is asleep can still exhaust its retries and surface an error to the user seconds before the backend would have answered.

- [x] **Step 1: Write the failing test**

Create `frontend/src/utils/api.retry.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getMe, setToken } from './api'

beforeEach(() => {
  setToken('test-token')
  global.fetch = vi.fn(() => Promise.reject(new Error('network down')))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('req retry window', () => {
  it('keeps retrying a cold-starting backend for at least 60 seconds before giving up', async () => {
    vi.useFakeTimers()
    const pending = getMe()
    const assertion = expect(pending).rejects.toThrow(
      'Could not reach the server. Please check your connection and try again.'
    )
    await vi.advanceTimersByTimeAsync(70_000)
    await assertion
    expect(global.fetch.mock.calls.length).toBeGreaterThanOrEqual(15)
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/utils/api.retry.test.js`
Expected: FAIL — with `MAX_RETRIES = 8`, `fetch` is called 9 times (not ≥15) and the promise has already rejected well before the 70s of advanced fake time elapses.

- [x] **Step 3: Bump `MAX_RETRIES`**

In `frontend/src/utils/api.js`, change:

```js
const MAX_RETRIES        = 8
```

to:

```js
const MAX_RETRIES        = 14
```

(14 retries × 5s `RETRY_DELAY_MS` = 70s of retrying — comfortably past Render's documented ~60s worst-case cold start, still short enough that a genuinely offline user isn't stuck waiting more than a bit over a minute for the final error.)

- [x] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/utils/api.retry.test.js`
Expected: PASS

- [x] **Step 5: Run the full test suite**

Run: `cd frontend && npm test`
Expected: PASS — no other test asserts on the old retry count/timing (confirmed: `api.sparring.test.js` and `api.engineMove.test.js` mock single-shot successful responses, they don't exercise the retry loop).

- [x] **Step 6: Commit**

```bash
git add frontend/src/utils/api.js frontend/src/utils/api.retry.test.js
git commit -m "Widen the API retry window to cover a full Render cold start"
```

---

## Self-Review Notes

- **Spec coverage:** DEPLOYMENT_CHECKLIST.md §9 (connection failures) → Tasks 2 + 3. §10 (retire minigames) → Task 1. Both covered.
- **Placeholder scan:** no TBD/"add error handling"/"similar to Task N" — every step has literal code.
- **Type/name consistency:** `MAX_RETRIES`, `RETRY_DELAY_MS`, `req()`, `getMe()` all match the real current names in `frontend/src/utils/api.js` (verified by reading the file, not assumed). `App.jsx`'s `SCREENS` array and effect placement verified against the actual current file content, not guessed.
- **Task independence:** Tasks 1, 2, and 3 touch disjoint code paths (Task 1: nav/routing + deletions; Task 2: one new effect; Task 3: one constant) and can be done in any order or by different people/agents in parallel — none blocks another.
