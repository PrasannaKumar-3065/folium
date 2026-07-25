"""
The AI Tutor: a small, genuinely agentic RAG loop built on Gemini's
Interactions API function calling.

Rather than always doing a single fixed "embed question -> retrieve -> stuff
into prompt" pass, the model is given a search_knowledge_base tool and
decides for itself when and what to search for — it can issue a narrower
follow-up search if the first one doesn't return what it needs, or skip
searching for a question it can already tell isn't answerable from the
library. This is closer to how the product's AI Tutor is meant to behave
(grounded, source-transparent, honest about what it doesn't know) than a
naive RAG pipeline would be.

Statelessness: each call to ask_question() is a self-contained
conversation (store=False, no server-side history) — no memory is kept
between questions, by design.
"""
from typing import Dict, List, Optional

from config import settings
from gemini_client import embed_query, get_client
from vector_store import query as vector_query

SYSTEM_PROMPT = """You are the AI Tutor inside a school's private learning platform.
You help students understand concepts from their own school's textbooks.

Rules you must always follow:
1. Before answering any question about course content, call search_knowledge_base
   to find relevant passages. You may call it more than once — for example, try
   a narrower or differently-worded query if the first search doesn't return
   what you need.
2. Base your answer only on the passages the tool returns. Do not rely on
   outside knowledge, even if you happen to know the answer, and do not
   invent facts.
3. If the tool returns nothing relevant after a couple of tries, say clearly
   that this doesn't seem to be covered in the school's uploaded books and
   suggest the student ask their teacher. Do not guess.
4. Do not directly hand over answers to questions phrased like exam or test
   questions. Instead, explain the underlying concept so the student learns
   it themselves.
5. When you use information from a passage, mention which textbook, chapter
   (if one is given), and page it came from in plain language (e.g. "This is
   covered in Biology.pdf, Chapter 4: The Structure of the Atom, page 42").
6. Keep a warm, encouraging, clear tone — like a knowledgeable senior
   student, not a search engine. Avoid unnecessary jargon and keep answers
   focused rather than exhaustive.
"""

SEARCH_TOOL = {
    "type": "function",
    "name": "search_knowledge_base",
    "description": (
        "Searches the school's uploaded textbooks for passages relevant to a query. "
        "Returns the most relevant passages together with their source filename and "
        "page number. Always use this before answering a question about course content."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "A focused search query describing what information is needed from the textbooks.",
            }
        },
        "required": ["query"],
    },
}

NO_ANSWER_FALLBACK = "I wasn't able to work out a confident answer from your school's books. Please check with your teacher."


def _format_chapter_label(chapter_number: str, chapter_title: str) -> str:
    """
    Builds a citation-ready chapter label, or "" if there's nothing useful
    to show — either because this chunk predates chapter detection (empty
    metadata) or because detection fell back to the whole-document default,
    which adds nothing a page number doesn't already say.
    """
    if not chapter_title or chapter_title == "Full Document":
        return ""
    return f"Chapter {chapter_number}: {chapter_title}" if chapter_number else chapter_title


def _run_search(query_text: str, standard: Optional[str], subject: Optional[str]) -> tuple[str, List[Dict]]:
    """Executes one search_knowledge_base call: embed -> Chroma query -> format for the model."""
    embedding = embed_query(query_text)
    results = vector_query(
        embedding, n_results=settings.RETRIEVAL_TOP_K, standard=standard, subject=subject
    )

    docs = (results.get("documents") or [[]])[0]
    metadatas = (results.get("metadatas") or [[]])[0]

    if not docs:
        return "No relevant passages were found in the uploaded textbooks for this query.", []

    formatted_blocks = []
    sources = []
    for text, meta in zip(docs, metadatas):
        filename = meta.get("filename", "unknown")
        page = meta.get("page")
        chapter_label = _format_chapter_label(meta.get("chapter_number") or "", meta.get("chapter_title") or "")

        source_bits = [f"Source: {filename}"]
        if chapter_label:
            source_bits.append(chapter_label)
        source_bits.append(f"page {page}")
        formatted_blocks.append(f"[{', '.join(source_bits)}]\n{text}")

        sources.append(
            {
                "filename": filename,
                "page": page,
                "chapter": chapter_label or None,
                "standard": meta.get("standard") or None,
                "subject": meta.get("subject") or None,
            }
        )

    return "\n\n---\n\n".join(formatted_blocks), sources


def ask_question(question: str, standard: Optional[str] = None, subject: Optional[str] = None) -> Dict:
    """
    Runs the agentic tool-calling loop for a single, memory-free question.
    Returns {"answer": str, "sources": [{"filename", "page", "standard", "subject"}, ...]}.
    """
    client = get_client()

    history: List[dict] = [
        {"type": "user_input", "content": [{"type": "text", "text": question}]}
    ]
    collected_sources: List[Dict] = []
    final_text: Optional[str] = None

    for _ in range(settings.MAX_TOOL_ITERATIONS):
        interaction = client.interactions.create(
            model=settings.GEMINI_GENERATION_MODEL,
            store=False,
            input=history,
            tools=[SEARCH_TOOL],
            system_instruction=SYSTEM_PROMPT,
        )

        # Stateless mode requires echoing every returned step back into the
        # history verbatim (thought steps included) before the next turn.
        for step in interaction.steps or []:
            history.append(step.model_dump())

        function_calls = [s for s in (interaction.steps or []) if s.type == "function_call"]

        if not function_calls:
            final_text = interaction.output_text
            break

        for call in function_calls:
            args = call.arguments or {}
            search_query = args.get("query") or question
            result_text, sources = _run_search(search_query, standard, subject)
            collected_sources.extend(sources)
            history.append(
                {
                    "type": "function_result",
                    "name": call.name,
                    "call_id": call.id,
                    "result": [{"type": "text", "text": result_text}],
                }
            )

    if not final_text:
        final_text = NO_ANSWER_FALLBACK

    # De-duplicate sources (same filename+page can be retrieved by more than
    # one search call) while preserving first-seen order.
    seen = set()
    unique_sources = []
    for source in collected_sources:
        key = (source["filename"], source["page"])
        if key not in seen:
            seen.add(key)
            unique_sources.append(source)

    return {"answer": final_text, "sources": unique_sources}
