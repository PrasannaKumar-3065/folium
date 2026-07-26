# EduAI Knowledge Library — MVP

This is a scoped-down MVP of the **Knowledge Library + AI Tutor** piece of the
EduAI PRD, since extended through nearly all of the **Question Paper
Builder**: upload PDF textbooks, get them parsed and chunked — with
chapter-level structure detected — into a vector database, ask an AI tutor
questions answered *only* from what's been uploaded with sources cited by
chapter and page, and generate a chapter-scoped, distribution-aware MCQ
question paper that a teacher can accept, edit, regenerate, delete, or
supplement with their own hand-written questions — with every accepted or
manually-written question saved into a reusable Question Bank — then lay out
with a header/footer and export as a print-ready PDF (student copy or answer
key).

Deliberately **not** included (out of scope for now, all buildable later on
top of the same backend): auth/login, multi-tenant schools, teacher/admin/
student roles, lesson plans, scheduling a paper to a grade/section/roster
(the one remaining piece of the question paper builder — it needs
Grade/Section/Student to exist, which need auth first), the test engine, and
reporting. The frontend is intentionally bare — plain HTML/CSS/JS, no build
step, no framework — so nearly all the work is in the backend.

## Architecture

```
                                              +-->  chunking  ---------------+
                                              |                              v
PDF upload  ->  text extraction (PyMuPDF)  ->-+                     Gemini embeddings
                                              |                              |
                                              +-->  chapter detection        v
                                                     (Gemini, structured   ChromaDB (persistent)
                                                      JSON) --------------->  ^ (chunks tagged
                                                                              |  with their chapter)
question  ->  Gemini agentic tool-calling loop  ->  search_knowledge_base tool
                                                                    |
                                                       answer + sources (incl. chapter)
```

- **Backend:** FastAPI. Chosen over Django because this is an I/O- and
  AI-call-heavy service with no need for an ORM-centric admin app — FastAPI's
  async support, background tasks, and typed request/response models are a
  better fit.
