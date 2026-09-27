#!/bin/sh
set -e

# One-time self-recovery for a database that existed before Alembic was
# adopted in this repo (created via the old Base.metadata.create_all()
# path): its tables already exist, but it has no `alembic_version` row, so
# a plain `alembic upgrade head` tries to recreate every table from scratch
# and dies on the first CREATE TABLE with DuplicateTable. Detect that exact
# case — a known table (`users`) already exists but `alembic_version`
# doesn't — and stamp the initial revision (whose DDL is already applied)
# before upgrading normally. Documented (as a manual step) in
# DEPLOYMENT_CHECKLIST.md §1; automated here so it doesn't depend on
# someone remembering to run it by hand against production.
NEEDS_STAMP=$(python - <<'PY'
from sqlalchemy import inspect
from app.database import engine

tables = inspect(engine).get_table_names()
print("1" if "users" in tables and "alembic_version" not in tables else "0")
PY
)

if [ "$NEEDS_STAMP" = "1" ]; then
    echo "Pre-Alembic database detected (tables exist, no alembic_version) — stamping initial revision before upgrading."
    alembic stamp f68b422faa99
fi

alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --reload
