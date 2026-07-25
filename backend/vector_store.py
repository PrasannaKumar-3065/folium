"""
ChromaDB wrapper — one persistent collection holding every chunk from every
uploaded document, namespaced by metadata (doc_id, filename, standard,
subject, page).

Design notes:
- We ALWAYS compute embeddings ourselves (gemini_client.py) and pass them
  explicitly to collection.add()/query() via embeddings=/query_embeddings=,
  so that document chunks use RETRIEVAL_DOCUMENT and search queries use
  RETRIEVAL_QUERY. A GeminiEmbeddingFunction is still attached to the
  collection to satisfy Chroma's API (and as a safety net if something ever
  calls .add(documents=...) without embeddings=), but it is not on the hot
  path.
- chromadb.PersistentClient writes straight to local disk with no server
  process — perfect for a single-process MVP. It is NOT safe to point
  multiple OS processes (e.g. `uvicorn --workers 4`) at the same path at
  once. If you scale to multiple workers/instances, switch to Chroma's
  HttpClient against a `chroma run` server instead — see README.
"""
from typing import Dict, List, Optional

import chromadb
from chromadb import Documents, EmbeddingFunction, Embeddings

from chapter_extractor import chapter_for_page
from config import settings
from gemini_client import embed_texts_for_storage
from pdf_processor import Chunk


class GeminiEmbeddingFunction(EmbeddingFunction):
    """Fallback embedding function bound to the collection. See module docstring."""

    def __init__(self) -> None:
        pass

    def __call__(self, input: Documents) -> Embeddings:  # noqa: A002 — Chroma's interface names this `input`
        return embed_texts_for_storage(list(input))


_client: chromadb.ClientAPI | None = None
_collection = None


def get_collection():
    global _client, _collection
    if _collection is None:
        _client = chromadb.PersistentClient(path=settings.CHROMA_DIR)
        _collection = _client.get_or_create_collection(
            name=settings.CHROMA_COLLECTION,
            embedding_function=GeminiEmbeddingFunction(),
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


def add_chunks(
    doc_id: str,
    filename: str,
    standard: Optional[str],
    subject: Optional[str],
    chunks: List[Chunk],
    embeddings: List[List[float]],
    chapters: Optional[List[dict]] = None,
    batch_size: int = 100,
) -> None:
    if len(chunks) != len(embeddings):
        raise ValueError("chunks and embeddings must be the same length")
    if not chunks:
        return

    collection = get_collection()
    ids = [f"{doc_id}_{i}" for i in range(len(chunks))]
    documents = [c["text"] for c in chunks]

    def _chapter_fields(page: int) -> dict:
        # chapters is optional and purely additive — a document processed
        # before chapter detection existed, or one where detection failed
        # outright, just gets "" here and keeps working on page citations.
        chapter = chapter_for_page(chapters or [], page)
        if not chapter:
            return {"chapter_id": "", "chapter_number": "", "chapter_title": ""}
        return {
            "chapter_id": chapter.get("id") or "",
            "chapter_number": chapter.get("chapter_number") or "",
            "chapter_title": chapter.get("title") or "",
        }

    metadatas = [
        {
            "doc_id": doc_id,
            "filename": filename,
            # Chroma metadata values can't be None, so normalize to "".
            "standard": standard or "",
            "subject": subject or "",
            "page": chunk["start_page"],
            "chunk_index": i,
            **_chapter_fields(chunk["start_page"]),
        }
        for i, chunk in enumerate(chunks)
    ]

    for i in range(0, len(ids), batch_size):
        collection.add(
            ids=ids[i : i + batch_size],
            documents=documents[i : i + batch_size],
            metadatas=metadatas[i : i + batch_size],
            embeddings=embeddings[i : i + batch_size],
        )


def delete_document(doc_id: str) -> None:
    collection = get_collection()
    collection.delete(where={"doc_id": doc_id})


def get_chunks_by_chapter(chapter_id: str) -> List[str]:
    """
    All chunk text belonging to one chapter, in original reading order.

    This is a plain metadata .get() rather than a similarity .query() — there
    is no natural-language question here, we want *all* (or effectively all)
    of a chapter's content to generate questions from, not the chunks most
    similar to some query. Used by question_generator.py.
    """
    collection = get_collection()
    result = collection.get(where={"chapter_id": chapter_id})
    documents = result.get("documents") or []
    metadatas = result.get("metadatas") or []
    if not documents:
        return []
    ordered = sorted(zip(metadatas, documents), key=lambda pair: pair[0].get("chunk_index", 0))
    return [text for _, text in ordered]


def query(
    query_embedding: List[float],
    n_results: int = 5,
    standard: Optional[str] = None,
    subject: Optional[str] = None,
    chapter_id: Optional[str] = None,
) -> Dict:
    """
    chapter_id scopes retrieval to one specific detected chapter (its stable
    Chapter.id from the database) — this is what the Teacher Portal's
    "select one, multiple, or all chapters" question-paper scoping (PRD
    7.3.1) will call for a single chapter. For multiple chapters, call this
    once per chapter_id and merge results, or switch to a Chroma `$in`
    filter if that turns out to be too slow at real scale.
    """
    collection = get_collection()

    conditions = []
    if standard:
        conditions.append({"standard": standard})
    if subject:
        conditions.append({"subject": subject})
    if chapter_id:
        conditions.append({"chapter_id": chapter_id})

    where = None
    if len(conditions) == 1:
        where = conditions[0]
    elif len(conditions) > 1:
        where = {"$and": conditions}

    return collection.query(
        query_embeddings=[query_embedding],
        n_results=n_results,
        where=where,
    )
