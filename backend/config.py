"""
Central configuration for the EduAI Knowledge Library backend.

Everything tunable lives here and is read from environment variables (see
.env.example). Nothing else in the codebase should call os.environ directly.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent


class Settings:
    # --- Gemini API ---
    GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "")

    # gemini-3.5-flash is Google's current GA model tuned for agentic /
    # tool-using workloads (mid-2026). Override via env if you want a
    # cheaper/faster or more powerful model instead.
    GEMINI_GENERATION_MODEL: str = os.environ.get("GEMINI_GENERATION_MODEL", "gemini-3.5-flash")

    # gemini-embedding-001 is the GA, text-only embedding model. It supports
    # asymmetric task types (RETRIEVAL_DOCUMENT vs RETRIEVAL_QUERY) which we
    # rely on for retrieval quality.
    GEMINI_EMBEDDING_MODEL: str = os.environ.get("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")

    # 768 is Google's recommended "small" dimension: cheap to store/search
    # with negligible quality loss vs the full 3072-dim vector.
    EMBEDDING_DIMENSION: int = int(os.environ.get("EMBEDDING_DIMENSION", "768"))

    # --- Storage ---
    STORAGE_DIR: Path = Path(os.environ.get("STORAGE_DIR", str(BASE_DIR / "storage")))
    UPLOAD_DIR: Path = STORAGE_DIR / "uploads"
    CHROMA_DIR: str = str(STORAGE_DIR / "chroma")
    DATABASE_PATH: Path = STORAGE_DIR / "app.db"
    CHROMA_COLLECTION: str = os.environ.get("CHROMA_COLLECTION", "knowledge_base")

    # --- Upload / processing limits ---
    MAX_FILE_SIZE_MB: int = int(os.environ.get("MAX_FILE_SIZE_MB", "50"))
    CHUNK_SIZE: int = int(os.environ.get("CHUNK_SIZE", "1000"))          # characters
    CHUNK_OVERLAP: int = int(os.environ.get("CHUNK_OVERLAP", "150"))      # characters
    MIN_EXTRACTABLE_CHARS: int = int(os.environ.get("MIN_EXTRACTABLE_CHARS", "200"))

    # --- RAG agent ---
    RETRIEVAL_TOP_K: int = int(os.environ.get("RETRIEVAL_TOP_K", "5"))
    MAX_TOOL_ITERATIONS: int = int(os.environ.get("MAX_TOOL_ITERATIONS", "4"))

    # --- Server ---
    CORS_ALLOW_ORIGINS: list = os.environ.get("CORS_ALLOW_ORIGINS", "*").split(",")


settings = Settings()

# Make sure storage directories exist as soon as settings are imported.
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
Path(settings.CHROMA_DIR).mkdir(parents=True, exist_ok=True)
