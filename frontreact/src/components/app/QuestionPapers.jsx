import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost, apiPatch, apiDelete, apiUrl } from '../../lib/api.js'
import { useDocuments } from '../../hooks/useDocuments.js'
import StatusBadge from '../shared/StatusBadge.jsx'
import EmptyState from '../shared/EmptyState.jsx'

/* ── Single question card ───────────────────────────────── */
function QuestionCard({ q, index, onRefresh }) {
  const [editMode, setEditMode] = useState(false)
  const [editText, setEditText] = useState(q.question_text)
  const [editOptions, setEditOptions] = useState({ ...q.options })
  const [editCorrect, setEditCorrect] = useState(q.correct_option)
  const [editMarks, setEditMarks] = useState(q.marks)
  const [msg, setMsg] = useState('')

  async function handleAccept() {
    const { response, data } = await apiPost(`/questions/${q.id}/accept`, {})
    if (response.ok) onRefresh()
    else setMsg(data?.detail || 'Could not accept.')
  }

  async function handleRegen() {
    setMsg('Asking AI for a replacement…')
    try {
      const { response, data } = await apiPost(`/questions/${q.id}/regenerate`, {})
      if (response.ok) { setMsg(''); onRefresh() }
      else setMsg(data?.detail || 'Could not regenerate.')
    } catch (err) { setMsg('Request failed: ' + err.message) }
  }

  async function handleDelete() {
    if (!confirm('Remove this question from the paper?')) return
    const { response } = await apiDelete(`/questions/${q.id}`)
    if (response.ok) onRefresh()
    else setMsg('Could not delete.')
  }

  async function handleSave(e) {
    e.preventDefault()
    const { response, data } = await apiPatch(`/questions/${q.id}`, {
      question_text: editText,
      options: editOptions,
      correct_option: editCorrect,
      marks: Number(editMarks),
    })
    if (response.ok) { setEditMode(false); onRefresh() }
    else setMsg(data?.detail || 'Could not save.')
  }

  return (
    <div className="q-card">
      {!editMode ? (
        <div>
          <p className="q-text">
            <span style={{ color: 'var(--teal)', fontWeight: 800, marginRight: 4 }}>Q{index + 1}.</span>
            {q.question_text}
            <span className="q-meta">({q.chapter_title || 'Unknown'} · {q.marks} mark{q.marks === 1 ? '' : 's'} · {q.difficulty || '—'})</span>
            {q.accepted && <span className="accepted-badge">✓ Accepted</span>}
          </p>
          <ul className="q-options">
            {Object.entries(q.options).map(([k, v]) => (
              <li key={k} className={k === q.correct_option ? 'correct' : ''}>
                <strong>{k}.</strong> {v}
              </li>
            ))}
          </ul>
          <div className="q-actions">
            <button className="btn btn-success btn-sm" onClick={handleAccept} disabled={q.accepted}>
              {q.accepted ? '✓ Accepted' : '✓ Accept'}
            </button>
            <button className="btn btn-sm" style={{ background: 'var(--blue)', color: '#fff' }} onClick={() => setEditMode(true)}>✏ Edit</button>
            <button className="btn btn-purple btn-sm" onClick={handleRegen}>↺ Regenerate</button>
            <button className="btn btn-danger btn-sm" onClick={handleDelete}>🗑 Delete</button>
          </div>
          {msg && <p className="error-text" style={{ marginTop: 6 }}>{msg}</p>}
        </div>
      ) : (
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="form-field">
            <label>Question text</label>
            <textarea className="form-textarea" value={editText} onChange={e => setEditText(e.target.value)} rows={2} />
          </div>
          {['A', 'B', 'C', 'D'].map(k => (
            <div key={k} className="row-center">
              <span style={{ width: 22, fontWeight: 800, color: 'var(--ink-muted)' }}>{k}.</span>
              <input className="form-input" style={{ flex: 1 }} value={editOptions[k] || ''} onChange={e => setEditOptions(o => ({ ...o, [k]: e.target.value }))} />
            </div>
          ))}
          <div className="row">
            <div className="form-field">
              <label>Correct option</label>
              <select className="form-select" value={editCorrect} onChange={e => setEditCorrect(e.target.value)}>
                {['A', 'B', 'C', 'D'].map(k => <option key={k}>{k}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Marks</label>
              <input className="form-input" type="number" min={1} value={editMarks} onChange={e => setEditMarks(e.target.value)} style={{ width: 80 }} />
            </div>
          </div>
          <div className="q-actions">
            <button type="submit" className="btn btn-primary btn-sm">💾 Save</button>
            <button type="button" className="btn btn-gray btn-sm" onClick={() => setEditMode(false)}>Cancel</button>
          </div>
          {msg && <p className="error-text">{msg}</p>}
        </form>
      )}
    </div>
  )
}

/* ── Manual question form ───────────────────────────────── */
function ManualQuestionForm({ paperId, chapterIds, questions, onRefresh }) {
  const [show, setShow] = useState(false)
  const [chapterId, setChapterId] = useState(chapterIds[0] || '')
  const [text, setText] = useState('')
  const [options, setOptions] = useState({ A: '', B: '', C: '', D: '' })
  const [correct, setCorrect] = useState('A')
  const [marks, setMarks] = useState(1)
  const [msg, setMsg] = useState('')

  async function handleAdd() {
    setMsg('')
    const { response, data } = await apiPost('/questions/manual', {
      paper_id: paperId,
      chapter_id: chapterId || null,
      question_text: text,
      options,
      correct_option: correct,
      marks: Number(marks),
    })
    if (response.ok) {
      setText(''); setOptions({ A: '', B: '', C: '', D: '' }); setCorrect('A'); setMarks(1)
      setShow(false); onRefresh()
    } else {
      setMsg(data?.detail || 'Could not add question.')
    }
  }

  if (!show) return (
    <button className="btn btn-teal btn-sm" style={{ marginTop: 10 }} onClick={() => setShow(true)}>
      + Write your own question
    </button>
  )

  return (
    <div className="q-card" style={{ borderLeftColor: 'var(--amber)', borderStyle: 'dashed solid solid dashed' }}>
      <p className="section-title" style={{ marginBottom: 12 }}>✏️ Add a Manual Question</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="form-field">
          <label>Chapter</label>
          <select className="form-select" value={chapterId} onChange={e => setChapterId(e.target.value)}>
            {chapterIds.map(cid => {
              const q = questions.find(x => x.chapter_id === cid)
              return <option key={cid} value={cid}>{q ? q.chapter_title : cid}</option>
            })}
          </select>
        </div>
        <div className="form-field">
          <label>Question text</label>
          <textarea className="form-textarea" rows={2} value={text} onChange={e => setText(e.target.value)} placeholder="Type your question…" />
        </div>
        {['A', 'B', 'C', 'D'].map(k => (
          <div key={k} className="row-center">
            <span style={{ width: 22, fontWeight: 800, color: 'var(--ink-muted)' }}>{k}.</span>
            <input className="form-input" style={{ flex: 1 }} placeholder={`Option ${k}`} value={options[k]} onChange={e => setOptions(o => ({ ...o, [k]: e.target.value }))} />
          </div>
        ))}
        <div className="row">
          <div className="form-field">
            <label>Correct option</label>
            <select className="form-select" value={correct} onChange={e => setCorrect(e.target.value)}>
              {['A', 'B', 'C', 'D'].map(k => <option key={k}>{k}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label>Marks</label>
            <input className="form-input" type="number" min={1} value={marks} onChange={e => setMarks(e.target.value)} style={{ width: 80 }} />
          </div>
        </div>
        <div className="q-actions">
          <button className="btn btn-teal btn-sm" onClick={handleAdd}>+ Add Question</button>
          <button className="btn btn-gray btn-sm" onClick={() => setShow(false)}>Cancel</button>
        </div>
        {msg && <p className="error-text">{msg}</p>}
      </div>
    </div>
  )
}

/* ── Paper layout / header editor ───────────────────────── */
function LayoutPanel({ paper, paperId, onRefresh }) {
  const FIELDS = [
    ['exam_title',    'Exam title',      'e.g. Unit Test 1'],
    ['school_name',   'School name',     ''],
    ['grade_section', 'Grade / Section', 'e.g. 10 A'],
    ['exam_date',     'Date',            'e.g. 25 July 2026'],
    ['teacher_name',  'Teacher name',    ''],
    ['footer_text',   'Footer text',     'e.g. All the Best!'],
  ]
  const [values, setValues] = useState(() =>
    Object.fromEntries(FIELDS.map(([k]) => [k, paper[k] || '']))
  )
  const [instructions, setInstructions] = useState(paper.instructions_text || '')
  const [msg, setMsg] = useState('')

  async function handleSave(e) {
    e.preventDefault()
    const { response } = await apiPatch(`/question-papers/${paperId}/layout`, {
      ...values,
      instructions_text: instructions,
    })
    if (response.ok) { setMsg('✓ Saved'); onRefresh() }
    else setMsg('Could not save layout.')
  }

  return (
    <details className="layout-panel">
      <summary>Paper Layout (Header &amp; Footer)</summary>
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {FIELDS.map(([key, label, placeholder]) => (
            <div key={key} className="form-field">
              <label>{label}</label>
              <input
                className="form-input"
                placeholder={placeholder}
                value={values[key]}
                onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="form-field">
          <label>Instructions</label>
          <textarea className="form-textarea" rows={2} value={instructions} onChange={e => setInstructions(e.target.value)} />
        </div>
        <div className="row-center">
          <button type="submit" className="btn btn-primary btn-sm">💾 Save Layout</button>
          {msg && <span style={{ fontSize: '0.82rem', color: 'var(--green)', fontWeight: 700 }}>{msg}</span>}
        </div>
      </form>
    </details>
  )
}

/* ── Paper detail view ──────────────────────────────────── */
function PaperDetail({ paperId, onBack }) {
  const [paper, setPaper] = useState(null)

  const load = useCallback(async () => {
    try {
      const { data } = await apiGet(`/question-papers/${paperId}`)
      if (data) setPaper(data)
    } catch { /* no backend */ }
  }, [paperId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!paper || paper.status !== 'generating') return
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [load, paper])

  if (!paper) return (
    <EmptyState icon="⏳" title="Loading paper…" />
  )

  const hasQuestions = (paper.questions || []).length > 0

  return (
    <div className="stack">
      <div className="row-center">
        <button className="btn btn-gray btn-sm" onClick={onBack}>← Back to list</button>
        <StatusBadge status={paper.status} />
        {paper.error_message && <span className="error-text">{paper.error_message}</span>}
      </div>

      {/* Export links — use apiUrl() so they honour VITE_API_URL */}
      {(paper.status === 'ready' || paper.status === 'done') && hasQuestions && (
        <div className="card" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', borderTop: '4px solid var(--teal)' }}>
          <p className="section-title" style={{ marginBottom: 10 }}>📤 Export Paper</p>
          <div className="export-links">
            <a
              className="btn btn-teal"
              href={apiUrl(`/question-papers/${paperId}/export-pdf`)}
              target="_blank"
              rel="noreferrer"
            >
              📄 Student Copy (PDF)
            </a>
            <a
              className="btn btn-amber"
              href={apiUrl(`/question-papers/${paperId}/export-pdf?include_answers=true`)}
              target="_blank"
              rel="noreferrer"
            >
              🔑 Answer Key (PDF)
            </a>
          </div>
        </div>
      )}

      <LayoutPanel paper={paper} paperId={paperId} onRefresh={load} />

      {/* Distribution plan */}
      {paper.distribution_plan && (
        <div className="card">
          <p className="section-title">📊 Distribution ({paper.distribution_mode})</p>
          <ul style={{ paddingLeft: 20, fontSize: '0.87rem', color: 'var(--ink-muted)' }}>
            {Object.entries(paper.distribution_plan).map(([cid, count]) => {
              const q = (paper.questions || []).find(x => x.chapter_id === cid)
              return (
                <li key={cid} style={{ padding: '3px 0' }}>
                  {q ? q.chapter_title : cid}: <strong>{count}</strong> question(s)
                </li>
              )
            })}
          </ul>
          {paper.distribution_feasible === false && (
            <p style={{ background: '#fef9c3', color: '#854d0e', padding: '8px 12px', borderRadius: 8, fontSize: '0.84rem', marginTop: 10 }}>
              ⚠️ With this many chapters and a {paper.pass_percentage}% pass mark, the paper couldn't guarantee every chapter its own full pass-floor — the split above is the closest even fallback.
            </p>
          )}
        </div>
      )}

      {/* Questions */}
      {hasQuestions && (
        <div>
          <p className="section-title">📝 Questions ({paper.questions.length})</p>
          {paper.questions.map((q, i) => (
            <QuestionCard key={q.id} q={q} index={i} onRefresh={load} />
          ))}
          {paper.chapter_ids?.length > 0 && (
            <ManualQuestionForm paperId={paperId} chapterIds={paper.chapter_ids} questions={paper.questions} onRefresh={load} />
          )}
        </div>
      )}

      {paper.status === 'generating' && (
        <EmptyState icon="⚡" title="Generating questions…">
          This may take a moment. The page will update automatically.
        </EmptyState>
      )}
    </div>
  )
}

/* ── Main QuestionPapers view ───────────────────────────── */
export default function QuestionPapers() {
  const { docs, load: loadDocs } = useDocuments({ readyOnly: true })
  const [papers, setPapers] = useState([])
  const [chapters, setChapters] = useState([])
  const [selectedDoc, setSelectedDoc] = useState('')
  const [selectedChapters, setSelectedChapters] = useState([])
  const [totalQ, setTotalQ] = useState(20)
  const [totalMarks, setTotalMarks] = useState('')
  const [duration, setDuration] = useState('')
  const [distribution, setDistribution] = useState('equal')
  const [passPercent, setPassPercent] = useState(40)
  const [difficulty, setDifficulty] = useState('balanced')
  const [generating, setGenerating] = useState(false)
  const [msg, setMsg] = useState('')
  const [viewingPaperId, setViewingPaperId] = useState(null)

  const loadPapers = useCallback(async () => {
    try {
      const { data } = await apiGet('/question-papers')
      if (Array.isArray(data)) setPapers(data)
    } catch { /* no backend */ }
  }, [])

  const loadAll = useCallback(async () => {
    await Promise.all([loadDocs(), loadPapers()])
  }, [loadDocs, loadPapers])

  useEffect(() => { loadAll() }, [loadAll])

  useEffect(() => {
    if (!selectedDoc) { setChapters([]); setSelectedChapters([]); return }
    apiGet(`/documents/${selectedDoc}/chapters`)
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : []
        setChapters(list)
        setSelectedChapters(list.map(c => c.id))
      })
      .catch(() => setChapters([]))
  }, [selectedDoc])

  // Auto-select first doc once loaded
  useEffect(() => {
    if (docs.length && !selectedDoc) setSelectedDoc(docs[0].id)
  }, [docs, selectedDoc])

  function toggleChapter(id) {
    setSelectedChapters(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function handleGenerate(e) {
    e.preventDefault()
    if (!selectedDoc) { setMsg('Pick a book first.'); return }
    if (!selectedChapters.length) { setMsg('Select at least one chapter.'); return }
    setGenerating(true); setMsg('Starting generation…')
    try {
      const { response, data } = await apiPost('/question-papers', {
        doc_id: selectedDoc,
        chapter_ids: selectedChapters,
        total_questions: Number(totalQ),
        total_marks: totalMarks ? Number(totalMarks) : null,
        duration_minutes: duration ? Number(duration) : null,
        distribution_mode: distribution,
        pass_percentage: Number(passPercent),
        difficulty,
      })
      if (!response.ok || !data) {
        setMsg(data?.detail || 'No backend connected — generation unavailable.')
        return
      }
      setMsg('⚡ Generating questions…')
      setViewingPaperId(data.id)
      loadAll()
    } catch (err) {
      setMsg('Request failed: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  if (viewingPaperId) return (
    <PaperDetail paperId={viewingPaperId} onBack={() => { setViewingPaperId(null); loadAll() }} />
  )

  return (
    <div className="stack">
      <div className="page-header">
        <div className="page-header-icon" style={{ background: '#ccfbf1' }}>📄</div>
        <div>
          <h2>Question Papers</h2>
          <p>Generate AI-powered question papers from your uploaded textbooks.</p>
        </div>
      </div>

      {/* Generation form */}
      <div className="card card-accent card-accent-teal">
        <p className="section-title">⚡ Generate a New Paper</p>
        <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-field">
            <label>Book</label>
            <select className="form-select" value={selectedDoc} onChange={e => setSelectedDoc(e.target.value)} required>
              {docs.length === 0
                ? <option value="">No ready books yet — upload one first</option>
                : docs.map(d => <option key={d.id} value={d.id}>{d.filename} ({d.standard || '—'}, {d.subject || '—'})</option>)
              }
            </select>
          </div>

          {chapters.length > 0 && (
            <div className="form-field">
              <label>Chapters to include</label>
              <div className="chapter-checkboxes">
                {chapters.map(c => (
                  <label key={c.id} className="chapter-checkbox">
                    <input type="checkbox" checked={selectedChapters.includes(c.id)} onChange={() => toggleChapter(c.id)} />
                    {c.chapter_number ? `Ch. ${c.chapter_number}: ` : ''}{c.title}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="row">
            <div className="form-field" style={{ flex: 1 }}>
              <label>Total questions</label>
              <input className="form-input" type="number" min={1} value={totalQ} onChange={e => setTotalQ(e.target.value)} required />
            </div>
            <div className="form-field" style={{ flex: 1 }}>
              <label>Total marks (optional)</label>
              <input className="form-input" type="number" min={1} placeholder="e.g. 20" value={totalMarks} onChange={e => setTotalMarks(e.target.value)} />
            </div>
            <div className="form-field" style={{ flex: 1 }}>
              <label>Duration in minutes (optional)</label>
              <input className="form-input" type="number" min={1} placeholder="e.g. 60" value={duration} onChange={e => setDuration(e.target.value)} />
            </div>
          </div>

          <div className="row">
            <div className="form-field" style={{ flex: 1 }}>
              <label>Difficulty</label>
              <select className="form-select" value={difficulty} onChange={e => setDifficulty(e.target.value)}>
                <option value="easy">Easy</option>
                <option value="balanced">Balanced</option>
                <option value="challenging">Challenging</option>
              </select>
            </div>
            <div className="form-field" style={{ flex: 1 }}>
              <label>Pass percentage</label>
              <input className="form-input" type="number" min={1} max={100} value={passPercent} onChange={e => setPassPercent(e.target.value)} required />
            </div>
          </div>

          <fieldset>
            <legend>Question distribution across chapters</legend>
            <label className="radio-label">
              <input type="radio" name="dist" value="equal" checked={distribution === 'equal'} onChange={() => setDistribution('equal')} />
              <div><strong>Equal</strong> — same number of questions from every selected chapter</div>
            </label>
            <label className="radio-label">
              <input type="radio" name="dist" value="random" checked={distribution === 'random'} onChange={() => setDistribution('random')} />
              <div><strong>Random</strong> — guarantees every chapter enough questions to reach the pass score, then splits the rest randomly</div>
            </label>
          </fieldset>

          <div className="row-center">
            <button type="submit" className="btn btn-teal" disabled={generating}>
              {generating ? '⏳ Generating…' : '⚡ Generate Questions'}
            </button>
            {msg && <span className="hint" style={{ fontWeight: 600 }}>{msg}</span>}
          </div>
        </form>
      </div>

      {/* Past papers */}
      <div>
        <div className="row-center" style={{ marginBottom: 12 }}>
          <p className="section-title" style={{ margin: 0 }}>📋 Past Question Papers</p>
          <button className="btn btn-gray btn-sm" onClick={loadAll}>↻ Refresh</button>
        </div>
        {papers.length === 0 ? (
          <EmptyState icon="📄" title="No papers yet">
            Generate one above and it'll appear here.
          </EmptyState>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Book</th>
                  <th>Questions</th>
                  <th>Pass %</th>
                  <th>Mode</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {papers.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.subject || '—'} / {p.standard || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{p.total_questions}</td>
                    <td style={{ textAlign: 'center' }}>{p.pass_percentage}%</td>
                    <td>{p.distribution_mode}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td>
                      <button className="btn btn-gray btn-sm" onClick={() => setViewingPaperId(p.id)}>
                        View →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
