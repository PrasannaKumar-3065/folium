"""
EduAI Knowledge Library — MVP backend.

Endpoints:
  POST   /api/documents/upload   Upload one or more PDFs, kick off background processing
  GET    /api/documents          List all documents + their processing status
  GET    /api/documents/{id}     Get one document
  GET    /api/documents/{id}/chapters   List a document's detected chapters
  DELETE /api/documents/{id}     Remove a document, its file, its chapters, and its indexed chunks
  POST   /api/ask                Ask the AI tutor a question (agentic RAG)
  POST   /api/question-papers            Create + generate a chapter-scoped question paper
  GET    /api/question-papers            List all question papers
  GET    /api/question-papers/{id}       Get one question paper, including its questions
  POST   /api/question-papers/{id}/score Score a set of answers (per-chapter + overall)
  PATCH  /api/question-papers/{id}/layout   Set header/footer/instructions display fields
  GET    /api/question-papers/{id}/export-pdf   Download the paper as a PDF (student or answer-key copy)
  PATCH  /api/questions/{id}             Edit a question's text/options/answer/marks/difficulty
  POST   /api/questions/{id}/accept      Mark a question accepted; copies it into the Question Bank
  POST   /api/questions/{id}/regenerate  Ask Gemini for a fresh replacement from the same chapter
  DELETE /api/questions/{id}             Remove a question from its paper entirely
  POST   /api/questions/manual           Add a teacher-written question directly to a paper
  GET    /api/question-bank              Browse the reusable question bank (filter by chapter/subject/standard/difficulty)
  POST   /api/question-bank/{id}/add-to-paper   Copy a bank question into a paper
  GET    /api/health             Health check

Run with:  uvicorn main:app --reload --port 8000   (from inside backend/)
"""
import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional

import re

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from chapter_extractor import detect_chapters
from config import settings
from database import SessionLocal, init_db
from gemini_client import GeminiConfigError, embed_texts_for_storage
from models_db import BankQuestion, Chapter, Document, Question, QuestionPaper
from pdf_export import build_paper_pdf
from pdf_processor import chunk_document, extract_pages
from question_generator import compute_distribution, generate_mcqs_for_chapter
from rag_agent import ask_question
from schemas import (
    AddBankQuestionRequest,
    AskRequest,
    AskResponse,
    BankQuestionOut,
    ChapterOut,
    ChapterScoreOut,
    DocumentOut,
    ManualQuestionCreateRequest,
    PaperLayoutUpdateRequest,
    QuestionOut,
    QuestionPaperCreateRequest,
    QuestionPaperOut,
    QuestionUpdateRequest,
    ScoreRequest,
    ScoreResponse,
)
from vector_store import add_chunks, get_chunks_by_chapter
from vector_store import delete_document as vs_delete_document

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("eduai")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    if not settings.GEMINI_API_KEY:
        logger.warning(
            "GEMINI_API_KEY is not set — uploads will be accepted but processing "
            "and /api/ask will fail until it's configured (see backend/.env.example)."
        )
    yield


