import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost } from '../../lib/api.js'
import { useDocuments } from '../../hooks/useDocuments.js'
import EmptyState from '../shared/EmptyState.jsx'

const DIFF_COLORS = { Easy: '#dcfce7', Medium: '#fef9c3', Hard: '#fee2e2' }
const DIFF_TEXT   = { Easy: '#166534', Medium: '#854d0e', Hard: '#991b1b' }

export default function QuestionBank() {
  const { docs, load: loadDocs } = useDocuments({ readyOnly: true })
  const [papers,    setPapers]    = useState([])
  const [chapters,  setChapters]  = useState([])
  const [questions, setQuestions] = useState([])

  const [docFilter,     setDocFilter]     = useState('')
  const [chapterFilter, setChapterFilter] = useState('')
  const [diffFilter,    setDiffFilter]    = useState('')
  const [targetPaper,   setTargetPaper]   = useState('')
  const [addMsg,        setAddMsg]        = useState({}) // questionId → message

  const [loading, setLoading] = useState(true)

  const loadPapers = useCallback(async () => {
    try {
      const { data } = await apiGet('/question-papers')
      if (Array.isArray(data)) setPapers(data)
    } catch { /* no backend */ }
  }, [])

  const loadBank = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (docFilter)     params.set('doc_id',     docFilter)
    if (chapterFilter) params.set('chapter_id', chapterFilter)
    if (diffFilter)    params.set('difficulty',  diffFilter)
    try {
      const { data } = await apiGet(`/question-bank?${params}`)
      if (Array.isArray(data)) setQuestions(data)
    } catch { /* no backend */ } finally {
      setLoading(false)
    }
  }, [docFilter, chapterFilter, diffFilter])

  useEffect(() => { loadDocs(); loadPapers() }, [loadDocs, loadPapers])
  useEffect(() => { loadBank() }, [loadBank])

  // Refresh chapters whenever the selected doc filter changes
  useEffect(() => {
    if (!docFilter) { setChapters([]); setChapterFilter(''); return }
    apiGet(`/documents/${docFilter}/chapters`)
      .then(({ data }) => setChapters(Array.isArray(data) ? data : []))
      .catch(() => setChapters([]))
  }, [docFilter])

  async function addToPaper(questionId) {
    if (!targetPaper) return
    const { response, data } = await apiPost(
      `/question-papers/${targetPaper}/add-question`,
      { question_id: questionId }
    )
    if (response.ok) {
      setAddMsg(m => ({ ...m, [questionId]: '✓ Added!' }))
      setTimeout(() => setAddMsg(m => ({ ...m, [questionId]: '' })), 2000)
    } else {
      setAddMsg(m => ({ ...m, [questionId]: data?.detail || 'Could not add.' }))
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div className="page-header-icon" style={{ background: '#fef3c7' }}>🗂️</div>
        <div>
          <h2>Question Bank</h2>
          <p>Every accepted question lives here, ready to reuse in future papers.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card card-accent card-accent-amber">
        <p className="section-title" style={{ marginBottom: 14 }}>🔍 Filter Questions</p>
        <div className="row">
          <div className="form-field" style={{ flex: 1 }}>
            <label>Book</label>
            <select className="form-select" value={docFilter} onChange={e => { setDocFilter(e.target.value); setChapterFilter('') }}>
              <option value="">All books</option>
              {docs.map(d => <option key={d.id} value={d.id}>{d.filename}</option>)}
            </select>
          </div>
          <div className="form-field" style={{ flex: 1 }}>
            <label>Chapter</label>
            <select className="form-select" value={chapterFilter} onChange={e => setChapterFilter(e.target.value)}>
              <option value="">All chapters</option>
              {chapters.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div className="form-field" style={{ flex: 1 }}>
            <label>Difficulty</label>
            <select className="form-select" value={diffFilter} onChange={e => setDiffFilter(e.target.value)}>
              <option value="">Any</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
          </div>
          <div className="form-field" style={{ flex: 1 }}>
            <label>Add to paper</label>
            <select className="form-select" value={targetPaper} onChange={e => setTargetPaper(e.target.value)}>
              <option value="">— select paper —</option>
              {papers.map(p => (
                <option key={p.id} value={p.id}>
                  {p.subject || '—'} / {p.standard || '—'} ({p.total_questions}q)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <EmptyState icon="⏳" title="Loading…" />
      ) : questions.length === 0 ? (
        <EmptyState icon="🗂️" title="No questions yet">
          Accept questions from a question paper to populate your bank.
        </EmptyState>
      ) : (
        <div>
          <p className="hint" style={{ marginBottom: 12, fontWeight: 700 }}>
            {questions.length} question{questions.length === 1 ? '' : 's'} found
          </p>
          {questions.map((q, i) => (
            <div key={q.id} className="q-card">
              <p className="q-text">
                <span style={{ color: 'var(--amber)', fontWeight: 800, marginRight: 4 }}>Q{i + 1}.</span>
                {q.question_text}
                {q.difficulty && (
                  <span style={{
                    display: 'inline-block',
                    marginLeft: 8,
                    padding: '1px 8px',
                    borderRadius: 12,
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    background: DIFF_COLORS[q.difficulty] || '#f3f4f6',
                    color: DIFF_TEXT[q.difficulty] || '#374151',
                  }}>{q.difficulty}</span>
                )}
                {q.marks != null && (
                  <span className="q-meta">{q.marks} mark{q.marks === 1 ? '' : 's'}</span>
                )}
                {q.chapter_title && (
                  <span className="q-meta">· {q.chapter_title}</span>
                )}
                {q.accepted && <span className="accepted-badge">✓ Accepted</span>}
              </p>
              <ul className="q-options">
                {Object.entries(q.options || {}).map(([k, v]) => (
                  <li key={k} className={k === q.correct_option ? 'correct' : ''}>
                    <strong>{k}.</strong> {v}
                  </li>
                ))}
              </ul>
              {targetPaper && (
                <div className="row-center" style={{ marginTop: 8 }}>
                  <button className="btn btn-amber btn-sm" onClick={() => addToPaper(q.id)}>
                    + Add to Paper
                  </button>
                  {addMsg[q.id] && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--green)', fontWeight: 700 }}>
                      {addMsg[q.id]}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
