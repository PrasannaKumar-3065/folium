import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

/* ─── Dashboard mockup visual ───────────────────────────── */
function DashboardMockup() {
  return (
    <div className="dashboard-mockup">
      <div className="mock-topbar">
        <div className="mock-dot" style={{ background: '#ef4444' }} />
        <div className="mock-dot" style={{ background: '#f59e0b' }} />
        <div className="mock-dot" style={{ background: '#22c55e' }} />
        <div className="mock-url">eduai.app/question-papers</div>
      </div>
      <div className="mock-nav">
        <div className="mock-nav-btn">Upload Books</div>
        <div className="mock-nav-btn">Ask AI Tutor</div>
        <div className="mock-nav-btn active">Question Papers</div>
        <div className="mock-nav-btn">Question Bank</div>
      </div>
      <div className="mock-body">
        <div className="mock-row">
          <div className="mock-card">
            <div className="mock-card-title">📚 Uploaded Book</div>
            <div className="mock-line" />
            <div className="mock-line short" />
            <div style={{ marginTop: 6 }}>
              <span className="mock-badge green">Ready</span>
            </div>
          </div>
          <div className="mock-card" style={{ flex: 1.5 }}>
            <div className="mock-card-title">📄 Generated Questions</div>
            <div className="mock-q">1. What is Newton's 2nd law?</div>
            <div className="mock-option">A. F = ma</div>
            <div className="mock-option correct">B. F = ma ✓</div>
            <div className="mock-option">C. p = mv</div>
            <div className="mock-option">D. E = mc²</div>
          </div>
        </div>
        <div className="mock-card">
          <div className="mock-card-title">📤 PDF Preview — Student Copy + Answer Key</div>
          <div className="mock-row" style={{ gap: 8, marginTop: 6 }}>
            <div style={{ flex: 1 }}>
              <div className="mock-line" />
              <div className="mock-line short" />
              <div className="mock-line xs" />
            </div>
            <div style={{ flex: 1 }}>
              <div className="mock-line" />
              <div className="mock-line xs" />
              <div className="mock-line short" />
            </div>
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            <span className="mock-badge blue">Download PDF</span>
            <span className="mock-badge green">Answer Key</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── FAQ item ──────────────────────────────────────────── */
function FaqItem({ question, answer }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="faq-item">
      <button className="faq-q" onClick={() => setOpen(o => !o)}>
        {question}
        <span className={`faq-icon ${open ? 'open' : ''}`}>+</span>
      </button>
      {open && <div className="faq-a">{answer}</div>}
    </div>
  )
}

/* ─── Main Landing page ─────────────────────────────────── */
export default function Landing() {
  const navigate = useNavigate()

  return (
    <div>
      {/* ── Sticky Nav ── */}
      <nav className="land-nav">
        <div className="land-nav-inner">
          <a href="#" className="land-logo">📚 EduAI</a>
          <ul className="land-nav-links">
            <li><a href="#how-it-works">How it works</a></li>
            <li><a href="#features">Features</a></li>
            <li><a href="#pricing">Pricing</a></li>
            <li><a href="#faq">FAQ</a></li>
          </ul>
          <div className="land-nav-actions">
            <button
              className="btn btn-outline btn-sm"
              onClick={() => navigate('/app')}
            >
              Sign In
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => navigate('/app')}
            >
              Start Free
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-inner">
          <div>
            <span className="hero-eyebrow">🏫 Built for Teachers</span>
            <h1 className="hero-title">
              Create Syllabus-Aligned Question Papers in{' '}
              <span>Minutes, Not Hours.</span>
            </h1>
            <p className="hero-subtitle">
              Upload your textbooks once. EduAI understands your syllabus,
              generates AI-powered question papers, builds your personal
              question bank, and exports print-ready PDFs—all with complete
              teacher control.
            </p>
            <div className="hero-ctas">
              <button
                className="btn btn-primary"
                style={{ padding: '12px 26px', fontSize: '0.95rem' }}
                onClick={() => navigate('/app')}
              >
                🟦 Start Free
              </button>
              <a
                href="#how-it-works"
                className="btn btn-outline"
                style={{ padding: '12px 26px', fontSize: '0.95rem' }}
              >
                ▶ Watch Demo
              </a>
            </div>
            <p className="hero-trust">
              ✓ No credit card required &nbsp;·&nbsp; ✓ Free plan included
            </p>
          </div>
          <DashboardMockup />
        </div>
      </section>

      {/* ── Trusted By ── */}
      <div className="trusted-bar">
        🏫&nbsp; Built for CBSE, State Board &amp; Higher Secondary Teachers
      </div>

      {/* ── How It Works ── */}
      <section id="how-it-works" style={{ background: '#fff' }}>
        <div className="land-section">
          <span className="section-eyebrow">Simple 3-step workflow</span>
          <h2 className="section-heading">How It Works</h2>
          <p className="section-sub">
            From raw textbook PDF to a professional question paper in minutes.
          </p>
          <div className="steps">
            <div className="step-card">
              <div className="step-icon" style={{ background: '#eff6ff' }}>📤</div>
              <p className="step-num">Step 1</p>
              <h3 className="step-title">Upload</h3>
              <p className="step-desc">
                Upload one or more PDF textbooks. EduAI accepts any standard
                school or college textbook PDF.
              </p>
            </div>
            <div className="step-card">
              <div className="step-icon" style={{ background: '#f0fdf4' }}>🤖</div>
              <p className="step-num">Step 2</p>
              <h3 className="step-title">AI Understands</h3>
              <p className="step-desc">
                EduAI automatically detects chapters, indexes your books, and
                prepares them for AI-powered retrieval.
              </p>
            </div>
            <div className="step-card">
              <div className="step-icon" style={{ background: '#fdf4ff' }}>📄</div>
              <p className="step-num">Step 3</p>
              <h3 className="step-title">Generate &amp; Export</h3>
              <p className="step-desc">
                Create question papers, review every question, export to PDF,
                and grow your reusable Question Bank.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" style={{ background: 'var(--gray-50)' }}>
        <div className="land-section">
          <span className="section-eyebrow">Everything you need</span>
          <h2 className="section-heading">Powerful Features</h2>
          <p className="section-sub">
            A complete toolkit for modern teachers — from upload to export.
          </p>
          <div className="features-grid">
            <div className="feature-card">
              <span className="feature-icon">📚</span>
              <h3 className="feature-title">Smart Textbook Processing</h3>
              <ul className="feature-list">
                <li>PDF Upload</li>
                <li>OCR Support</li>
                <li>Chapter Detection</li>
                <li>Vector Search</li>
              </ul>
            </div>
            <div className="feature-card">
              <span className="feature-icon">🤖</span>
              <h3 className="feature-title">AI Question Generator</h3>
              <ul className="feature-list">
                <li>MCQs</li>
                <li>Short Answers</li>
                <li>Long Answers</li>
                <li>Difficulty Levels</li>
              </ul>
            </div>
            <div className="feature-card">
              <span className="feature-icon">✍️</span>
              <h3 className="feature-title">Teacher Review</h3>
              <ul className="feature-list">
                <li>Accept questions</li>
                <li>Edit any question</li>
                <li>Regenerate with AI</li>
                <li>Delete &amp; reorder</li>
              </ul>
              <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: 10 }}>
                Teachers always stay in control.
              </p>
            </div>
            <div className="feature-card">
              <span className="feature-icon">🗂️</span>
              <h3 className="feature-title">Question Bank</h3>
              <ul className="feature-list">
                <li>Every approved question saved</li>
                <li>Search by Chapter</li>
                <li>Filter by Subject</li>
                <li>Filter by Difficulty</li>
              </ul>
            </div>
            <div className="feature-card">
              <span className="feature-icon">📄</span>
              <h3 className="feature-title">Professional Export</h3>
              <ul className="feature-list">
                <li>Student Copy PDF</li>
                <li>Teacher Answer Key PDF</li>
                <li>Custom header &amp; footer</li>
                <li>Ready for printing</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why Teachers Love EduAI ── */}
      <section className="ba-section">
        <div className="land-section">
          <span className="section-eyebrow">Transformation</span>
          <h2 className="section-heading">Why Teachers Love EduAI</h2>
          <p className="section-sub">See the difference EduAI makes in your exam preparation workflow.</p>
          <table className="ba-table">
            <thead>
              <tr>
                <th>😓 Before EduAI</th>
                <th>🎉 After EduAI</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Search textbooks manually</td>
                <td>AI finds relevant content instantly</td>
              </tr>
              <tr>
                <td>Spend hours creating papers</td>
                <td>Generate in minutes</td>
              </tr>
              <tr>
                <td>Recreate questions every exam</td>
                <td>Reuse from your Question Bank</td>
              </tr>
              <tr>
                <td>Different formats every time</td>
                <td>Professional, consistent PDFs</td>
              </tr>
              <tr>
                <td>No control over AI output</td>
                <td>Review, edit, or regenerate every question</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Demo (workflow visual) ── */}
      <section id="demo" style={{ background: '#fff' }}>
        <div className="land-section-sm" style={{ textAlign: 'center' }}>
          <span className="section-eyebrow">See it in action</span>
          <h2 className="section-heading">Simple 2-Minute Workflow</h2>
          <p className="section-sub">
            From PDF to print-ready exam paper in four simple steps.
          </p>
          <div style={{
            display: 'flex', gap: 0, justifyContent: 'center',
            flexWrap: 'wrap', maxWidth: 700, margin: '0 auto'
          }}>
            {[
              { icon: '📤', label: 'Upload PDF' },
              { icon: '→', label: '' },
              { icon: '⚡', label: 'Generate' },
              { icon: '→', label: '' },
              { icon: '✏️', label: 'Edit & Review' },
              { icon: '→', label: '' },
              { icon: '📄', label: 'Export PDF' },
            ].map((item, i) => (
              item.label ? (
                <div key={i} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '16px 20px', gap: 8
                }}>
                  <div style={{
                    width: 60, height: 60, borderRadius: '50%',
                    background: 'var(--blue-light)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.4rem', border: '2px solid var(--blue)',
                  }}>{item.icon}</div>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--gray-700)' }}>
                    {item.label}
                  </span>
                </div>
              ) : (
                <div key={i} style={{
                  fontSize: '1.4rem', color: 'var(--gray-300)',
                  display: 'flex', alignItems: 'center', paddingBottom: 24
                }}>→</div>
              )
            ))}
          </div>
          <button
            className="btn btn-primary"
            style={{ marginTop: 24, padding: '12px 28px' }}
            onClick={() => navigate('/app')}
          >
            Try It Now — Free
          </button>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" style={{ background: 'var(--gray-50)' }}>
        <div className="land-section">
          <span className="section-eyebrow">Simple pricing</span>
          <h2 className="section-heading">Choose Your Plan</h2>
          <p className="section-sub">Start free, upgrade when you're ready.</p>
          <div className="pricing-grid">
            {/* Free */}
            <div className="plan-card">
              <p className="plan-name">Free</p>
              <div className="plan-price">₹0<span>/month</span></div>
              <p className="plan-tagline">Perfect to get started</p>
              <ul className="plan-features">
                {['1 Book', '5 AI generations/month', 'Basic Question Bank', 'PDF Export'].map(f => (
                  <li key={f}><span className="check">✓</span>{f}</li>
                ))}
              </ul>
              <button
                className="btn btn-outline"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => navigate('/app')}
              >
                Start Free
              </button>
            </div>

            {/* Pro */}
            <div className="plan-card featured">
              <div className="plan-badge">Most Popular ⭐</div>
              <p className="plan-name">Pro</p>
              <div className="plan-price">₹399<span>/month</span></div>
              <p className="plan-tagline">For Individual Teachers</p>
              <ul className="plan-features">
                {[
                  'Unlimited Books',
                  'Unlimited AI Papers',
                  'Unlimited Question Bank',
                  'AI Tutor',
                  'Priority Processing',
                  'All Export Options',
                ].map(f => (
                  <li key={f}><span className="check">✓</span>{f}</li>
                ))}
              </ul>
              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => navigate('/app')}
              >
                Start 14-Day Trial
              </button>
            </div>

            {/* Institution */}
            <div className="plan-card">
              <p className="plan-name">Institution</p>
              <div className="plan-price" style={{ fontSize: '1.5rem' }}>Custom</div>
              <p className="plan-tagline">For schools &amp; colleges</p>
              <ul className="plan-features">
                {[
                  'Multiple Teachers',
                  'Shared Question Bank',
                  'Admin Dashboard',
                  'Centralized Library',
                  'Priority Support',
                ].map(f => (
                  <li key={f}><span className="check">✓</span>{f}</li>
                ))}
              </ul>
              <button
                className="btn btn-outline"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => navigate('/app')}
              >
                Contact Sales
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" style={{ background: '#fff' }}>
        <div className="land-section">
          <span className="section-eyebrow">Got questions?</span>
          <h2 className="section-heading">Frequently Asked Questions</h2>
          <p className="section-sub">Everything you need to know before you start.</p>
          <div className="faq-list">
            {[
              {
                question: 'Can I upload my own books?',
                answer: 'Yes! EduAI supports any standard PDF textbook. Simply upload your PDF and EduAI will automatically detect chapters and index the content for question generation.',
              },
              {
                question: 'Does it support CBSE?',
                answer: 'Absolutely. EduAI is optimized for CBSE syllabus books, including NCERT textbooks across all subjects and grades.',
              },
              {
                question: 'Does it work for State Board?',
                answer: 'Yes. EduAI works with any PDF textbook regardless of the board — CBSE, ICSE, State Boards, and Higher Secondary curriculum.',
              },
              {
                question: 'Can I edit AI-generated questions?',
                answer: 'Absolutely. You have full control — accept, edit, regenerate, or delete any question. The AI suggests; you decide. Nothing goes into your paper without your review.',
              },
              {
                question: 'Does AI use only my uploaded books?',
                answer: 'Yes. The AI Tutor and question generator use retrieval from your uploaded textbooks as context. Answers and questions are grounded in your syllabus content.',
              },
              {
                question: 'Can I export to PDF?',
                answer: 'Yes. Every question paper can be exported as a student copy PDF and a separate teacher answer-key PDF, ready to print.',
              },
            ].map(item => (
              <FaqItem key={item.question} {...item} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="final-cta">
        <h2>Ready to save hours every exam?</h2>
        <p>
          Start creating high-quality, syllabus-aligned question papers with
          EduAI today.
        </p>
        <div className="ctas">
          <button
            className="btn btn-outline-white"
            style={{ padding: '13px 28px', fontSize: '0.95rem' }}
            onClick={() => navigate('/app')}
          >
            🟦 Start Free
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="logo">📚 EduAI</div>
            <p>Syllabus-aligned question papers for modern teachers.</p>
          </div>
          <div className="footer-col">
            <h4>Product</h4>
            <ul>
              <li><a href="#features">Features</a></li>
              <li><a href="#pricing">Pricing</a></li>
              <li><a href="#faq">FAQ</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Company</h4>
            <ul>
              <li><a href="#">Contact</a></li>
              <li><a href="#">Privacy</a></li>
              <li><a href="#">Terms</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 EduAI. All rights reserved.</span>
          <span>Made with ❤️ for teachers</span>
        </div>
      </footer>
    </div>
  )
}