app = FastAPI(title="EduAI Knowledge Library MVP", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOW_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Background processing: parse -> chunk -> embed -> store
# ---------------------------------------------------------------------------
def process_document(
    doc_id: str, file_path: str, standard: Optional[str], subject: Optional[str], filename: str
) -> None:
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if doc is None:
            return

        try:
            pages = extract_pages(file_path)
        except Exception as exc:  # noqa: BLE001
            doc.status = "failed"
            doc.error_message = f"Could not open this file as a PDF ({exc})."
            db.commit()
            return

        total_chars = sum(len(text) for _, text in pages)
        if total_chars < settings.MIN_EXTRACTABLE_CHARS:
            doc.status = "failed"
            doc.error_message = (
                "This PDF appears to be a scanned image or contains no extractable text. "
                "Try uploading a text-based PDF for better results."
            )
            db.commit()
            return

        chunks = chunk_document(pages, settings.CHUNK_SIZE, settings.CHUNK_OVERLAP)
        if not chunks:
            doc.status = "failed"
            doc.error_message = "No usable text chunks could be extracted from this PDF."
            db.commit()
            return

        # Chapter detection is enrichment, not a gate: detect_chapters() never
        # raises (see chapter_extractor.py), so a bad or missing Gemini key
        # here still leaves the document searchable on page citations alone.
        detected_chapters = detect_chapters(pages)
        chapters_with_ids = []
        for order_index, chapter in enumerate(detected_chapters):
            chapter_id = str(uuid.uuid4())
            db.add(
                Chapter(
                    id=chapter_id,
                    doc_id=doc_id,
                    chapter_number=chapter["chapter_number"],
                    title=chapter["title"],
                    start_page=chapter["start_page"],
                    end_page=chapter["end_page"],
                    order_index=order_index,
                )
            )
            chapters_with_ids.append({**chapter, "id": chapter_id})

        embeddings = embed_texts_for_storage([c["text"] for c in chunks])
        add_chunks(doc_id, filename, standard, subject, chunks, embeddings, chapters=chapters_with_ids)

        doc.status = "ready"
        doc.page_count = len(pages)
        doc.chunk_count = len(chunks)
        doc.chapter_count = len(detected_chapters)
        db.commit()
        logger.info(
            "Processed document %s (%s): %d pages, %d chunks, %d chapters",
            doc_id, filename, len(pages), len(chunks), len(detected_chapters),
        )

    except Exception as exc:  # noqa: BLE001 — background task: never let this raise silently
        logger.exception("Failed to process document %s", doc_id)
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if doc is not None:
            doc.status = "failed"
            doc.error_message = str(exc)
            db.commit()
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Background processing: distribute -> generate MCQs per chapter -> store
# ---------------------------------------------------------------------------
def generate_question_paper(paper_id: str) -> None:
    db = SessionLocal()
    try:
        paper = db.query(QuestionPaper).filter(QuestionPaper.id == paper_id).first()
        if paper is None:
            return

        chapters = (
            db.query(Chapter)
            .filter(Chapter.id.in_(paper.chapter_ids))
            .all()
        )
        chapters_by_id = {c.id: c for c in chapters}

        plan, feasible, _floor = compute_distribution(
            paper.total_questions, paper.chapter_ids, paper.distribution_mode, paper.pass_percentage
        )

        order_index = 0
        total_generated = 0
        for chapter_id, count in plan.items():
            if count <= 0:
                continue
            chapter = chapters_by_id.get(chapter_id)
            chapter_label = (
                f"Chapter {chapter.chapter_number}: {chapter.title}"
                if chapter and chapter.chapter_number
                else (chapter.title if chapter else "Unknown chapter")
            )
            source_text = "\n\n".join(get_chunks_by_chapter(chapter_id))

            generated = generate_mcqs_for_chapter(
                chapter_label=chapter_label,
                source_text=source_text,
                count=count,
                difficulty=paper.difficulty,
                standard=paper.standard,
                subject=paper.subject,
            )
            marks_per_question = max(1, round(paper.total_marks / paper.total_questions))
            for q in generated:
                db.add(
                    Question(
                        id=str(uuid.uuid4()),
                        paper_id=paper_id,
                        chapter_id=chapter_id,
                        chapter_title=chapter.title if chapter else None,
                        question_text=q["question_text"],
                        options=q["options"],
                        correct_option=q["correct_option"],
                        marks=marks_per_question,
                        difficulty=q["difficulty"],
                        order_index=order_index,
                    )
                )
                order_index += 1
                total_generated += 1

        paper.distribution_plan = plan
        paper.distribution_feasible = feasible
        paper.status = "ready" if total_generated > 0 else "failed"
        if total_generated == 0:
            paper.error_message = (
                "No questions could be generated — this usually means the Gemini API key isn't "
                "configured yet (see backend/.env.example), or the selected chapters had no usable text."
            )
        elif total_generated < paper.total_questions:
            paper.error_message = (
                f"Generated {total_generated} of {paper.total_questions} requested questions — "
                "some chapters may have had too little source text, or a generation call failed."
            )
        db.commit()
        logger.info(
            "Generated question paper %s: %d/%d questions, feasible=%s",
            paper_id, total_generated, paper.total_questions, feasible,
        )

    except Exception as exc:  # noqa: BLE001 — background task: never let this raise silently
        logger.exception("Failed to generate question paper %s", paper_id)
        paper = db.query(QuestionPaper).filter(QuestionPaper.id == paper_id).first()
        if paper is not None:
            paper.status = "failed"
            paper.error_message = str(exc)
            db.commit()
    finally:
        db.close()
@app.post("/api/documents/upload")
async def upload_documents(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    standard: Optional[str] = Form(None),
    subject: Optional[str] = Form(None),
):
    if not files:
        raise HTTPException(400, "No files were uploaded.")

    standard = standard.strip() if standard and standard.strip() else None
    subject = subject.strip() if subject and subject.strip() else None
    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024

    db = SessionLocal()
    results = []
    try:
        for upload in files:
            entry: dict = {"filename": upload.filename or "unnamed file"}

            if not upload.filename or not upload.filename.lower().endswith(".pdf"):
                entry["error"] = "Only PDF files are supported."
                results.append(entry)
                continue

            doc_id = str(uuid.uuid4())
            dest_path = settings.UPLOAD_DIR / f"{doc_id}.pdf"

            size = 0
            is_first_chunk = True
            failed = False
            with open(dest_path, "wb") as out_file:
                while True:
                    chunk = await upload.read(1024 * 1024)
                    if not chunk:
                        break
                    if is_first_chunk:
                        if not chunk.startswith(b"%PDF"):
                            entry["error"] = "This does not look like a valid PDF file."
                            failed = True
                            break
                        is_first_chunk = False
                    size += len(chunk)
                    if size > max_bytes:
                        entry["error"] = f"File exceeds the {settings.MAX_FILE_SIZE_MB}MB upload limit."
                        failed = True
                        break
                    out_file.write(chunk)

            if failed:
                dest_path.unlink(missing_ok=True)
                results.append(entry)
                continue

            doc = Document(
                id=doc_id,
                filename=upload.filename,
                standard=standard,
                subject=subject,
                status="processing",
            )
            db.add(doc)
            db.commit()
            db.refresh(doc)

            entry["document"] = doc.to_dict()
            results.append(entry)

            background_tasks.add_task(
                process_document, doc_id, str(dest_path), standard, subject, upload.filename
            )

        return {"results": results}
    finally:
        db.close()


@app.get("/api/documents", response_model=List[DocumentOut])
def list_documents():
    db = SessionLocal()
    try:
        docs = db.query(Document).order_by(Document.created_at.desc()).all()
        return [d.to_dict() for d in docs]
    finally:
        db.close()


@app.get("/api/documents/{doc_id}", response_model=DocumentOut)
def get_document(doc_id: str):
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if doc is None:
            raise HTTPException(404, "Document not found.")
        return doc.to_dict()
    finally:
        db.close()


@app.get("/api/documents/{doc_id}/chapters", response_model=List[ChapterOut])
def list_chapters(doc_id: str):
    """
    Chapters detected for one document, in reading order. This is what a
    future "select one, multiple, or all chapters" picker (PRD 7.3.1, the
    question paper builder) calls to populate its chapter list.
    """
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if doc is None:
            raise HTTPException(404, "Document not found.")
        chapters = (
            db.query(Chapter)
            .filter(Chapter.doc_id == doc_id)
            .order_by(Chapter.order_index)
            .all()
        )
        return [c.to_dict() for c in chapters]
    finally:
        db.close()


@app.delete("/api/documents/{doc_id}")
def remove_document(doc_id: str):
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if doc is None:
            raise HTTPException(404, "Document not found.")

        vs_delete_document(doc_id)
        db.query(Chapter).filter(Chapter.doc_id == doc_id).delete()

        file_path = settings.UPLOAD_DIR / f"{doc_id}.pdf"
        if file_path.exists():
            file_path.unlink()

        db.delete(doc)
        db.commit()
        return {"deleted": True, "id": doc_id}
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Ask endpoint
# ---------------------------------------------------------------------------
@app.post("/api/ask", response_model=AskResponse)
def ask(request: AskRequest):
    if not request.question.strip():
        raise HTTPException(400, "Question cannot be empty.")
    try:
        return ask_question(request.question, request.standard, request.subject)
    except GeminiConfigError as exc:
        raise HTTPException(500, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("ask_question failed")
        raise HTTPException(502, f"The AI tutor is temporarily unavailable: {exc}") from exc


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Question Paper Builder endpoints (PRD 7.3.1-7.3.2 — AI generation only;
# manual entry, the question bank, paper layout, and scheduling are the next
# slices, not this one)
# ---------------------------------------------------------------------------
@app.post("/api/question-papers", response_model=QuestionPaperOut)
def create_question_paper(request: QuestionPaperCreateRequest, background_tasks: BackgroundTasks):
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == request.doc_id).first()
        if doc is None:
            raise HTTPException(404, "Document not found.")
        if doc.status != "ready":
            raise HTTPException(400, f"Document is not ready yet (status: {doc.status}).")

        chapters = db.query(Chapter).filter(Chapter.id.in_(request.chapter_ids)).all()
        found_ids = {c.id for c in chapters}
        missing = set(request.chapter_ids) - found_ids
        if missing:
            raise HTTPException(400, f"Unknown chapter id(s): {', '.join(missing)}")
        not_this_doc = [c.id for c in chapters if c.doc_id != request.doc_id]
        if not_this_doc:
            raise HTTPException(400, "All chapters must belong to the given document.")

        total_marks = request.total_marks or request.total_questions  # default: 1 mark/question

        paper = QuestionPaper(
            id=str(uuid.uuid4()),
            doc_id=request.doc_id,
            standard=doc.standard,
            subject=doc.subject,
            chapter_ids=request.chapter_ids,
            total_questions=request.total_questions,
            total_marks=total_marks,
            duration_minutes=request.duration_minutes,
            pass_percentage=request.pass_percentage,
            distribution_mode=request.distribution_mode,
            difficulty=request.difficulty,
            status="generating",
        )
        db.add(paper)
        db.commit()
        db.refresh(paper)

        background_tasks.add_task(generate_question_paper, paper.id)

        result = paper.to_dict()
        result["questions"] = []
        return result
    finally:
        db.close()


@app.get("/api/question-papers", response_model=List[QuestionPaperOut])
def list_question_papers():
    db = SessionLocal()
    try:
        papers = db.query(QuestionPaper).order_by(QuestionPaper.created_at.desc()).all()
        results = []
        for p in papers:
            d = p.to_dict()
            d["questions"] = []  # keep the list endpoint light; fetch by id for full detail
            results.append(d)
        return results
    finally:
        db.close()


@app.get("/api/question-papers/{paper_id}", response_model=QuestionPaperOut)
def get_question_paper(paper_id: str):
    db = SessionLocal()
    try:
        paper = db.query(QuestionPaper).filter(QuestionPaper.id == paper_id).first()
        if paper is None:
            raise HTTPException(404, "Question paper not found.")
        questions = (
            db.query(Question)
            .filter(Question.paper_id == paper_id)
            .order_by(Question.order_index)
            .all()
        )
        result = paper.to_dict()
        result["questions"] = [q.to_dict() for q in questions]
        return result
    finally:
        db.close()


@app.post("/api/question-papers/{paper_id}/score", response_model=ScoreResponse)
def score_question_paper(paper_id: str, request: ScoreRequest):
    """
    Scores a completed set of answers against one paper, reporting marks per
    chapter and overall — this is the data-model half of "evaluation gives a
    mark for each chapter and an overall mark". It's a scoring *utility*
    given a finished answer set, not the test-taking experience itself
    (timer, scheduling, live submission, anti-cheat) — that's the Test
    Engine (PRD 9), still deferred. Every question already carries its
    chapter_id and marks (see models_db.py), so this is a pure aggregation,
    not a redesign, once the Test Engine exists to call it for real.
    """
    db = SessionLocal()
    try:
        paper = db.query(QuestionPaper).filter(QuestionPaper.id == paper_id).first()
        if paper is None:
            raise HTTPException(404, "Question paper not found.")
        questions = db.query(Question).filter(Question.paper_id == paper_id).all()
        if not questions:
            raise HTTPException(400, "This paper has no generated questions to score against.")

        per_chapter: dict = {}  # chapter_id -> {"title", "scored", "possible"}
        overall_scored = 0
        overall_possible = 0

        for q in questions:
            key = q.chapter_id or "unknown"
            bucket = per_chapter.setdefault(
                key, {"title": q.chapter_title, "scored": 0, "possible": 0}
            )
            bucket["possible"] += q.marks
            overall_possible += q.marks
            if request.answers.get(q.id, "").strip().upper() == q.correct_option:
                bucket["scored"] += q.marks
                overall_scored += q.marks

        overall_percentage = (overall_scored / overall_possible * 100) if overall_possible else 0.0

        return {
            "overall_marks_scored": overall_scored,
            "overall_marks_possible": overall_possible,
            "overall_percentage": round(overall_percentage, 2),
            "passed": overall_percentage >= paper.pass_percentage,
            "per_chapter": [
                {
                    "chapter_id": None if cid == "unknown" else cid,
                    "chapter_title": bucket["title"],
                    "marks_scored": bucket["scored"],
                    "marks_possible": bucket["possible"],
                }
                for cid, bucket in per_chapter.items()
            ],
        }
    finally:
        db.close()


@app.patch("/api/question-papers/{paper_id}/layout", response_model=QuestionPaperOut)
def update_paper_layout(paper_id: str, request: PaperLayoutUpdateRequest):
    """
    Sets the header/footer display fields (PRD 7.3.5) — exam title, school
    name, grade/section, date, instructions, footer text, teacher name.
    Doesn't touch generation config (chapters, question count, difficulty,
    etc.) — changing those after generation would invalidate the questions
    already produced, so that's deliberately not exposed here.
    """
    db = SessionLocal()
    try:
        paper = db.query(QuestionPaper).filter(QuestionPaper.id == paper_id).first()
        if paper is None:
            raise HTTPException(404, "Question paper not found.")

        updates = request.model_dump(exclude_unset=True)
        for field, value in updates.items():
            setattr(paper, field, value)

        db.commit()
        db.refresh(paper)
        questions = (
            db.query(Question).filter(Question.paper_id == paper_id).order_by(Question.order_index).all()
        )
        result = paper.to_dict()
        result["questions"] = [q.to_dict() for q in questions]
        return result
    finally:
        db.close()


def _slugify_filename(value: str) -> str:
    safe = re.sub(r'[^A-Za-z0-9 _-]', '', value or '')
    safe = re.sub(r'\s+', ' ', safe).strip()
    return safe[:80] or 'question-paper'


@app.get("/api/question-papers/{paper_id}/export-pdf")
def export_paper_pdf(paper_id: str, include_answers: bool = False):
    """
    Downloads the paper as a formatted PDF. include_answers=false (default)
    is the student copy with no correct answers shown anywhere — the only
    version that should ever be handed to a student, per PRD 7.3.2's "never
    visible to students" rule. include_answers=true is the answer-key /
    teacher copy.
    """
    db = SessionLocal()
    try:
        paper = db.query(QuestionPaper).filter(QuestionPaper.id == paper_id).first()
        if paper is None:
            raise HTTPException(404, "Question paper not found.")
        questions = (
            db.query(Question).filter(Question.paper_id == paper_id).order_by(Question.order_index).all()
        )
        if not questions:
            raise HTTPException(400, "This paper has no questions yet to export.")

        pdf_bytes = build_paper_pdf(
            paper.to_dict(), [q.to_dict() for q in questions], include_answers=include_answers
        )
        title = paper.exam_title or paper.subject or 'question-paper'
        safe_title = _slugify_filename(title)
        filename_suffix = "answer-key" if include_answers else "student-copy"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{safe_title}-{filename_suffix}.pdf"'},
        )
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Per-question review: accept / edit / regenerate / delete (PRD 7.3.2)
# ---------------------------------------------------------------------------
def _add_to_bank_if_new(db, q: "Question", paper: "QuestionPaper", source: str) -> bool:
    """
    Copies a Question into BankQuestion, unless an entry for the same text +
    chapter already exists. Shared by accept_question and
    create_manual_question — both are "a teacher vouching for this
    question's content" moments per PRD 7.3.4 ("every question a teacher
    creates or accepts"), just with different origins. Returns whether a new
    entry was actually created.
    """
    already_banked = (
        db.query(BankQuestion)
        .filter(BankQuestion.question_text == q.question_text, BankQuestion.chapter_id == q.chapter_id)
        .first()
    )
    if already_banked:
        return False
    db.add(
        BankQuestion(
            id=str(uuid.uuid4()),
            doc_id=paper.doc_id if paper else None,
            chapter_id=q.chapter_id,
            chapter_title=q.chapter_title,
            standard=paper.standard if paper else None,
            subject=paper.subject if paper else None,
            question_text=q.question_text,
            options=q.options,
            correct_option=q.correct_option,
            marks=q.marks,
            difficulty=q.difficulty,
            source=source,
        )
    )
    return True


@app.patch("/api/questions/{question_id}", response_model=QuestionOut)
def edit_question(question_id: str, request: QuestionUpdateRequest):
    """Direct teacher edit — wording, options, correct answer, marks, difficulty."""
    db = SessionLocal()
    try:
        q = db.query(Question).filter(Question.id == question_id).first()
        if q is None:
            raise HTTPException(404, "Question not found.")

        if request.question_text is not None:
            q.question_text = request.question_text
        if request.options is not None:
            if len(request.options) != 4:
                raise HTTPException(400, "A question needs exactly 4 options.")
            q.options = request.options
        if request.marks is not None:
            q.marks = request.marks
        if request.difficulty is not None:
            q.difficulty = request.difficulty
        if request.correct_option is not None:
            candidate = request.correct_option.strip().upper()
            if candidate not in q.options:
                raise HTTPException(400, f"correct_option must be one of {sorted(q.options.keys())}.")
            q.correct_option = candidate

        db.commit()
        db.refresh(q)
        return q.to_dict()
    finally:
        db.close()


@app.post("/api/questions/{question_id}/accept", response_model=QuestionOut)
def accept_question(question_id: str):
    """
    Marks a question accepted and copies it into the Question Bank — "every
    question a teacher creates or accepts is saved into their Question
    Bank" (PRD 7.3.4). Safe to call more than once: re-accepting doesn't
    create a second bank entry for the same question.
    """
    db = SessionLocal()
    try:
        q = db.query(Question).filter(Question.id == question_id).first()
        if q is None:
            raise HTTPException(404, "Question not found.")

        paper = db.query(QuestionPaper).filter(QuestionPaper.id == q.paper_id).first()
        q.accepted = True
        _add_to_bank_if_new(db, q, paper, source="ai_accepted")

        db.commit()
        db.refresh(q)
        return q.to_dict()
    finally:
        db.close()


@app.post("/api/questions/{question_id}/regenerate", response_model=QuestionOut)
def regenerate_question(question_id: str):
    """
    Asks Gemini for one fresh replacement question from the same chapter and
    replaces this question's content in place (same id/position in the
    paper). Resets accepted=False, since the new content hasn't been
    reviewed yet — whatever was accepted before no longer applies to it.
    """
    db = SessionLocal()
    try:
        q = db.query(Question).filter(Question.id == question_id).first()
        if q is None:
            raise HTTPException(404, "Question not found.")
        paper = db.query(QuestionPaper).filter(QuestionPaper.id == q.paper_id).first()
        if paper is None:
            raise HTTPException(404, "This question's paper no longer exists.")

        chapter = db.query(Chapter).filter(Chapter.id == q.chapter_id).first() if q.chapter_id else None
        chapter_label = (
            f"Chapter {chapter.chapter_number}: {chapter.title}"
            if chapter and chapter.chapter_number
            else (chapter.title if chapter else (q.chapter_title or "Unknown chapter"))
        )
        source_text = "\n\n".join(get_chunks_by_chapter(q.chapter_id)) if q.chapter_id else ""

        replacements = generate_mcqs_for_chapter(
            chapter_label=chapter_label,
            source_text=source_text,
            count=1,
            difficulty=paper.difficulty,
            standard=paper.standard,
            subject=paper.subject,
        )
        if not replacements:
            raise HTTPException(
                502,
                "Couldn't generate a replacement question right now — this usually means the Gemini "
                "API key isn't configured (see backend/.env.example), or this chapter has too little "
                "source text. The original question hasn't been changed.",
            )

        new_q = replacements[0]
        q.question_text = new_q["question_text"]
        q.options = new_q["options"]
        q.correct_option = new_q["correct_option"]
        q.difficulty = new_q["difficulty"]
        q.accepted = False

        db.commit()
        db.refresh(q)
        return q.to_dict()
    finally:
        db.close()


@app.delete("/api/questions/{question_id}")
def delete_question(question_id: str):
    db = SessionLocal()
    try:
        q = db.query(Question).filter(Question.id == question_id).first()
        if q is None:
            raise HTTPException(404, "Question not found.")
        db.delete(q)
        db.commit()
        return {"deleted": True, "id": question_id}
    finally:
        db.close()


@app.post("/api/questions/manual", response_model=QuestionOut)
def create_manual_question(request: ManualQuestionCreateRequest):
    """
    A teacher's own question, written from scratch (PRD 7.3.3) — "This lets
    teachers blend AI-generated questions with their own questions." Lands
    in the same paper, same per-question review UI as AI-generated ones.
    Starts accepted=True: writing it yourself already *is* the review step
    a generated question needs Accept for — there's no AI draft here to
    approve. Also saved to the Question Bank, same as accepting a generated
    one — PRD 7.3.4 covers questions a teacher "creates or accepts" equally.
    """
    db = SessionLocal()
    try:
        paper = db.query(QuestionPaper).filter(QuestionPaper.id == request.paper_id).first()
        if paper is None:
            raise HTTPException(404, "Question paper not found.")
        if len(request.options) != 4:
            raise HTTPException(400, "A question needs exactly 4 options.")
        correct = request.correct_option.strip().upper()
        if correct not in request.options:
            raise HTTPException(400, f"correct_option must be one of {sorted(request.options.keys())}.")

        chapter_title = None
        if request.chapter_id:
            chapter = db.query(Chapter).filter(Chapter.id == request.chapter_id).first()
            if chapter is None:
                raise HTTPException(400, "Unknown chapter id.")
            if chapter.doc_id != paper.doc_id:
                raise HTTPException(400, "That chapter doesn't belong to this paper's book.")
            chapter_title = chapter.title

        next_order = db.query(Question).filter(Question.paper_id == request.paper_id).count()
        q = Question(
            id=str(uuid.uuid4()),
            paper_id=request.paper_id,
            chapter_id=request.chapter_id,
            chapter_title=chapter_title,
            question_text=request.question_text,
            options=request.options,
            correct_option=correct,
            marks=request.marks,
            difficulty=request.difficulty,
            accepted=True,
            order_index=next_order,
        )
        db.add(q)
        _add_to_bank_if_new(db, q, paper, source="manual")
        db.commit()
        db.refresh(q)
        return q.to_dict()
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Question Bank (PRD 7.3.4)
# ---------------------------------------------------------------------------
@app.get("/api/question-bank", response_model=List[BankQuestionOut])
def browse_question_bank(
    chapter_id: Optional[str] = None,
    subject: Optional[str] = None,
    standard: Optional[str] = None,
    difficulty: Optional[str] = None,
):
    db = SessionLocal()
    try:
        query = db.query(BankQuestion)
        if chapter_id:
            query = query.filter(BankQuestion.chapter_id == chapter_id)
        if subject:
            query = query.filter(BankQuestion.subject == subject)
        if standard:
            query = query.filter(BankQuestion.standard == standard)
        if difficulty:
            query = query.filter(BankQuestion.difficulty == difficulty)
        entries = query.order_by(BankQuestion.created_at.desc()).all()
        return [e.to_dict() for e in entries]
    finally:
        db.close()


@app.post("/api/question-bank/{bank_id}/add-to-paper", response_model=QuestionOut)
def add_bank_question_to_paper(bank_id: str, request: AddBankQuestionRequest):
    db = SessionLocal()
    try:
        bank_q = db.query(BankQuestion).filter(BankQuestion.id == bank_id).first()
        if bank_q is None:
            raise HTTPException(404, "Bank question not found.")
        paper = db.query(QuestionPaper).filter(QuestionPaper.id == request.paper_id).first()
        if paper is None:
            raise HTTPException(404, "Target question paper not found.")

        max_order = (
            db.query(Question)
            .filter(Question.paper_id == request.paper_id)
            .count()
        )
        new_q = Question(
            id=str(uuid.uuid4()),
            paper_id=request.paper_id,
            chapter_id=bank_q.chapter_id,
            chapter_title=bank_q.chapter_title,
            question_text=bank_q.question_text,
            options=bank_q.options,
            correct_option=bank_q.correct_option,
            marks=bank_q.marks,
            difficulty=bank_q.difficulty,
            accepted=True,  # reused from the bank = already vetted once
            order_index=max_order,
        )
        db.add(new_q)
        bank_q.times_used += 1
        db.commit()
        db.refresh(new_q)
        return new_q.to_dict()
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Static frontend (mounted last so it never shadows the /api/* routes above)
# ---------------------------------------------------------------------------
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
