import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app import models


@pytest.fixture()
def session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    s = Session()
    try:
        yield s
    finally:
        s.close()
        Base.metadata.drop_all(bind=engine)


def test_email_is_required(session):
    session.add(models.User(username="nomail", hashed_password="x", email=None))
    with pytest.raises(IntegrityError):
        session.commit()


def test_email_must_be_unique(session):
    session.add(models.User(username="a", hashed_password="x", email="dupe@example.com"))
    session.commit()
    session.add(models.User(username="b", hashed_password="x", email="dupe@example.com"))
    with pytest.raises(IntegrityError):
        session.commit()


def test_reset_token_fields_default_to_none(session):
    user = models.User(username="c", hashed_password="x", email="c@example.com")
    session.add(user)
    session.commit()
    session.refresh(user)
    assert user.reset_token_hash is None
    assert user.reset_token_expires is None
