"""
Chapter boundary detection for uploaded textbooks.

Deliberately uses the stable generate_content() call rather than the beta
Interactions API rag_agent.py relies on for the tutor loop: this is a
single-shot structured-extraction task with no multi-turn tool use, so
there's no reason to take on Interactions API's beta-schema risk here.

Why an LLM call instead of a regex/font-size heuristic: chapter heading
conventions vary a lot across boards, publishers, subjects, and standards
(Std 6 vs Std 12, Tamil-medium vs English-medium, different printers'
layout conventions) — a hard-coded pattern would be the first thing to
break on a real, varied library. Asking Gemini to read a condensed
page-heading scan and return structured boundaries costs one extra API
call per upload but is far more robust across that variety.

Failure handling: chapter data is enrichment (citations, admin visibility,
future chapter-scoped features), never load-bearing for whether a document
can be searched. Any failure here — no API key, malformed JSON, empty
response — falls back to a single chapter spanning the whole document
rather than failing the upload.
"""
import json
import logging
from typing import List, Optional, Tuple, TypedDict

from google.genai import types

from config import settings
from gemini_client import GeminiConfigError, get_client

logger = logging.getLogger("eduai")

# Gemini's context window (1M tokens for gemini-3.5-flash) comfortably fits
# even a long textbook's page-heading scan in one call, so no batching is
# needed here. 400 chars is enough to catch a heading near the top of a
# page without sending full page bodies (headings deep mid-page, unlikely
# in a textbook layout, can be missed — acceptable for v1).
PAGE_PREVIEW_CHARS = 400


class ChapterInfo(TypedDict):
    chapter_number: Optional[str]
    title: str
    start_page: int
    end_page: int


def _fallback_single_chapter(pages: List[Tuple[int, str]]) -> List[ChapterInfo]:
    first_page = pages[0][0] if pages else 1
    last_page = pages[-1][0] if pages else 1
    return [
        {
            "chapter_number": None,
            "title": "Full Document",
            "start_page": first_page,
            "end_page": last_page,
        }
    ]


def _build_prompt(pages: List[Tuple[int, str]]) -> str:
    previews = []
    for page_num, text in pages:
        snippet = text.strip()[:PAGE_PREVIEW_CHARS].replace("\n", " ")
        previews.append(f"--- Page {page_num} ---\n{snippet}")
    joined = "\n\n".join(previews)
    last_page = pages[-1][0] if pages else 1

    return f"""You are analyzing a school textbook that has been split into pages. \
Identify its chapter structure: where each chapter starts and ends, and its title.

Below is the beginning of each page (chapter and section headings are usually \
near the top of the page where a new chapter starts):

{joined}

Return ONLY a JSON array (no markdown fences, no other text) covering pages 1 \
through {last_page} with no gaps and no overlaps, in this exact shape:
[{{"chapter_number": "1", "title": "...", "start_page": 1, "end_page": 12}}, ...]

Use null for chapter_number if the book doesn't number chapters. If you cannot \
find clear chapter divisions anywhere, return a single entry titled \
"Full Document" spanning page 1 to {last_page}."""


def detect_chapters(pages: List[Tuple[int, str]]) -> List[ChapterInfo]:
    """
    Returns chapters in reading order, covering every page of the document.
    Never raises — falls back to a single "Full Document" chapter on any
    failure so a chapter-detection problem can never fail a whole upload.
    """
    if not pages:
        return []

    try:
        client = get_client()
        response = client.models.generate_content(
            model=settings.GEMINI_GENERATION_MODEL,
            contents=_build_prompt(pages),
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.0,
            ),
        )
        parsed = json.loads((response.text or "").strip())

        chapters: List[ChapterInfo] = []
        for item in parsed:
            start = int(item["start_page"])
            end = int(item["end_page"])
            title = str(item.get("title") or f"Chapter starting page {start}").strip()
            number = item.get("chapter_number")
            chapters.append(
                {
                    "chapter_number": str(number) if number else None,
                    "title": title,
                    "start_page": start,
                    "end_page": end,
                }
            )

        return sorted(chapters, key=lambda c: c["start_page"]) or _fallback_single_chapter(pages)

    except GeminiConfigError:
        # No API key configured yet — don't fail the whole upload over
        # enrichment data; the document still gets page-level citations.
        return _fallback_single_chapter(pages)
    except Exception:  # noqa: BLE001 — malformed JSON, API/network error, etc.
        logger.exception("Chapter detection failed; falling back to a single chapter")
        return _fallback_single_chapter(pages)


def chapter_for_page(chapters: List[ChapterInfo], page: int) -> Optional[ChapterInfo]:
    """Finds which chapter a given page falls into — used to tag chunks."""
    for chapter in chapters:
        if chapter["start_page"] <= page <= chapter["end_page"]:
            return chapter
    return None
