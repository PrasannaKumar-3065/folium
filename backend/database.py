"""
SQLAlchemy engine/session setup.

SQLite is the bare-minimum choice for an MVP: zero setup, a single file on
disk. It is genuinely fine at this scale. If you outgrow it, swap the
SQLALCHEMY_DATABASE_URL below for a Postgres DSN — nothing else in the
codebase needs to change because all access goes through SessionLocal.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from config import settings

SQLALCHEMY_DATABASE_URL = f"sqlite:///{settings.DATABASE_PATH}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    # Required for SQLite when the same connection pool is touched from
    # FastAPI's background-task thread pool as well as the request thread.
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

Base = declarative_base()


def init_db() -> None:
    """Create tables if they don't exist yet. Safe to call on every startup."""
    import models_db  # noqa: F401  (ensures the model is registered on Base)

    Base.metadata.create_all(bind=engine)
