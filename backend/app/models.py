from datetime import date, datetime
from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from .database import Base


class User(Base):
    __tablename__ = "users"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    username          = Column(String, unique=True, nullable=False, index=True)
    hashed_password   = Column(String, nullable=False)
    chesscom_username = Column(String, nullable=True)
    platform_rating   = Column(Integer, nullable=True)
    created_at        = Column(DateTime, default=datetime.utcnow)


class FrequencyCache(Base):
    __tablename__ = "frequency_cache"

    fen         = Column(String,  primary_key=True)
    ratings_key = Column(String,  primary_key=True)
    speeds_key  = Column(String,  primary_key=True)
    moves       = Column(JSON,    nullable=False)
    total       = Column(Integer, nullable=False)
    fetched_at  = Column(DateTime, nullable=False)


class Opening(Base):
    __tablename__ = "openings"

    id          = Column(String, primary_key=True)
    name        = Column(String, nullable=False)
    color       = Column(String, nullable=False)   # "white" | "black"
    description = Column(Text,   nullable=True)

    lines = relationship(
        "Line", back_populates="opening",
        cascade="all, delete-orphan", order_by="Line.position",
    )


class Line(Base):
    __tablename__ = "lines"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    opening_id    = Column(String, ForeignKey("openings.id", ondelete="CASCADE"), nullable=False)
    position      = Column(Integer, default=0)
    label         = Column(String, nullable=False)
    moves         = Column(JSON,   nullable=False)
    idea          = Column(Text,   nullable=True)

    # SM-2 fields
    ease_factor   = Column(Float,   default=2.5)
    interval_days = Column(Integer, default=1)
    repetitions   = Column(Integer, default=0)
    next_review   = Column(Date,    default=date.today)
    retention     = Column(Float,   default=0.0)

    opening = relationship("Opening", back_populates="lines")


class Game(Base):
    __tablename__ = "games"

    id           = Column(String,  primary_key=True)
    username     = Column(String,  nullable=False, index=True)
    white        = Column(String)
    black        = Column(String)
    white_rating = Column(Integer, nullable=True)
    black_rating = Column(Integer, nullable=True)
    is_white     = Column(Boolean)
    result       = Column(String)
    my_result    = Column(String,  nullable=True)
    opp_result   = Column(String,  nullable=True)
    opening      = Column(String)
    moves        = Column(JSON)
    deviation    = Column(JSON,    nullable=True)
    date         = Column(String)
    time_control = Column(String)
    time_class   = Column(String,  nullable=True)
    rated        = Column(Boolean, default=True)
    accuracy     = Column(JSON,    nullable=True)
    game_url     = Column(String,  nullable=True)
    tournament   = Column(String,  nullable=True)


class ProblemProgress(Base):
    __tablename__ = "problem_progress"

    id        = Column(Integer, primary_key=True, autoincrement=True)
    user_id   = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    puzzle_id = Column(String,  nullable=False, index=True)
    solved    = Column(Boolean, default=False)
    attempts  = Column(Integer, default=0)
    solved_at = Column(DateTime, nullable=True)

    __table_args__ = (UniqueConstraint("user_id", "puzzle_id", name="uq_user_puzzle"),)


class EndgameProgress(Base):
    __tablename__ = "endgame_progress"

    id        = Column(Integer, primary_key=True, autoincrement=True)
    user_id   = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    puzzle_id = Column(String,  nullable=False, index=True)
    solved    = Column(Boolean, default=False)
    attempts  = Column(Integer, default=0)
    solved_at = Column(DateTime, nullable=True)

    __table_args__ = (UniqueConstraint("user_id", "puzzle_id", name="uq_user_endgame"),)
