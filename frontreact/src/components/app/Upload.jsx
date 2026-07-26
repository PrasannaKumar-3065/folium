import { useState, useEffect } from 'react'
import { apiGet, apiUpload, apiDelete } from '../../lib/api.js'
import { useDocuments } from '../../hooks/useDocuments.js'
import StatusBadge from '../shared/StatusBadge.jsx'
import EmptyState from '../shared/EmptyState.jsx'

/* ── Chapter detail row (lazy-loaded on expand) ─────────── */
function ChaptersRow({ docId, colSpan }) {
  const [chapters, setChapters] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiGet(`/documents/${docId}/chapters`)
      .then(({ data }) => { setChapters(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => { setChapters([]); setLoading(false) })
  }, [docId])

  return (
    <tr className="chapters-detail-row">
      <td colSpan={colSpan} style={{ padding: '6px 14px 14px' }}>
        {loading ? (
          <span className="hint">Loading chapters…</span>
        ) : chapters && chapters.length ? (
          <ul className="chapters-list">
            {chapters.map(c => (
              <li key={c.id}>
                {c.chapter_number ? `Ch. ${c.chapter_number}: ` : ''}{c.title}
                <span className="chapter-pages"> (p. {c.start_page}–{c.end_page})</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="hint">No chapter detail available.</span>
        )}
      </td>
    </tr>
  )
}

/* ── Single document row ────────────────────────────────── */
function DocRow({ doc, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const hasChapters = doc.status === 'ready' && doc.chapter_count > 0

  return (
    <>
      <tr>
        <td style={{ fontWeight: 600, color: 'var(--ink)' }}>{doc.filename}</td>
        <td>{doc.standard || '—'}</td>
        <td>{doc.subject || '—'}</td>
        <td>
          <StatusBadge status={doc.status} />
          {doc.error_message && <div className="error-text">{doc.error_message}</div>}
        </td>
        <td style={{ textAlign: 'center' }}>{doc.chunk_count ?? '—'}</td>
        <td style={{ textAlign: 'center' }}>{doc.page_count ?? '—'}</td>
        <td style={{ textAlign: 'center' }}>
          {hasChapters ? (
            <button
              className="btn btn-outline btn-sm"
              style={{ borderRadius: 20, padding: '2px 12px', fontSize: '0.78rem' }}
              onClick={() => setExpanded(e => !e)}
            >
              {expanded ? '▲' : '▼'} {doc.chapter_count}
            </button>
          ) : (doc.chapter_count ?? '—')}
        </td>
        <td>
          <button className="btn btn-danger btn-sm" onClick={() => onDelete(doc.id)}>
            🗑 Delete
          </button>
        </td>
      </tr>
      {expanded && hasChapters && <ChaptersRow docId={doc.id} colSpan={8} />}
    </>
  )
}

/* ── Main Upload component ──────────────────────────────── */
export default function Upload() {
  const { docs, load: loadDocs } = useDocuments()
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [msgType, setMsgType] = useState('') // 'ok' | 'err'
  const [standard, setStandard] = useState('')
  const [subject, setSubject] = useState('')
  const [files, setFiles] = useState(null)

  useEffect(() => {
    loadDocs()
  }, [loadDocs])

  async function handleUpload(e) {
    e.preventDefault()
    if (!files || !files.length) return
    const fd = new FormData()
    for (const f of files) fd.append('files', f)
    if (standard.trim()) fd.append('standard', standard.trim())
    if (subject.trim()) fd.append('subject', subject.trim())

    setUploading(true)
    setMessage('Uploading…')
    setMsgType('')
    try {
      const { response, data } = await apiUpload('/documents/upload', fd)
      if (!response.ok || !data) {
        setMessage(data?.detail || 'Upload failed — no backend connected.')
        setMsgType('err')
        return
      }
      const results = data.results || []
      const errors = results.filter(x => x.error)
      const ok = results.length - errors.length
      setMessage(
        errors.length
          ? `${ok} file(s) queued. ${errors.length} rejected: ${errors.map(x => `${x.filename} (${x.error})`).join('; ')}`
          : `✓ ${ok} file(s) queued for processing — check status below.`
      )
      setMsgType(errors.length ? 'err' : 'ok')
      setFiles(null); setStandard(''); setSubject('')
      e.target.reset()
      loadDocs()
    } catch (err) {
      setMessage('Upload failed: ' + err.message)
      setMsgType('err')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this document and all its indexed content? This cannot be undone.')) return
    try { await apiDelete(`/documents/${id}`) } finally { loadDocs() }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div className="page-header-icon" style={{ background: '#dbeafe' }}>📤</div>
        <div>
          <h2>Upload Textbooks</h2>
          <p>Upload PDF textbooks and EduAI will automatically detect chapters and index content.</p>
        </div>
      </div>

      {/* Upload form */}
      <div className="card card-accent">
        <p className="section-title">📁 Add New Book</p>
        <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-field">
            <label>PDF file(s)</label>
            <input
              type="file"
              accept="application/pdf"
              multiple
              required
              className="form-input"
              onChange={e => setFiles(e.target.files)}
            />
          </div>
          <div className="row">
            <div className="form-field" style={{ flex: 1 }}>
              <label>Standard (optional)</label>
              <input className="form-input" placeholder="e.g. Std 11" value={standard} onChange={e => setStandard(e.target.value)} />
            </div>
            <div className="form-field" style={{ flex: 1 }}>
              <label>Subject (optional)</label>
              <input className="form-input" placeholder="e.g. Physics" value={subject} onChange={e => setSubject(e.target.value)} />
            </div>
          </div>
          <div className="row-center">
            <button type="submit" className="btn btn-primary" disabled={uploading}>
              {uploading ? '⏳ Uploading…' : '📤 Upload'}
            </button>
            {message && (
              <span style={{
                fontSize: '0.84rem',
                color: msgType === 'err' ? 'var(--red)' : 'var(--green)',
                fontWeight: 600,
              }}>
                {message}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Documents list */}
      <div>
        <div className="row-center" style={{ marginBottom: 12 }}>
          <p className="section-title" style={{ margin: 0 }}>📚 Uploaded Books</p>
          <button className="btn btn-gray btn-sm" onClick={loadDocs}>↻ Refresh</button>
        </div>
        {docs.length === 0 ? (
          <EmptyState icon="📚" title="No books yet">
            Upload a PDF textbook above to get started.
          </EmptyState>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Standard</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Chunks</th>
                  <th style={{ textAlign: 'center' }}>Pages</th>
                  <th style={{ textAlign: 'center' }}>Chapters</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {docs.map(doc => (
                  <DocRow key={doc.id} doc={doc} onDelete={handleDelete} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
