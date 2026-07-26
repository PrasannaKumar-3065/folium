import { useState, useRef, useEffect } from 'react'
import { apiPost } from '../../lib/api.js'
import MarkdownRenderer from '../shared/MarkdownRenderer.jsx'

/* ── Animated thinking indicator ───────────────────────── */
function ThinkingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', padding: '2px 0' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 8, height: 8, borderRadius: '50%',
          background: 'var(--amber)',
          animation: `blink 1.2s ${i * 0.22}s ease-in-out infinite`,
        }} />
      ))}
      <style>{`@keyframes blink{0%,80%,100%{opacity:.25;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}`}</style>
    </span>
  )
}

/* ── Welcome message shown on first load ─────────────────── */
const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  content: [
    '## 👋 Hello, Teacher!',
    '',
    "I'm your **AI Tutor**, powered by the textbooks you've uploaded.",
    '',
    "Ask me anything from your syllabus and I'll answer using content from your books. I support:",
    '- 📝 **Markdown** formatting — bold, lists, tables, code blocks',
    '- 🔢 **Math equations** — inline like $E = mc^2$ and display blocks:',
    '$$\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}$$',
    '',
    'Upload some PDFs first, then ask away!',
  ].join('\n'),
}

/* ── Main AskAI component ───────────────────────────────── */
export default function AskAI() {
  const [messages, setMessages] = useState([WELCOME_MESSAGE])
  const [question, setQuestion] = useState('')
  const [standard, setStandard] = useState('')
  const [subject, setSubject] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function autoResize() {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'
  }

  async function handleSubmit(e) {
    e?.preventDefault()
    const q = question.trim()
    if (!q || loading) return

    const userMsg     = { id: Date.now(),     role: 'user',      content: q }
    const thinkingMsg = { id: Date.now() + 1, role: 'assistant', content: null, thinking: true }
    setMessages(prev => [...prev, userMsg, thinkingMsg])
    setQuestion('')
    if (textareaRef.current) textareaRef.current.style.height = '42px'
    setLoading(true)

    try {
      const { response, data } = await apiPost('/ask', {
        question: q,
        standard: standard.trim() || null,
        subject:  subject.trim()   || null,
      })

      const answer = (response.ok && data?.answer)
        ? data.answer
        : (data?.detail || '⚠️ No backend connected yet — once the API server is running, answers will appear here.')

      setMessages(prev => prev.map(m =>
        m.thinking ? { id: m.id, role: 'assistant', content: answer, sources: data?.sources } : m
      ))
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.thinking ? { id: m.id, role: 'assistant', content: '⚠️ Request failed: ' + err.message } : m
      ))
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div className="page-header-icon" style={{ background: '#ede9fe' }}>🤖</div>
        <div>
          <h2>Ask the AI Tutor</h2>
          <p>Answers grounded in your uploaded textbooks. Supports Markdown &amp; LaTeX math.</p>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', borderTop: '4px solid var(--purple)' }}>
        <div className="chat-container">
          <div className="chat-messages">
            {messages.map(msg => (
              <div key={msg.id} className={`chat-message ${msg.role}`}>
                <div className={`chat-avatar ${msg.role}`}>
                  {msg.role === 'user' ? 'T' : '🤖'}
                </div>
                <div className={`chat-bubble ${msg.role}`}>
                  {msg.thinking ? (
                    <ThinkingDots />
                  ) : msg.role === 'assistant' ? (
                    <>
                      <MarkdownRenderer>{msg.content}</MarkdownRenderer>
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="chat-sources">
                          <strong>📖 Sources:</strong>
                          <ul>
                            {msg.sources.map((s, i) => (
                              <li key={i}>
                                {s.filename}
                                {s.chapter ? `, ${s.chapter}` : ''}
                                {s.page    ? `, page ${s.page}` : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-bar">
            <div className="chat-filters">
              <input placeholder="Standard (e.g. Std 11)" value={standard} onChange={e => setStandard(e.target.value)} />
              <input placeholder="Subject (e.g. Physics)"  value={subject}  onChange={e => setSubject(e.target.value)}  />
            </div>
            <div className="chat-input-row">
              <textarea
                ref={textareaRef}
                rows={1}
                placeholder="Ask a question from your textbook… (Shift+Enter for new line)"
                value={question}
                onChange={e => { setQuestion(e.target.value); autoResize() }}
                onKeyDown={handleKeyDown}
                disabled={loading}
              />
              <button
                className="btn btn-purple"
                onClick={handleSubmit}
                disabled={loading || !question.trim()}
                style={{ flexShrink: 0, borderRadius: 20 }}
              >
                {loading ? '…' : '↑ Ask'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
