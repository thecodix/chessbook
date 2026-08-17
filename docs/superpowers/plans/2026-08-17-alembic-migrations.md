# Alembic Migrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `Base.metadata.create_all(bind=engine)` (which can create missing tables but can never apply a schema change to an existing one) with a real Alembic migration chain, so the first schema change against production data doesn't risk corrupting or losing it.

**Architecture:** Three sequential steps against `backend/`: (1) scaffold Alembic and point its `env.py` at the app's existing `SQLAlchemy` `Base`/`DATABASE_URL` instead of a second hardcoded connection string, (2) autogenerate one initial revision from the current `models.py` and prove — via Alembic's own "diff again, expect nothing" idiom — that it fully captures the schema, (3) make `alembic upgrade head` run automatically before the app starts (in the Docker image, so it fires identically in `docker-compose` and on Render) and delete the `create_all()` call it replaces. A fourth task updates `DEPLOYMENT_CHECKLIST.md` to stop flagging this as a gap.

**Tech Stack:** Alembic 1.13+ (already a `pyproject.toml` dependency, already installed in `backend/.venv`), SQLAlchemy 2.0, local Postgres via the repo's root `docker-compose.yml`.

**Spec:** `chessbook/DEPLOYMENT_CHECKLIST.md` §1 "Migraciones" — confirmed gap: `alembic` is a dependency and `poe migrate` (`alembic upgrade head`) exists as a task, but no `alembic/` directory or initial revision exists in the repo, so `poe migrate` currently has nothing to run.

## Global Constraints

- All commands in this plan run from `backend/` unless stated otherwise.
- Don't touch `frontend/` — this plan is backend-only.
- Local verification uses the root `docker-compose.yml`'s `db` service (Postgres 16, user/pass/db all `chessbook`, `localhost:5432`) — this matches `app/database.py`'s own fallback `DATABASE_URL`, so no env var needs to be exported for local commands to work.
- Existing tests must stay green after every task: `cd backend && pytest`.
- `backend/tests/conftest.py`'s `client` fixture deliberately does **not** use `with TestClient(app) as c:` because that form fires `@app.on_event("startup")`, which — even after this plan — still starts a real Stockfish subprocess. Don't change that pattern; it's unrelated to `create_all()` removal and still needed after this plan.

---

## Task 1: Scaffold Alembic and wire `env.py` to the app's metadata

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py` (overwrite Alembic's generated boilerplate)
- Create: `backend/alembic/script.py.mako` (leave as generated)
- Create: `backend/alembic/versions/` (empty until Task 2)

**Interfaces:**
- Consumes: `app.database.Base` (the `DeclarativeBase` all models inherit), `app.database.DATABASE_URL` (the same env-var-driven connection string the app itself uses).
- Produces: a working `alembic` CLI (`alembic current`, `alembic revision --autogenerate`, `alembic upgrade`) that Task 2 and Task 3 both depend on.

- [ ] **Step 1: Run `alembic init`**

```bash
cd backend
alembic init alembic
```

Expected: creates `backend/alembic.ini` and `backend/alembic/` (`env.py`, `script.py.mako`, `versions/`). Console prints a reminder to edit configuration settings — that's Steps 2–3.

- [ ] **Step 2: Remove the hardcoded connection string from `alembic.ini`**

In `backend/alembic.ini`, delete this line (it ships with a placeholder driver URL that would otherwise silently take precedence over the real one):

```ini
sqlalchemy.url = driver://user:pass@localhost/dbname
```

The real URL is set from `DATABASE_URL` at runtime in `env.py` (Step 3), the same way `app/database.py` already resolves it — one source of truth, no second hardcoded credential to keep in sync.

- [ ] **Step 3: Replace `backend/alembic/env.py` with this content**

```python
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

from app.database import Base, DATABASE_URL
from app import models  # noqa: F401 — registers every model class with Base.metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", DATABASE_URL)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

Note: `import app.models` is load-bearing, not decorative — without it, none of the model classes (`User`, `Opening`, `Line`, ...) have been imported yet when `env.py` reads `Base.metadata`, so `target_metadata` would look empty and Task 2's autogenerate would produce a blank migration.

- [ ] **Step 4: Verify Alembic can connect**

Make sure the local Postgres is up:

```bash
cd ..
docker compose up -d db
```

Then, from `backend/`:

```bash
cd backend
alembic current
```

