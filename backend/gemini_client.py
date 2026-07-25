"""
Thin wrapper around the Gemini API (google-genai SDK).

Two things live here:
- get_client()             — a lazily-created, shared genai.Client.
- embed_texts_for_storage() / embed_query()
                            — asymmetric embeddings for RAG. Documents are
                              embedded with task_type=RETRIEVAL_DOCUMENT and
                              queries with RETRIEVAL_QUERY, which measurably
                              improves retrieval quality over embedding both
                              the same way.

The agentic tool-calling loop (Interactions API) lives in rag_agent.py, not
here, since it also needs vector_store.py — keeping it here would create a
circular import.
"""
import time
from typing import List

import numpy as np
from google import genai
from google.genai import types

from config import settings

_client: genai.Client | None = None


class GeminiConfigError(RuntimeError):
    """Raised when GEMINI_API_KEY is missing or empty."""


def get_client() -> genai.Client:
    global _client
    if _client is None:
        if not settings.GEMINI_API_KEY:
            raise GeminiConfigError(
                "GEMINI_API_KEY is not set. Copy backend/.env.example to backend/.env "
                "and add your key from https://aistudio.google.com/apikey"
            )
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client


def _normalize(values: List[float]) -> List[float]:
    """
    L2-normalize an embedding vector. gemini-embedding-001 only
    auto-normalizes at its full 3072-dim output; any truncated
    output_dimensionality needs this done manually. Normalizing an
    already-unit-length vector is a safe no-op, so we always do it.
    """
    arr = np.asarray(values, dtype=np.float64)
    norm = np.linalg.norm(arr)
    if norm == 0:
        return values
    return (arr / norm).tolist()


def _embed_with_retry(texts: List[str], task_type: str, retries: int = 3) -> List[List[float]]:
    client = get_client()
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            result = client.models.embed_content(
                model=settings.GEMINI_EMBEDDING_MODEL,
                contents=texts,
                config=types.EmbedContentConfig(
                    task_type=task_type,
                    output_dimensionality=settings.EMBEDDING_DIMENSION,
                ),
            )
            return [_normalize(e.values) for e in result.embeddings]
        except GeminiConfigError:
            raise
        except Exception as exc:  # noqa: BLE001 — we deliberately retry any transient API error
            last_error = exc
            if attempt < retries - 1:
                time.sleep(2**attempt)
    raise RuntimeError(f"Gemini embedding call failed after {retries} attempts: {last_error}")


def embed_texts_for_storage(texts: List[str], batch_size: int = 20) -> List[List[float]]:
    """Embeds a batch of document chunks for indexing (RETRIEVAL_DOCUMENT)."""
    if not texts:
        return []
    all_embeddings: List[List[float]] = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        all_embeddings.extend(_embed_with_retry(batch, task_type="RETRIEVAL_DOCUMENT"))
    return all_embeddings


def embed_query(text: str) -> List[float]:
    """Embeds a single search query (RETRIEVAL_QUERY)."""
    return _embed_with_retry([text], task_type="RETRIEVAL_QUERY")[0]
