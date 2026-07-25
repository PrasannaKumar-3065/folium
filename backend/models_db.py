"""SQLAlchemy ORM models."""
import datetime
import uuid

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, Integer, String, Text

from database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class Document(Base):
    """
    One row per uploaded PDF. This is metadata/status tracking only — the
    actual chunk text + embeddings live in Chroma, keyed by this document's
    id (see vector_store.py).
    """

    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=gen_uuid)
    filename = Column(String, nullable=False)
    standard = Column(String, nullable=True)   # e.g. "Std 11" — free text, optional
    subject = Column(String, nullable=True)    # e.g. "Physics" — free text, optional

    # uploaded -> processing -> ready | failed
    status = Column(String, nullable=False, default="processing")
    error_message = Column(Text, nullable=True)

    page_count = Column(Integer, default=0)
    chunk_count = Column(Integer, default=0)
    chapter_count = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(
        DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "filename": self.filename,
            "standard": self.standard,
            "subject": self.subject,
            "status": self.status,
            "error_message": self.error_message,
            "page_count": self.page_count,
            "chunk_count": self.chunk_count,
            "chapter_count": self.chapter_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Chapter(Base):
    """
    One row per detected chapter within a Document (see chapter_extractor.py).
    Purely additive metadata: nothing downstream depends on this existing,
    so older documents processed before this feature existed simply have
    zero rows here and keep working with page-level citations only.
    """

    __tablename__ = "chapters"

    id = Column(String, primary_key=True, default=gen_uuid)
    doc_id = Column(String, nullable=False)  # FK to documents.id (no ORM relationship
                                              # needed yet — kept simple until the
                                              # Teacher Portal actually joins across them)
    chapter_number = Column(String, nullable=True)  # e.g. "4" — free text, may be absent
    title = Column(String, nullable=False)
    start_page = Column(Integer, nullable=False)
    end_page = Column(Integer, nullable=False)
    order_index = Column(Integer, nullable=False, default=0)  # reading order, since
                                                               # chapter_number can be null

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "doc_id": self.doc_id,
            "chapter_number": self.chapter_number,
            "title": self.title,
            "start_page": self.start_page,
            "end_page": self.end_page,
        }


