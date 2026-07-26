# EduAI Knowledge Library — Frontend

A React + Vite frontend for **AI-powered exam paper generation**. Teachers upload PDF textbooks, and EduAI generates syllabus-aligned question papers, builds a reusable question bank, and exports print-ready PDFs.

> **This repository is the frontend only.** All features that hit `/api` (document processing, AI generation, PDF export) require a separate backend. The frontend fails gracefully when no backend is connected.

---

## Prerequisites

| Tool    | Minimum version |
|---------|----------------|
| Node.js | 18.x            |
| npm     | 9.x             |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create your local env file
cp .env.example .env

# 3. (Optional) Point the dev server at your local backend
#    Edit .env and set:
#      VITE_API_PROXY_TARGET=http://localhost:8000

# 4. Start the dev server
npm run dev
```

Open **http://localhost:5000** (or whichever port you set).

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable                 | Default     | Description |
|--------------------------|-------------|-------------|
| `VITE_API_URL`           | *(blank → `/api`)* | Base URL for backend API calls in the browser. Leave blank to use the Vite proxy, or set to a full URL (e.g. `https://api.your-domain.com`) for production. |
| `PORT`                   | `5000`      | Port the Vite dev server listens on. |
| `VITE_HOST`              | `0.0.0.0`   | Host the Vite dev server binds to. `0.0.0.0` makes it reachable outside localhost (Docker, cloud IDEs, etc.). |
| `VITE_API_PROXY_TARGET`  | *(blank)*   | When set, Vite proxies all `/api/*` requests to this URL during development. Avoids CORS issues when running the frontend and backend on different ports. |

> **Replit users:** Do not create a `.env` file. Add secrets through the Replit Secrets panel (`SESSION_SECRET` etc.). The variables above (`PORT`, `VITE_HOST`) are safe to leave at their defaults on Replit.

---

## Development with a Local Backend

If your backend runs on port `8000`:

```env
# .env
VITE_API_PROXY_TARGET=http://localhost:8000
```

Leave `VITE_API_URL` empty. All browser requests to `/api/*` will be forwarded to `http://localhost:8000/api/*` by Vite — no CORS headers needed.

---

## Production Build

```bash
npm run build
```

Output is in `dist/`. It is a standard static bundle — deploy to any host:

| Host | Notes |
|------|-------|
| Vercel / Netlify | Drop `dist/` in; configure rewrite rules so all paths serve `index.html`. |
| Cloudflare Pages | Same as above. |
| Nginx / Apache | Add a `try_files $uri /index.html` rule for SPA routing. |
| Docker | `COPY dist/ /usr/share/nginx/html` with the above Nginx rule. |

For production, set `VITE_API_URL` at **build time**:

```bash
VITE_API_URL=https://api.your-domain.com npm run build
```

Or use your host's environment variable panel — Vite bakes `VITE_*` variables into the bundle at build time.

---

## Project Structure

```
src/
├── config/
│   └── api.js                  # VITE_API_URL → API_BASE constant
│
├── lib/
│   └── api.js                  # safeJson, apiGet/Post/Patch/Delete/Upload helpers
│
├── hooks/
│   └── useDocuments.js         # Reusable hook: fetch document list
│
├── components/
│   ├── app/
│   │   ├── AppNav.jsx          # Tab navigation bar
│   │   ├── Upload.jsx          # PDF upload + document list
│   │   ├── AskAI.jsx           # AI chat with Markdown + LaTeX
│   │   ├── QuestionPapers.jsx  # Paper generation, editing, export
│   │   └── QuestionBank.jsx    # Accepted questions browser + filters
│   └── shared/
│       ├── MarkdownRenderer.jsx # react-markdown + KaTeX wrapper
│       ├── StatusBadge.jsx      # Coloured status pill (ready/processing/…)
│       └── EmptyState.jsx       # Reusable empty-list placeholder
│
├── pages/
│   ├── Landing.jsx             # Marketing landing page
│   └── AppPage.jsx             # App shell with tab routing
│
├── App.jsx                     # Top-level router (/ → Landing, /app/* → AppPage)
├── main.jsx                    # React root + BrowserRouter
└── index.css                   # Global styles (schoolish warm palette)
```

---

## Backend API Contract

The frontend expects the following REST endpoints at `{VITE_API_URL}`:

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/documents` | List all uploaded documents |
| `POST` | `/documents/upload` | Upload one or more PDF files (multipart) |
| `GET`  | `/documents/:id/chapters` | List chapters for a document |
| `DELETE` | `/documents/:id` | Delete a document |
| `POST` | `/ask` | AI Q&A — `{ question, standard?, subject? }` → `{ answer, sources? }` |
| `GET`  | `/question-papers` | List all papers |
| `POST` | `/question-papers` | Generate a new paper |
| `GET`  | `/question-papers/:id` | Get paper with questions |
| `PATCH` | `/question-papers/:id/layout` | Update paper header/footer |
| `GET`  | `/question-papers/:id/export-pdf` | Download student copy PDF |
| `GET`  | `/question-papers/:id/export-pdf?include_answers=true` | Download answer-key PDF |
| `POST` | `/question-papers/:id/add-question` | Add a bank question to a paper |
| `POST` | `/questions/:id/accept` | Accept a question into the bank |
| `POST` | `/questions/:id/regenerate` | Regenerate a question with AI |
| `PATCH` | `/questions/:id` | Edit a question |
| `DELETE` | `/questions/:id` | Delete a question |
| `POST` | `/questions/manual` | Add a manually-written question |
| `GET`  | `/questions/bank` | Filtered question bank (`?doc_id=&chapter_id=&difficulty=`) |

All endpoints return `application/json`. The frontend uses `safeJson()` to handle non-JSON responses gracefully.

---

## Adding a New Feature

1. **New API call** → use helpers from `src/lib/api.js` (`apiGet`, `apiPost`, etc.).
2. **Shared data** (e.g. fetching documents in multiple places) → add or extend a hook in `src/hooks/`.
3. **New UI pattern** → add a shared component to `src/components/shared/`.
4. **New page/tab** → add a route in `src/App.jsx` and a tab entry in `src/pages/AppPage.jsx`.

---

## Tech Stack

| Library | Purpose |
|---------|---------|
| React 18 | UI framework |
| React Router v6 | Client-side routing |
| Vite | Dev server + bundler |
| react-markdown | Markdown rendering in AI chat |
| remark-math + rehype-katex | LaTeX / math rendering |
| KaTeX | Math typesetting |

---

## License

MIT
