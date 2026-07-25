"""
PDF parsing + chunking.

Two responsibilities, kept deliberately simple:
1. extract_pages()   — pull plain text out of every page of a PDF.
2. chunk_document()  — turn that page-by-page text into overlapping chunks
                        of roughly CHUNK_SIZE characters, each tagged with
                        the page it started on (for source citations).

No OCR here on purpose: if a PDF has effectively no extractable text, the
caller treats that as a processing failure and tells the admin to upload a
text-based PDF (matches the product's documented behavior). Scanned PDFs
could be supported later by wiring pymupdf's Tesseract-backed
get_textpage_ocr() into extract_pages() without touching anything downstream.
"""
from typing import List, Tuple, TypedDict

import pymupdf


class Chunk(TypedDict):
    text: str
    start_page: int


def extract_pages(file_path: str) -> List[Tuple[int, str]]:
    """Returns a list of (page_number, page_text), 1-indexed."""
    doc = pymupdf.open(file_path)
    try:
        return [(i + 1, page.get_text("text")) for i, page in enumerate(doc)]
    finally:
        doc.close()


def _build_full_text_with_page_map(
    pages: List[Tuple[int, str]]
) -> Tuple[str, List[Tuple[int, int]]]:
    """
    Concatenates every page's text into one string and records, for each
    page, the character offset in that string where the page begins.
    Returns (full_text, page_map) where page_map is sorted by offset.
    """
    parts: List[str] = []
    page_map: List[Tuple[int, int]] = []
    offset = 0
    for page_num, text in pages:
        page_map.append((offset, page_num))
        parts.append(text)
        offset += len(text)
        parts.append("\n\n")
        offset += 2
    return "".join(parts), page_map


def _page_for_offset(page_map: List[Tuple[int, int]], target_offset: int) -> int:
    page = page_map[0][1] if page_map else 1
    for start, page_num in page_map:
        if start <= target_offset:
            page = page_num
        else:
            break
    return page


def _split_paragraphs_with_offsets(full_text: str) -> List[Tuple[str, int]]:
    """Splits on blank lines, returning (paragraph_text, start_offset) pairs."""
    raw_parts = full_text.split("\n\n")
    paragraphs: List[Tuple[str, int]] = []
    cursor = 0
    for raw in raw_parts:
        stripped = raw.strip()
        if stripped:
            leading_ws = len(raw) - len(raw.lstrip())
            paragraphs.append((stripped, cursor + leading_ws))
        cursor += len(raw) + 2  # account for the "\n\n" separator removed by split
    return paragraphs


def chunk_document(
    pages: List[Tuple[int, str]], chunk_size: int = 1000, overlap: int = 150
) -> List[Chunk]:
    """
    Greedily merges paragraphs into ~chunk_size-character chunks with
    `overlap` characters of trailing context repeated into the next chunk,
    so a concept split across a chunk boundary isn't lost entirely.
    Each chunk records the page it started on for citation purposes.
    """
    full_text, page_map = _build_full_text_with_page_map(pages)
    paragraphs = _split_paragraphs_with_offsets(full_text)

    chunks: List[Chunk] = []
    buffer = ""
    buffer_start_offset = 0  # true offset into full_text where `buffer` begins

    def flush():
        if buffer.strip():
            chunks.append(
                {"text": buffer.strip(), "start_page": _page_for_offset(page_map, buffer_start_offset)}
            )

    for para_text, para_offset in paragraphs:
        if not buffer:
            buffer_start_offset = para_offset

        candidate = f"{buffer}\n\n{para_text}" if buffer else para_text

        if len(candidate) > chunk_size and buffer:
            flush()
            if len(buffer) > overlap:
                tail = buffer[-overlap:]
                tail_true_offset = buffer_start_offset + (len(buffer) - len(tail))
            else:
                tail = buffer
                tail_true_offset = buffer_start_offset
            buffer = f"{tail}\n\n{para_text}"
            buffer_start_offset = tail_true_offset
        else:
            buffer = candidate

        # Safety valve: a single paragraph far larger than chunk_size (e.g. a
        # wall of un-broken text) gets hard-split so no chunk grows unbounded.
        # buffer_start_offset is advanced by exactly what's consumed each
        # time, so it stays a true offset rather than drifting.
        while len(buffer) > chunk_size * 2:
            piece = buffer[:chunk_size]
            chunks.append(
                {"text": piece.strip(), "start_page": _page_for_offset(page_map, buffer_start_offset)}
            )
            consumed = chunk_size - overlap
            buffer = buffer[consumed:]
            buffer_start_offset += consumed

    flush()
    return chunks
