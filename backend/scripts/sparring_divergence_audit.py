# backend/scripts/sparring_divergence_audit.py
"""Fase 6.3 data audit: how many real divergence points exist in the
current catalog, per color? Gates whether SparringMode's 'free rival'
(Fase 3 Option A) is worth the UX investment before expanding it further —
see docs/superpowers/plans/2026-07-29-sparring-mode.md's closing analysis.

Run from backend/: python -m scripts.sparring_divergence_audit
"""
from app.database import SessionLocal
from app import models
from app.sparring_logic import LineInfo, count_divergent_positions
from app.routers.sparring import _stripped_moves


def main():
    db = SessionLocal()
    try:
        rows = db.query(models.Line, models.Opening).join(models.Opening).all()
    finally:
        db.close()

    for color in ("white", "black"):
        lines = [
            # Stripped the same way both /next and /evaluate compare moves,
            # so this audit's divergence counts match what the endpoints
            # would actually see.
            LineInfo(line_id=line.id, opening_id=opening.id, moves=_stripped_moves(line), repetitions=0)
            for line, opening in rows if opening.color == color
        ]
        n = count_divergent_positions(lines, color=color)
        print(f"{color}: {n} divergent position(s) across {len(lines)} line(s)")


if __name__ == "__main__":
    main()