- **Parsing:** [PyMuPDF](https://pymupdf.readthedocs.io/) extracts text
  per-page. If a PDF has effectively no extractable text (e.g. it's a scanned
  image), the document is marked `failed` with a plain-language explanation
  instead of silently indexing nothing.
- **Chunking:** a small dependency-free paragraph-aware chunker
  (`pdf_processor.py`) — merges paragraphs up to ~1000 characters with ~150
  characters of overlap, and hard-splits any unusually long paragraph so no
  chunk grows unbounded. Every chunk remembers which page it started on.
- **Chapter detection:** `chapter_extractor.py` sends a condensed scan (the
  first ~400 characters of every page, where headings usually sit) to Gemini
  and asks for structured JSON chapter boundaries — a regex/font-size
  heuristic would be the first thing to break across the range of textbook
  formatting this platform needs to handle (different boards, publishers,
  standards). Uses the stable `generate_content` call, not the Interactions
  API, since this is single-shot extraction with no need for multi-turn tool
  use. Every chunk is tagged with the chapter its page falls into, so answers
  and (later) generated questions can cite "Chapter 4: The Structure of the
  Atom" instead of just a page number. Never blocks an upload: if detection
  fails for any reason (no API key, malformed response), it falls back to a
  single chapter spanning the whole document, and the doc still gets indexed
  and searchable on page citations alone.
- **Embeddings:** `gemini-embedding-001`, used **asymmetrically** —
  document chunks are embedded with `task_type=RETRIEVAL_DOCUMENT` and search
  queries with `RETRIEVAL_QUERY`. This is a deliberate quality choice; using
  the same embedding for both measurably hurts retrieval.
- **Vector store:** ChromaDB, `PersistentClient` writing straight to local
  disk — zero infrastructure for an MVP. Metadata (`standard`, `subject`,
  `filename`, `page`, `chapter_id`, `chapter_number`, `chapter_title`) is
  stored alongside every chunk, so retrieval can be filtered by chapter (or
  anything else) later without re-indexing anything — `vector_store.query()`
  already accepts a `chapter_id` filter for exactly this.
- **AI Tutor / agentic RAG:** `rag_agent.py` uses the Gemini **Interactions
  API** (`client.interactions.create`, current as of mid-2026) with a single
  `search_knowledge_base` function tool. The model decides for itself when to
  search and can issue a follow-up search if the first attempt doesn't return
  enough — this is a real tool-use loop, not a fixed "always retrieve once"
  pipeline. Each question is currently a fresh, memory-free interaction
  (`store=False`) — **this is a known gap, not a requirement**: the full PRD
  actually asks for the tutor to maintain conversation context across
  follow-ups. Deferred for this MVP slice because a real "current session"
  concept is cleanest to build once there's an actual student identity to
  hang it on (i.e. after auth exists); the Interactions API supports it later
  via `previous_interaction_id` (or `store=True`) without a rewrite.
- **Question Paper Builder (generation slice):** `question_generator.py` +
  two new tables (`QuestionPaper`, `Question`). A teacher picks a ready book,
  one or more of its detected chapters, a total question count, a difficulty
  preference, a pass percentage, and a distribution mode:
  - *Equal* — the count is split as evenly as possible across the selected
    chapters (any remainder goes to the first few, in selection order).
  - *Random* — every chapter is first guaranteed a **floor**: enough
    questions that a student who fully mastered *only* that one chapter,
    and answered every question from it correctly, could still reach the
    pass percentage from that chapter alone. Whatever's left over after
    every chapter has its floor is handed out one question at a time via
    independent random draws — that's the "probability-based" part sitting
    on top of the guarantee.

    This guarantee has a real mathematical ceiling: guaranteeing a floor of
    `F` questions to `N` chapters needs `N*F` questions total, so it's only
    satisfiable when `N * ceil(pass% / 100 * total_questions) <=
    total_questions`. With a 40% pass mark and a 20-question paper, for
    example, at most 2 chapters can each get a full floor (2×8=16 fits; a
    3rd would need 24). When more chapters are selected than that, the floor
    is scaled down to the largest value that *does* fit evenly, and the API
    response's `distribution_feasible` comes back `false` so the UI can say
    so honestly instead of silently shipping a paper that doesn't keep the
    guarantee it implies.

  Each selected chapter's source text is pulled directly from Chroma via a
  plain metadata fetch (`vector_store.get_chunks_by_chapter()`) — not a
  similarity search, since there's no natural-language query here, just
  "give me this chapter's content to generate questions from." Generation
  itself is one Gemini call per chapter (stable `generate_content`, same
  reasoning as chapter detection), asking for exactly that chapter's
  allotted count of MCQs with 4 options, a marked correct answer, and a
  per-question difficulty label. Runs as a background task, same
  generating -> ready|failed pattern as document processing.

  **Evaluation foundation, not the test engine:** every `Question` row
  carries its `chapter_id` and `marks`, so `POST
  /api/question-papers/{id}/score` can report marks per chapter *and*
  overall from a finished set of answers — a pure aggregation, not a
  redesign, matching what the full PRD asks of evaluation. This is a scoring
  *utility* given a completed answer set, though, not the test-taking
  experience itself (timer, scheduling, live submission, anti-cheat) — that
  full loop is the Test Engine (PRD §9), still deferred.
- **Question review (accept / edit / regenerate / delete), PRD §7.3.2:**
  every question in a paper is independently actionable —
  `PATCH /api/questions/{id}` for direct edits (wording, options, correct
  answer, marks, difficulty), `POST /api/questions/{id}/regenerate` asks
  Gemini for one fresh replacement from the *same chapter* and swaps it in
  place (never touching the question if generation fails — you keep what
  you had), `POST /api/questions/{id}/accept` marks it reviewed, and
  `DELETE /api/questions/{id}` removes it outright. "Skip and come back"
  needs no backend support at all — an un-accepted question simply *is* the
  skipped state.
- **Question Bank, PRD §7.3.4:** a separate `bank_questions` table, not just
  a filter over `questions` — the PRD describes questions that accumulate
  usage history across many papers over time ("carries its history — when
  it was used, in which test"), which needs its own lifecycle independent of
  any one paper. Accepting a question copies it into the bank (re-accepting
  the same question doesn't duplicate the entry); `GET /api/question-bank`
  browses it filtered by chapter/subject/standard/difficulty; `POST
  /api/question-bank/{id}/add-to-paper` copies a bank entry into a paper as
  a new, already-`accepted` question (reused = already vetted once) and
  bumps its `times_used` counter. No `average_score` field yet — that needs
  real student attempts, i.e. the Test Engine — adding it later is a new
  column on an existing table, not a redesign.

  What's still ahead in the Question Paper Builder itself (PRD §7.3.6 only
  — everything else in this section is now built, see below).
- **Manual question entry, PRD §7.3.3:** `POST /api/questions/manual` — a
  teacher's own question, same paper, same review UI as generated ones, as
  a "+ Write your own question" card at the end of the questions list.
  Starts `accepted=True` (writing it yourself already *is* the review step)
  and is saved to the Question Bank exactly like accepting a generated
  question is — PRD 7.3.4 covers "creates or accepts" equally, so both
  paths now share one `_add_to_bank_if_new()` helper rather than
  duplicating that logic.
- **Paper layout, PRD §7.3.5:** `PATCH /api/question-papers/{id}/layout`
  sets exam title, school name, grade/section, date, instructions, footer
  text, and teacher name — all optional, all rendered with sensible
  fallbacks at export time rather than defaulted at save time, so the
  stored data always reflects what a teacher actually typed. Deliberately
  doesn't touch generation config (chapters, question count, difficulty):
  changing those after generation would invalidate questions already
  produced, so that's not exposed through this endpoint.
- **PDF export, PRD §7.3.5's "preview exactly as a student would see it"
  taken further into an actual downloadable file:** `pdf_export.py` (using
  reportlab's Platypus API) renders the paper as a proper formatted
  document — header table, instructions, numbered questions with per-
  question marks, page-numbered footer. Two modes via `?include_answers=`:
  the student copy (default) never renders `correct_option` anywhere in the
  code path, not just hidden in the UI — the same guarantee PRD 7.3.2 asks
  for ("visible only to the teacher, never to students"); the answer-key
  copy marks each correct option inline for grading by eye. All question
  text is XML-escaped before going into a reportlab Paragraph (they use an
  HTML-like markup internally, so raw `<`, `>`, `&` from generated content
  can otherwise break the build) — verified with a question deliberately
  containing `<tags>`, `&`, quotes, and a `^` exponent, then reading the
  actual text back out of the generated PDF to confirm it rendered as
  literal text. Also worth knowing: reportlab's built-in fonts don't cover
  Unicode sub/superscript glyphs (₂, ²) — they silently render as boxes —
  so AI-generated chemistry/math notation should stick to plain text (H2O,
  x^2) rather than actual Unicode sub/superscript characters.
- **Scheduling, PRD §7.3.6 — deliberately not built yet, and not a partial
  attempt either:** the PRD's own scheduling flow is "assign to
  grade/section/students, THEN pick a time." Assignment needs
  Grade/Section/Student to exist, and they don't without auth. Adding just
  the timing half now — a start time with no roster to point it at — would
  be an orphaned field with nothing to schedule *for*. Better to build the
  whole flow together once there's a real audience to assign, rather than
  half-build it now and rework it later.
- **Background processing:** FastAPI `BackgroundTasks` — no Celery/Redis for
  an MVP at this scale. `process_document()` is a plain function, so lifting
  it into a real task queue later is a small, contained change (see Scaling
  below).
- **Metadata DB:** SQLite via SQLAlchemy — `documents` and `chapters` track
  upload/processing status and chapter structure; `question_papers` and
  `questions` track the question paper builder's generation and review;
  `bank_questions` is the reusable question library. Swapping to Postgres
  later is a one-line connection-string change in `database.py`.

## Setup

Requires Python 3.10+.

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# edit .env and set GEMINI_API_KEY (get one free at https://aistudio.google.com/apikey)

uvicorn main:app --reload --port 8000
```

Open **http://localhost:8000** — the backend serves the frontend directly, so
that's the only URL you need. Interactive API docs are at
**http://localhost:8000/docs**.

## Using it

1. **Upload Books** — pick one or more PDFs, optionally tag them with a
   Standard/Subject, click Upload. The table below polls automatically and
   flips each document from `processing` to `ready` (or `failed`, with a
   plain-language reason) as it's indexed. Once ready, the Chapters column
   shows a count you can click to expand the detected chapter list.
2. **Ask AI Tutor** — ask a question, optionally scoped to a Standard/Subject.
   The answer is grounded in whatever's been uploaded, with the source
   filename, chapter (when one was detected), and page listed underneath.
3. **Question Papers** — pick a ready book, tick the chapters to draw from,
   set a question count, difficulty, duration, pass percentage, and
   distribution mode, then Generate. The page polls until generation
   finishes and shows the actual per-chapter split, a note if the
   pass-floor guarantee couldn't be fully honored for every chapter, and
   the generated questions — each with **Accept**, **Edit**,
   **Regenerate**, and **Delete** buttons. Edit opens an inline form for
   the wording, all 4 options, the correct answer, and marks. Regenerate
   asks Gemini for one fresh replacement from the same chapter and leaves
   the question untouched if that call fails. Below the questions, "**+
   Write your own question**" adds a teacher-authored question with no AI
   involved. The collapsible **Paper layout** panel sets the exam title,
   school name, grade/section, date, instructions, footer, and teacher name
   — save it, then use **Download student copy (PDF)** or **Download
   answer key (PDF)** at the top of the paper to get a print-ready file
   reflecting whatever's been set. Past papers are listed below and can be
   reopened the same way.
4. **Question Bank** — every question you Accept or write manually lands
   here automatically. Filter by book, chapter, and difficulty, then use
   "Add to selected paper" to copy any bank question straight into another
   paper (pick the target paper from the dropdown first) — it arrives
   already marked Accepted, since reusing it is itself a form of vetting it.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/documents/upload` | Multipart upload, one or more `files`, optional `standard`/`subject` form fields |
| GET | `/api/documents` | List all documents + status |
| GET | `/api/documents/{id}` | Get one document |
| GET | `/api/documents/{id}/chapters` | List a document's detected chapters, in reading order |
| DELETE | `/api/documents/{id}` | Remove a document, its file, its chapters, and its indexed chunks |
| POST | `/api/ask` | `{"question": "...", "standard": "...", "subject": "..."}` -> `{"answer": "...", "sources": [...]}` |
| POST | `/api/question-papers` | Create + kick off generation of a chapter-scoped question paper |
| GET | `/api/question-papers` | List all question papers (summary, no questions) |
| GET | `/api/question-papers/{id}` | Get one paper's full detail, including its generated questions |
| POST | `/api/question-papers/{id}/score` | `{"answers": {question_id: option}}` -> marks per chapter + overall |
| PATCH | `/api/question-papers/{id}/layout` | Set exam title/school name/grade-section/date/instructions/footer/teacher name |
| GET | `/api/question-papers/{id}/export-pdf` | Download as PDF; `?include_answers=true` for the answer key |
| PATCH | `/api/questions/{id}` | Edit a question's text/options/correct answer/marks/difficulty |
| POST | `/api/questions/{id}/accept` | Mark a question accepted; copies it into the Question Bank |
| POST | `/api/questions/{id}/regenerate` | Ask Gemini for one fresh replacement from the same chapter |
| DELETE | `/api/questions/{id}` | Remove a question from its paper entirely |
| POST | `/api/questions/manual` | Add a teacher-written question directly to a paper; also banks it |
| GET | `/api/question-bank` | Browse the bank; optional `chapter_id`/`subject`/`standard`/`difficulty` filters |
| POST | `/api/question-bank/{id}/add-to-paper` | `{"paper_id": "..."}` -> copies a bank question into that paper |
| GET | `/api/health` | Health check |

## Scaling notes

Everything above was chosen to be the simplest thing that's *correctly*
architected, not the simplest thing that merely works today. Concretely, when
you outgrow the MVP defaults:

- **Multiple workers/instances:** `chromadb.PersistentClient` writes straight
  to a local SQLite+HNSW file and is **not** safe for multiple OS processes
  to open concurrently (so don't do `uvicorn --workers 4` as-is). Run
  `chroma run --path ./storage/chroma` as its own process and switch
  `vector_store.py` to `chromadb.HttpClient(...)` instead — everything else
  is unchanged since all Chroma access already goes through
  `vector_store.get_collection()`.
- **Background processing at volume:** swap `BackgroundTasks` for Celery (or
  RQ/arq) with a Redis broker. `process_document()` in `main.py` is already a
  plain, self-contained function — it becomes a task body basically as-is.
- **Metadata DB under concurrent write load:** point `database.py` at
  Postgres instead of SQLite (one connection string).
- **Multi-tenancy / auth:** every document, chunk, question paper, and
  question already carries `standard`/`subject` (or a chapter link back to
  them); adding a `tenant_id`/`teacher_id` alongside what's there and
  filtering by it (plus real auth) is the natural next step and doesn't
  require restructuring anything here.
- **Rate limits / cost:** `gemini_client.py` already batches and retries
  embedding calls; for very large libraries, look at the Gemini Batch API
  (50% cheaper, async) for the initial indexing pass.
- **Containerizing:** the app is a single `uvicorn main:app` process reading
  everything from `backend/.env` — a Dockerfile is a small, standard addition
  whenever you're ready for it.

## What was verified

Every module was exercised end-to-end while building this (PDF extraction and
chunking against a real multi-page PDF, Chroma add/query/delete including
metadata filtering, the full upload -> background-processing -> status flow
through FastAPI's test client, and the agentic tool-calling loop against a
fake Gemini client shaped like the real SDK's response objects) — not just
written and assumed correct. The one thing that could **not** be tested here
is a live call to the real Gemini API, since that requires your own API key;
wire one up via `.env` and it should work as-is.

**Chapter detection**, added after the initial MVP: the page-to-chapter
lookup was verified at every boundary (first/last page of a chapter, the
page where one chapter hands off to the next, out-of-range pages), the
citation-label formatting was verified for numbered chapters, unnumbered
chapters, the "Full Document" fallback, and pre-existing chunks with no
chapter metadata at all, and the full upload -> chunk -> chapter-detect ->
tag pipeline was run end-to-end confirming chunks land in Chroma with the
right `chapter_id`/`chapter_number`/`chapter_title`, and that `chapter_id`
filtering in `vector_store.query()` correctly scopes retrieval to one
chapter. Also confirmed the whole pipeline degrades gracefully with no
`GEMINI_API_KEY` configured (falls back to a single "Full Document" chapter
rather than failing the upload). What's **not** verified: the live Gemini
call inside `chapter_extractor.py` itself — same limitation as above, needs
a real API key — so treat the *quality* of real chapter detection (does it
find the right boundaries on an actual scanned textbook) as unverified until
you try it against one.

**Question Paper Builder (generation slice)**, added after chapter
detection: `compute_distribution()` was unit-tested directly against every
case that matters — equal split with and without a remainder, random mode
where the pass-floor guarantee fits (2 chapters, 40% pass, 20 questions),
random mode where it *doesn't* fit (3 and 5 chapters under the same
constraints, both correctly scaled down and flagged
`distribution_feasible: false`), and edge cases like more chapters than
total questions and an empty chapter list. The API layer was verified with a
seeded "ready" document and real chapters (bypassing the embedding step,
which needs a live key): paper creation validates the document is ready and
every chapter id actually belongs to it, generation runs as a background
task and lands the right `distribution_plan` even when 0 questions could be
generated (no key configured), and the paper correctly ends up `failed` with
a clear reason rather than silently pretending to succeed. Scoring was
verified against a fully seeded paper — including the exact scenario this
feature is built around: a student who answers every question from one
chapter correctly and every question from another chapter incorrectly comes
back with the correct per-chapter marks, the correct overall percentage, and
`passed` matching the paper's own pass threshold. What's **not** verified:
the live Gemini call inside `generate_mcqs_for_chapter()` itself — same
limitation as chapter detection and the tutor, needs a real API key — so the
*quality* of generated questions (are the wrong options plausible, is the
difficulty labeling sensible) is unverified until you try it against one.

**Question review + Question Bank**, added after generation: edit was
verified for both a normal update and its own validation (rejecting a
`correct_option` that isn't one of the question's own option keys); accept
was verified to create exactly one bank entry and to *not* duplicate it on a
second accept of the same question; delete was verified to remove the
question from its paper; regenerate was verified to fail cleanly with a
clear 502 and leave the original question completely untouched when no API
key is configured (never a partial write); and the full bank-reuse loop was
verified end-to-end — adding a bank entry to a *different* paper than the
one it came from correctly creates a new, already-accepted question there
and increments the bank entry's `times_used` — plus filtering the bank by
chapter. What's **not** verified: the live Gemini call inside
`regenerate_question()`'s replacement generation — same limitation as
above, needs a real API key.

**Manual entry, layout, and PDF export**: found and fixed one real gap while
auditing this batch — manual question creation set `accepted=True` but
wasn't copying into the Question Bank, even though the PRD covers questions
a teacher "creates or accepts" equally; both paths now share one
`_add_to_bank_if_new()` helper instead of duplicating that logic, and manual
entry populating the bank is now verified directly. Layout was verified by
setting every field and confirming it round-trips through the API. PDF
export was verified by seeding a paper with two questions whose text
deliberately included `<tags>`, `&`, quotes, and a `^` exponent, exporting
both modes, and reading the actual text back out of the resulting PDFs
(not just eyeballing them) to confirm: the special characters rendered as
literal text rather than breaking the build or being interpreted as markup;
the student copy contains no correct-answer markings anywhere; the answer
key correctly marks every correct option, including the manually-added
question; and a scan for stray control characters in the extracted text
came back clean. What's **not** verified: how the layout and export
endpoints behave once real multi-paragraph or image-heavy question content
shows up (only tested against realistic but short MCQ text).
