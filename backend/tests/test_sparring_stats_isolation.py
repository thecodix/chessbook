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
