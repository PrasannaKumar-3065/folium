"""
Question paper PDF export (PRD 7.3.5).

Two modes via include_answers:
- False — the student copy. No correct answers shown anywhere. This is the
  version PRD 7.3.2 says must never reach a student ("visible only to the
  teacher, never to students during the test") — enforced here by simply
  never rendering q.correct_option when this is False.
- True — the answer-key / teacher copy. Each question's correct option is
  marked inline (bold, colored, and a plain-ASCII "(Correct answer)" label)
  so a teacher can grade by eye without cross-referencing a separate key.

  Deliberately plain ASCII text for that label, not a Unicode checkmark:
  reportlab's built-in fonts (Helvetica etc.) don't cover most Unicode
  symbol glyphs and silently mis-render them as control characters — the
  same failure mode this codebase's own PDF skill warns about for Unicode
  sub/superscripts. Caught this by extracting text back out of a real
  generated PDF and checking for the character, not by eyeballing it.

All header/footer fields on QuestionPaper (exam_title, school_name,
grade_section, exam_date, instructions_text, footer_text, teacher_name) are
optional — sensible defaults are applied here at render time, not stored on
the paper, so the *data* always reflects whether a teacher has actually
customized something.
"""
from io import BytesIO
from typing import List
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

DEFAULT_INSTRUCTIONS = "Choose the most appropriate answer for each question."

_styles = getSampleStyleSheet()
_TITLE = ParagraphStyle("PaperTitle", parent=_styles["Title"], fontSize=16, spaceAfter=2)
_SCHOOL = ParagraphStyle("SchoolName", parent=_styles["Normal"], fontSize=11, alignment=1)
_INSTRUCTIONS = ParagraphStyle("Instructions", parent=_styles["Italic"], fontSize=9, spaceAfter=10)
_QUESTION = ParagraphStyle("Question", parent=_styles["Normal"], fontSize=10.5, spaceBefore=10, spaceAfter=4, leading=14)
_OPTION = ParagraphStyle("Option", parent=_styles["Normal"], fontSize=10, leftIndent=16, leading=13, spaceAfter=2)
_OPTION_CORRECT = ParagraphStyle("OptionCorrect", parent=_OPTION, textColor=colors.HexColor("#166534"), fontName="Helvetica-Bold")


def _esc(text: str) -> str:
    """reportlab Paragraphs use a small HTML-like markup — raw <, >, & from
    generated question text must be escaped or the PDF build can fail."""
    return escape(text or "")


def _header_table(paper: dict) -> Table:
    exam_title = paper.get("exam_title") or f"{paper.get('subject') or 'Subject'} Test"
    duration = f"{paper['duration_minutes']} min" if paper.get("duration_minutes") else "—"
    rows = [
        [Paragraph(_esc(f"Subject: {paper.get('subject') or '—'}"), _styles["Normal"]),
         Paragraph(_esc(f"Grade/Section: {paper.get('grade_section') or paper.get('standard') or '—'}"), _styles["Normal"])],
        [Paragraph(_esc(f"Date: {paper.get('exam_date') or '—'}"), _styles["Normal"]),
         Paragraph(_esc(f"Duration: {duration}"), _styles["Normal"])],
        [Paragraph(_esc(f"Max Marks: {paper.get('total_marks')}"), _styles["Normal"]),
         Paragraph(_esc(f"Teacher: {paper.get('teacher_name') or '—'}"), _styles["Normal"])],
    ]
    table = Table(rows, colWidths=[90 * mm, 90 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return exam_title, table


def _footer(paper: dict):
    footer_bits = [b for b in [paper.get("footer_text"), paper.get("teacher_name")] if b]
    footer_line = "  |  ".join(footer_bits)

    def draw(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.grey)
        if footer_line:
            canvas.drawString(20 * mm, 12 * mm, footer_line)
        canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, f"Page {doc.page}")
        canvas.restoreState()

    return draw


def build_paper_pdf(paper: dict, questions: List[dict], include_answers: bool) -> bytes:
    """
    paper: QuestionPaper.to_dict()
    questions: [Question.to_dict()] in the order they should print, already
    including correct_option regardless of include_answers — this function
    is what decides whether to actually render it, keeping that decision in
    one place rather than trusting every caller to pass the right shape.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=18 * mm,
        bottomMargin=22 * mm,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
    )

    exam_title, header = _header_table(paper)
    elements = []
    if paper.get("school_name"):
        elements.append(Paragraph(_esc(paper["school_name"]), _SCHOOL))
        elements.append(Spacer(1, 4))
    elements.append(Paragraph(_esc(exam_title), _TITLE))
    if include_answers:
        elements.append(Paragraph("ANSWER KEY — TEACHER COPY", ParagraphStyle("Badge", parent=_styles["Normal"], textColor=colors.red, fontSize=9, alignment=1, spaceAfter=6)))
    elements.append(Spacer(1, 6))
    elements.append(header)
    elements.append(Spacer(1, 10))
    elements.append(Paragraph(_esc(paper.get("instructions_text") or DEFAULT_INSTRUCTIONS), _INSTRUCTIONS))

    for i, q in enumerate(questions, start=1):
        marks_label = f"[{q['marks']} mark{'s' if q['marks'] != 1 else ''}]"
        elements.append(Paragraph(f"{i}. {_esc(q['question_text'])} <i>{marks_label}</i>", _QUESTION))
        for key in ["A", "B", "C", "D"]:
            val = q["options"].get(key, "")
            is_correct = include_answers and key == q.get("correct_option")
            style = _OPTION_CORRECT if is_correct else _OPTION
            suffix = "  (Correct answer)" if is_correct else ""
            elements.append(Paragraph(f"{key}. {_esc(val)}{suffix}", style))

    footer_fn = _footer(paper)
    doc.build(elements, onFirstPage=footer_fn, onLaterPages=footer_fn)
    return buffer.getvalue()
