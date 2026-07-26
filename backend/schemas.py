"""Pydantic schemas for API request/response bodies."""
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class DocumentOut(BaseModel):
    id: str
    filename: str
    standard: Optional[str] = None
    subject: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    page_count: int
    chunk_count: int
    chapter_count: int
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ChapterOut(BaseModel):
    id: str
    doc_id: str
    chapter_number: Optional[str] = None
    title: str
    start_page: int
    end_page: int


class UploadResultItem(BaseModel):
    filename: str
    error: Optional[str] = None
    document: Optional[DocumentOut] = None


class UploadResponse(BaseModel):
    results: List[UploadResultItem]


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1)
    standard: Optional[str] = None
    subject: Optional[str] = None


class SourceOut(BaseModel):
    filename: str
    page: Optional[int] = None
    chapter: Optional[str] = None
    standard: Optional[str] = None
    subject: Optional[str] = None


class AskResponse(BaseModel):
    answer: str
    sources: List[SourceOut]


class QuestionPaperCreateRequest(BaseModel):
    doc_id: str
    chapter_ids: List[str] = Field(..., min_length=1)
    total_questions: int = Field(..., gt=0)
    # Defaults to total_questions (1 mark each) if omitted.
    total_marks: Optional[int] = Field(None, gt=0)
    duration_minutes: Optional[int] = Field(None, gt=0)
    distribution_mode: Literal["equal", "random"]
    pass_percentage: float = Field(..., gt=0, le=100)
    difficulty: Literal["easy", "balanced", "challenging"] = "balanced"


class QuestionOut(BaseModel):
    id: str
    paper_id: str
    chapter_id: Optional[str] = None
    chapter_title: Optional[str] = None
    question_text: str
    options: Dict[str, str]
    correct_option: str
    marks: int
    difficulty: Optional[str] = None
    accepted: bool


class QuestionPaperOut(BaseModel):
    id: str
    doc_id: str
    standard: Optional[str] = None
    subject: Optional[str] = None
    chapter_ids: List[str]
    total_questions: int
    total_marks: int
    duration_minutes: Optional[int] = None
    pass_percentage: float
    distribution_mode: str
    difficulty: str
    distribution_plan: Optional[Dict[str, int]] = None
    distribution_feasible: Optional[bool] = None
    status: str
    error_message: Optional[str] = None
    exam_title: Optional[str] = None
    school_name: Optional[str] = None
    grade_section: Optional[str] = None
    exam_date: Optional[str] = None
    instructions_text: Optional[str] = None
    footer_text: Optional[str] = None
    teacher_name: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    questions: List[QuestionOut] = []


class PaperLayoutUpdateRequest(BaseModel):
    exam_title: Optional[str] = None
    school_name: Optional[str] = None
    grade_section: Optional[str] = None
    exam_date: Optional[str] = None
    instructions_text: Optional[str] = None
    footer_text: Optional[str] = None
    teacher_name: Optional[str] = None


class ScoreRequest(BaseModel):
    # {question_id: selected_option}
    answers: Dict[str, str]


class ChapterScoreOut(BaseModel):
    chapter_id: Optional[str] = None
    chapter_title: Optional[str] = None
    marks_scored: int
    marks_possible: int


class ScoreResponse(BaseModel):
    overall_marks_scored: int
    overall_marks_possible: int
    overall_percentage: float
    passed: bool
    per_chapter: List[ChapterScoreOut]


class QuestionUpdateRequest(BaseModel):
    # All optional — only the fields the teacher actually changed need to be sent.
    question_text: Optional[str] = None
    options: Optional[Dict[str, str]] = None
    correct_option: Optional[str] = None
    marks: Optional[int] = Field(None, gt=0)
    difficulty: Optional[str] = None


class BankQuestionOut(BaseModel):
    id: str
    doc_id: Optional[str] = None
    chapter_id: Optional[str] = None
    chapter_title: Optional[str] = None
    standard: Optional[str] = None
    subject: Optional[str] = None
    question_text: str
    options: Dict[str, str]
    correct_option: str
    marks: int
    difficulty: Optional[str] = None
    source: str
    times_used: int
    created_at: Optional[str] = None


class AddBankQuestionRequest(BaseModel):
    paper_id: str


class ManualQuestionCreateRequest(BaseModel):
    paper_id: str
    chapter_id: Optional[str] = None
    question_text: str = Field(..., min_length=1)
    options: Dict[str, str]
    correct_option: str
    marks: int = Field(1, gt=0)
    difficulty: Optional[str] = None
