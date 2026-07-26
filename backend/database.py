"""
SQLAlchemy engine/session setup.

SQLite is the bare-minimum choice for an MVP: zero setup, a single file on
disk. It is genuinely fine at this scale. If you outgrow it, swap the
SQLALCHEMY_DATABASE_URL below for a Postgres DSN — nothing else in the
codebase needs to change because all access goes through SessionLocal.
"""
from sqlalchemy import create_engine, text
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

    # Ensure the SQLite schema includes newer columns added to models after
    # the initial DB creation. This is a tiny, safe runtime migration that
    # only adds missing nullable columns (ALTER TABLE ADD COLUMN is safe).
    # Use a transactional begin() so DDL is executed safely and committed.
    with engine.begin() as conn:
        try:
            res = conn.execute(text("PRAGMA table_info('question_papers')"))
            cols = [row[1] for row in res.fetchall()]
        except Exception:
            cols = []

        # Ensure optional layout and new model columns exist in the SQLite table.
        # Map of column -> SQL type (simple, nullable types only).
        cols_to_add = {
            "duration_minutes": "INTEGER",
            "exam_title": "TEXT",
            "school_name": "TEXT",
            "grade_section": "TEXT",
            "exam_date": "TEXT",
            "instructions_text": "TEXT",
            "footer_text": "TEXT",
            "teacher_name": "TEXT",
        }

        for col, col_type in cols_to_add.items():
            if col not in cols:
                conn.execute(text(f"ALTER TABLE question_papers ADD COLUMN {col} {col_type}"))