Expected: exits 0 and prints nothing (no revision applied yet, because `versions/` is still empty) — confirms `env.py` resolves `DATABASE_URL` and connects successfully. If this fails with a connection error, the `db` container isn't up yet — rerun `docker compose ps db` and wait for `healthy`.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic.ini backend/alembic/env.py backend/alembic/script.py.mako
git commit -m "Scaffold Alembic and wire env.py to the app's SQLAlchemy metadata"
```

---

## Task 2: Generate the initial revision and prove it fully captures the current schema

**Files:**
- Create: `backend/alembic/versions/<generated_hash>_initial_schema.py`

**Interfaces:**
- Consumes: `target_metadata` from Task 1's `env.py` (i.e. every model in `app/models.py`: `User`, `FrequencyCache`, `Opening`, `Line`, `UserOpening`, `LineProgress`, `SparringStats`, `Game`, `ProblemProgress`, `EndgameProgress` — 10 tables).
- Produces: the migration file Task 3's `alembic upgrade head` applies at container start.

- [ ] **Step 1: Start from a genuinely empty database**

Autogenerate diffs the live database against `target_metadata` — it must see zero existing tables to produce a *complete* initial migration, not an incremental one.

```bash
cd ..
docker compose down -v
docker compose up -d db
```

This drops the local `pgdata` volume — safe, it only holds local dev/seed data, never anything production.

- [ ] **Step 2: Autogenerate the initial revision**

```bash
cd backend
alembic revision --autogenerate -m "initial schema"
```

Expected: creates `backend/alembic/versions/<hash>_initial_schema.py`. Note the filename Alembic prints — later steps reference it as `<initial_rev_file>`.

- [ ] **Step 3: Confirm the generated file isn't empty**

Open `<initial_rev_file>` and confirm its `upgrade()` function contains ten `op.create_table(...)` calls (one per model listed above, e.g. `create_table('users', ...)`, `create_table('openings', ...)`, ...) and `downgrade()` contains the matching `op.drop_table(...)` calls in reverse order. If `upgrade()` is empty (just `pass`), Task 1 Step 3's `import app.models` isn't taking effect — stop and re-check `env.py` before continuing.

- [ ] **Step 4: Apply it**

```bash
alembic upgrade head
```

Expected: prints `Running upgrade  -> <hash>, initial schema` and exits 0.

- [ ] **Step 5: Prove completeness with Alembic's "diff again, expect nothing" check**

```bash
alembic revision --autogenerate -m "should_be_empty"
```

Expected: creates a second, throwaway revision file whose `upgrade()`/`downgrade()` bodies contain no `op.` calls (effectively just `pass`). An empty diff here is the proof that the Step 2 migration captured *everything* in `models.py` — if this second file contains any real `op.` calls, Step 2's migration is incomplete; add the missing pieces to `<initial_rev_file>` by hand and re-run this step until the diff is truly empty.

- [ ] **Step 6: Delete the throwaway probe revision**

```bash
rm backend/alembic/versions/<probe_rev>_should_be_empty.py
```

Don't downgrade — `head` must stay at `<initial_rev_file>`, the probe file was only ever a diff check and was never meant to be applied or kept.

- [ ] **Step 7: Commit the real initial migration only**

```bash
git add backend/alembic/versions/<initial_rev_file>
git commit -m "Add initial Alembic revision capturing the current schema"
```

---

## Task 3: Run migrations at container start; retire `create_all()`

**Files:**
- Modify: `backend/Dockerfile`
- Modify: `backend/app/main.py:10` (import), `backend/app/main.py:199-202` (`startup()`)

**Interfaces:**
- Consumes: `alembic upgrade head` (Task 1 + Task 2's output) as a shell command, not a Python import — deliberately decoupled from `app.main`'s own startup so a migration failure aborts the container before `uvicorn` ever binds a port, instead of the app coming up against a stale schema.
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Ship the Alembic config and versions in the Docker image, and run migrations before `uvicorn`**

In `backend/Dockerfile`, change:

```dockerfile
COPY pyproject.toml .
COPY app/ ./app/

RUN pip install --no-cache-dir -e ".[dev]"

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --reload"]
```

to:

```dockerfile
COPY pyproject.toml .
COPY alembic.ini .
COPY alembic/ ./alembic/
COPY app/ ./app/

RUN pip install --no-cache-dir -e ".[dev]"

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --reload"]
```

This runs identically in local `docker compose` and on Render (both build from this same `Dockerfile`), so there's no separate "remember to run migrations on deploy" step to forget.

- [ ] **Step 2: Remove `create_all()` from `app/main.py`**

Change the import on line 10:

```python
from app.database import Base, engine, SessionLocal
```

to:

```python
from app.database import SessionLocal
```

(`Base` and `engine` were only ever used by the line removed next — confirmed via `grep -n "Base\.\|engine" app/main.py` finding no other usage.)

Change `startup()`:

```python
@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    _seed()
```

to:

```python
@app.on_event("startup")
def startup():
    _seed()
