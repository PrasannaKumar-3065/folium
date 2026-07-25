"""
AI question generation for the Teacher Portal's Question Paper Builder
(PRD 7.3.1-7.3.2), scoped to teacher-selected chapters.

Two separable pieces:
- compute_distribution(): pure arithmetic — how many questions come from
  each selected chapter. No Gemini call, fully deterministic given its
  random seed, easy to unit-test in isolation (see the module's own
  reasoning below on the pass-floor guarantee and where it breaks down).
- generate_mcqs_for_chapter(): the actual Gemini call that turns one
  chapter's source text into that many MCQs. Uses the stable
  generate_content() call, same reasoning as chapter_extractor.py — this
  is single-shot structured generation, not multi-turn tool use.

On the "equal or random" distribution modes:
- "equal": total_questions split as evenly as possible across the selected
  chapters (remainder — if total_questions doesn't divide evenly — goes to
  the first few chapters in the order they were selected).
- "random": every chapter is first guaranteed a FLOOR of questions equal to
  however many are needed to reach pass_percentage from that chapter alone
  — i.e. a student who fully mastered just that one chapter, and answered
  every question from it correctly, and got everything else wrong, could
  still reach the pass score. Remaining questions (after every chapter has
  its floor) are handed out one at a time via independent random draws —
  that's the "probability-based" part sitting on top of the guarantee.

  This guarantee has a real mathematical ceiling: giving every one of N
  chapters a floor of F questions needs N*F questions total, so it's only
  satisfiable when N*ceil(pass_percentage/100 * total_questions) <=
  total_questions. With a 40% pass mark, for example, at most 2 chapters
  can each get a full floor out of a 20-question paper (2*8=16 fits; a 3rd
  chapter would need 24). When the selected chapters don't fit, the floor
  is scaled down to the largest value that *does* fit (equivalent to an
  equal split) and `distribution_feasible` comes back False, so the caller
  can surface this rather than silently ship a paper that doesn't actually
  keep the guarantee it promises for every chapter.
"""
import json
import logging
import math
import random
from typing import Dict, List, Optional, Tuple, TypedDict

from google.genai import types

from config import settings
from gemini_client import GeminiConfigError, get_client

logger = logging.getLogger("eduai")

DIFFICULTY_GUIDANCE = {
    "easy": "lean toward direct factual recall and straightforward application",
    "balanced": "mix factual recall, conceptual understanding, and application evenly",
    "challenging": "lean toward conceptual understanding and multi-step application; avoid pure recall",
}


class GeneratedQuestion(TypedDict):
    question_text: str
    options: Dict[str, str]  # {"A": "...", "B": "...", "C": "...", "D": "..."}
    correct_option: str  # "A" | "B" | "C" | "D"
    difficulty: str  # "Easy" | "Medium" | "Hard" — the model's own label


def compute_distribution(
    total_questions: int,
    chapter_ids: List[str],
    mode: str,
    pass_percentage: float,
    rng: Optional[random.Random] = None,
) -> Tuple[Dict[str, int], bool, int]:
    """
    Returns (plan, floor_honored_for_every_chapter, floor_used).
    plan maps chapter_id -> question count, summing to total_questions.
    floor_used is 0 for "equal" mode (the concept doesn't apply there).
    """
    if not chapter_ids:
        return {}, True, 0
    n = len(chapter_ids)
    rng = rng or random

    if mode == "equal":
        base, remainder = divmod(total_questions, n)
        plan = {cid: base + (1 if i < remainder else 0) for i, cid in enumerate(chapter_ids)}
        return plan, True, 0

    # mode == "random"
    ideal_floor = math.ceil(pass_percentage / 100 * total_questions)
    if ideal_floor * n <= total_questions:
        floor = ideal_floor
        honored = True
    else:
        # The requested guarantee doesn't fit this many chapters — fall back
        # to the largest floor that does (an equal split), and say so.
        floor = total_questions // n
        honored = False

    plan = {cid: floor for cid in chapter_ids}
    remaining = total_questions - floor * n
    for _ in range(remaining):
        plan[rng.choice(chapter_ids)] += 1

    return plan, honored, floor


def _build_prompt(
    chapter_label: str,
    source_text: str,
    count: int,
    difficulty: str,
    standard: Optional[str],
    subject: Optional[str],
) -> str:
    guidance = DIFFICULTY_GUIDANCE.get(difficulty, DIFFICULTY_GUIDANCE["balanced"])
    context_bits = ", ".join(b for b in [standard, subject] if b)
    context_line = f"Context: {context_bits}\n" if context_bits else ""

    return f"""You are creating exam multiple-choice questions for a school textbook chapter.

Chapter: {chapter_label}
{context_line}
Source material from this chapter (use ONLY this — do not draw on outside knowledge):
{source_text}

Generate exactly {count} multiple-choice questions based only on the material above.

Difficulty preference for this set: {difficulty} — {guidance}.

Requirements for every question:
- Exactly 4 answer options, labeled A-D
- The correct option must be clearly correct given the source material
- The 3 wrong options must be plausible but clearly wrong on reflection — not absurd, not trivially eliminable
- Avoid trivial copy-paste-from-text questions and avoid impossibly obscure detail
- Across the set, balance factual recall, conceptual understanding, and application-style questions
- Label each question's own difficulty as "Easy", "Medium", or "Hard" (this can vary per question even
  within one difficulty preference)

Return ONLY a JSON array (no markdown fences, no other text), in this exact shape:
[{{"question": "...", "options": {{"A": "...", "B": "...", "C": "...", "D": "..."}}, "correct_option": "A", "difficulty": "Medium"}}, ...]"""


def generate_mcqs_for_chapter(
    chapter_label: str,
    source_text: str,
    count: int,
    difficulty: str,
    standard: Optional[str] = None,
    subject: Optional[str] = None,
) -> List[GeneratedQuestion]:
    """
    Returns up to `count` questions — fewer if the model returns fewer or a
    response fails to parse (never raises; a generation problem for one
    chapter should not fail the whole paper). Returns [] if count <= 0 or
    there's no source text to work from.
    """
    if count <= 0 or not source_text.strip():
        return []

    try:
        client = get_client()
        response = client.models.generate_content(
            model=settings.GEMINI_GENERATION_MODEL,
            contents=_build_prompt(chapter_label, source_text, count, difficulty, standard, subject),
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.7,  # some creative variety across questions, unlike chapter detection's 0.0
            ),
        )
        parsed = json.loads((response.text or "").strip())

        questions: List[GeneratedQuestion] = []
        for item in parsed:
            options = item.get("options") or {}
            if not isinstance(options, dict) or len(options) != 4:
                continue  # skip malformed entries rather than fail the whole batch
            correct = str(item.get("correct_option", "")).strip().upper()
            if correct not in options:
                continue
            questions.append(
                {
                    "question_text": str(item.get("question", "")).strip(),
                    "options": {k: str(v) for k, v in options.items()},
                    "correct_option": correct,
                    "difficulty": str(item.get("difficulty") or "Medium").strip(),
                }
            )
        return questions[:count]

    except GeminiConfigError:
        return []
    except Exception:  # noqa: BLE001 — malformed JSON, API/network error, etc.
        logger.exception("Question generation failed for chapter %s", chapter_label)
        return []