class QuestionPaper(Base):
    """
    One row per question-paper generation request (PRD 7.3.1). Holds the
    teacher's setup choices and the resulting distribution plan; the
    generated questions themselves are separate Question rows below.

    No teacher/school/tenant ownership field yet — auth and multi-tenancy
    are deliberately deferred (see /areas/ai-school-platform.md). Nothing
    here should need restructuring when that lands: it's the same shape as
    standard/subject on Document — add teacher_id/tenant_id alongside what's
    here and filter by it.
    """

    __tablename__ = "question_papers"

    id = Column(String, primary_key=True, default=gen_uuid)
    doc_id = Column(String, nullable=False)  # which uploaded book this paper draws from
    standard = Column(String, nullable=True)
    subject = Column(String, nullable=True)

    chapter_ids = Column(JSON, nullable=False)  # the chapters the teacher selected, as a list
    total_questions = Column(Integer, nullable=False)
    total_marks = Column(Integer, nullable=False)
    pass_percentage = Column(Float, nullable=False)
    distribution_mode = Column(String, nullable=False)  # "equal" | "random"
    difficulty = Column(String, nullable=False, default="balanced")  # "easy" | "balanced" | "challenging"

    # {chapter_id: question_count} actually used, filled in once generation
    # finishes — lets the UI show exactly how the paper was split without
    # re-deriving it from the questions list.
    distribution_plan = Column(JSON, nullable=True)
    # False when compute_distribution() couldn't honor the full pass-floor
    # guarantee for every selected chapter (see question_generator.py) —
    # surfaced so the teacher isn't told a guarantee that wasn't kept.
    distribution_feasible = Column(Boolean, nullable=True)

    # generating -> ready | failed
    status = Column(String, nullable=False, default="generating")
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(
        DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "doc_id": self.doc_id,
            "standard": self.standard,
            "subject": self.subject,
            "chapter_ids": self.chapter_ids,
            "total_questions": self.total_questions,
            "total_marks": self.total_marks,
            "pass_percentage": self.pass_percentage,
            "distribution_mode": self.distribution_mode,
            "difficulty": self.difficulty,
            "distribution_plan": self.distribution_plan,
            "distribution_feasible": self.distribution_feasible,
            "status": self.status,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Question(Base):
    """
    One AI-generated (or manually written/edited) MCQ belonging to a
    QuestionPaper. `accepted` is set by POST /questions/{id}/accept, which
    also copies this question into BankQuestion below — that's the "every
    question a teacher creates or accepts is saved into the Question Bank"
    rule (PRD 7.3.4).
    """

    __tablename__ = "questions"

    id = Column(String, primary_key=True, default=gen_uuid)
    paper_id = Column(String, nullable=False)
    chapter_id = Column(String, nullable=True)
    chapter_title = Column(String, nullable=True)  # denormalized for display without a join

    question_text = Column(Text, nullable=False)
    options = Column(JSON, nullable=False)  # {"A": "...", "B": "...", "C": "...", "D": "..."}
    correct_option = Column(String, nullable=False)  # "A" | "B" | "C" | "D"
    marks = Column(Integer, nullable=False, default=1)
    difficulty = Column(String, nullable=True)  # "Easy" | "Medium" | "Hard", model's own label

    accepted = Column(Boolean, nullable=False, default=False)
    order_index = Column(Integer, nullable=False, default=0)

    def to_dict(self, include_answer: bool = True) -> dict:
        d = {
            "id": self.id,
            "paper_id": self.paper_id,
            "chapter_id": self.chapter_id,
            "chapter_title": self.chapter_title,
            "question_text": self.question_text,
            "options": self.options,
            "marks": self.marks,
            "difficulty": self.difficulty,
            "accepted": self.accepted,
        }
        # include_answer=False is here for when a student-facing view exists
        # later (Test Engine) — nothing calls it that way yet, since only
        # teachers can reach these endpoints at all right now.
        if include_answer:
            d["correct_option"] = self.correct_option
        return d


class BankQuestion(Base):
    """
    A reusable question template, independent of any one paper (PRD 7.3.4).
    Created whenever a Question is accepted or manually written. Separate
    from Question because the bank tracks its own lifecycle across many
    papers over time (times_used) — it's not just "this paper's accepted
    questions", it's meant to keep accumulating value as a teacher's
    personal library.

    No `average_score` field yet: that needs real student attempts, which
    means the Test Engine, which is still deferred — adding it later is a
    new column, not a redesign, since usage already flows through
    `add_bank_question_to_paper()` in question_generator.py.
    """

    __tablename__ = "bank_questions"

    id = Column(String, primary_key=True, default=gen_uuid)
    doc_id = Column(String, nullable=True)
    chapter_id = Column(String, nullable=True)
    chapter_title = Column(String, nullable=True)
    standard = Column(String, nullable=True)
    subject = Column(String, nullable=True)

    question_text = Column(Text, nullable=False)
    options = Column(JSON, nullable=False)
    correct_option = Column(String, nullable=False)
    marks = Column(Integer, nullable=False, default=1)
    difficulty = Column(String, nullable=True)

    source = Column(String, nullable=False, default="ai_accepted")  # "ai_accepted" | "manual"
    times_used = Column(Integer, nullable=False, default=0)  # times added to a paper beyond its origin
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "doc_id": self.doc_id,
            "chapter_id": self.chapter_id,
            "chapter_title": self.chapter_title,
            "standard": self.standard,
            "subject": self.subject,
            "question_text": self.question_text,
            "options": self.options,
            "correct_option": self.correct_option,
            "marks": self.marks,
            "difficulty": self.difficulty,
            "source": self.source,
            "times_used": self.times_used,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