```

`_seed()` stays — it's an idempotent catalog upsert unrelated to table creation, and by the time this runs the Dockerfile's `alembic upgrade head` has already made sure the tables exist.

- [ ] **Step 3: Rebuild the image and verify the real (non-`--reload`-dev) path against a fresh database**

```bash
cd ..
docker compose down -v
docker compose build backend
docker compose up -d
docker compose ps
```

Expected: `docker compose ps` shows `db` and `backend` both healthy/running (wait a few seconds and re-run if `backend` is still starting).

- [ ] **Step 4: Confirm the schema came from the migration, not `create_all()`**

```bash
docker compose logs backend | grep "Running upgrade"
docker compose exec db psql -U chessbook -d chessbook -c "\dt"
docker compose exec db psql -U chessbook -d chessbook -c "select version_num from alembic_version;"
cd backend && alembic heads
```

Expected: the log line `Running upgrade  -> <hash>, initial schema` appears before the app's own startup output; `\dt` lists all ten app tables plus Alembic's own `alembic_version` bookkeeping table; the `version_num` printed by `psql` matches the revision id printed by `alembic heads`.

- [ ] **Step 5: Run the backend test suite**

```bash
cd backend
pytest
```

Expected: PASS, same test count as before this plan. (`tests/conftest.py`'s `db_session` fixture builds its own throwaway SQLite schema via `Base.metadata.create_all` directly — that's test isolation infrastructure, separate from the app's own startup event, and is untouched by this task.)

- [ ] **Step 6: Commit**

```bash
git add backend/Dockerfile backend/app/main.py
git commit -m "Run alembic upgrade head at container start instead of create_all()"
```

---

## Task 4: Update the deployment checklist

**Files:**
- Modify: `DEPLOYMENT_CHECKLIST.md` (repo root)

**Interfaces:**
- Consumes: the commit hashes from Tasks 1–3 (run `git log --oneline -6` to get the real short hashes before editing).
- Produces: nothing consumed by other tasks — this is documentation only.

- [ ] **Step 1: Flip the "Migraciones" bullet from ❌ to ✅**

In `DEPLOYMENT_CHECKLIST.md` §1 "Backend (FastAPI)", replace:

```markdown
- [ ] **Migraciones** ❌ — **gap real, no solo pendiente de ejecutar.** `alembic` está como
      dependencia y hay una tarea `poe migrate` (`alembic upgrade head`), pero no existe carpeta
      `alembic/` ni ninguna revisión inicial en el repo. Hoy el esquema se crea en producción con
      `Base.metadata.create_all(bind=engine)` en el `startup` de `main.py` — esto crea tablas que
      no existen pero **no migra cambios de esquema futuros** (columnas nuevas, renombres, etc.)
      sin perder o corromper datos. Hay que inicializar Alembic de verdad antes del primer deploy
      con usuarios reales.
```

with (substituting the real short hashes from `git log --oneline -6` for `<hash1>`/`<hash2>`/`<hash3>`):

```markdown
- [x] **Migraciones** ✅ — Alembic inicializado de verdad: `backend/alembic/` con la revisión
      inicial generada y verificada contra `models.py` (commits `<hash1>`, `<hash2>`, `<hash3>`).
      `alembic upgrade head` corre automáticamente al arrancar el contenedor (`backend/Dockerfile`,
      antes de `uvicorn`), tanto en `docker compose` como en Render — ya no depende de acordarse de
      ejecutarlo a mano. `Base.metadata.create_all(bind=engine)` se ha retirado de `main.py`.
```

- [ ] **Step 2: Update the priority list**

In the "Orden de prioridad real" section, change item 1 from a forward-looking TODO to a done marker, e.g.:

```markdown
1. ~~**Alembic real**~~ ✅ hecho — ver §1 "Migraciones". El siguiente bloqueante real es el punto 2.
```

- [ ] **Step 3: Commit**

```bash
git add DEPLOYMENT_CHECKLIST.md
git commit -m "Mark Alembic migrations as done in the deployment checklist"
```

---

## Self-Review Notes

- **Spec coverage:** DEPLOYMENT_CHECKLIST.md §1 "Migraciones" (init Alembic, generate initial revision, replace `create_all()`) → Tasks 1–3. Checklist bookkeeping → Task 4. Nothing in the spec bullet is left uncovered.
- **Placeholder scan:** no TBD/"add error handling"/"similar to Task N" — every step has literal, runnable commands or full file content. `<hash>`/`<initial_rev_file>`/`<probe_rev>` placeholders are Alembic-generated names that don't exist until the executor runs the preceding step — each is immediately preceded by the command that produces it, not a stand-in for undone work.
- **Type/name consistency:** `Base`, `DATABASE_URL`, `SessionLocal` match `app/database.py`'s real current names (verified by reading the file). `app/main.py`'s import line and `startup()` body match the real current file content (verified by reading + `grep`), not guessed. Table names (`users`, `frequency_cache`, `openings`, `lines`, `user_openings`, `line_progress`, `sparring_stats`, `games`, `problem_progress`, `endgame_progress`) verified via `grep -n "__tablename__" app/models.py` — ten tables, matching Task 2's expected `create_table` count.
- **Task independence:** Tasks 1 → 2 → 3 are strictly sequential (each needs the previous task's files on disk). Task 4 only needs Tasks 1–3's commit hashes, so it must run last, but touches only `DEPLOYMENT_CHECKLIST.md` — no code conflict with the others.
