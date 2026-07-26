import { Link, useNavigate, useLocation } from 'react-router-dom'
import AppNav from '../components/app/AppNav.jsx'
import Upload from '../components/app/Upload.jsx'
import AskAI from '../components/app/AskAI.jsx'
import QuestionPapers from '../components/app/QuestionPapers.jsx'
import QuestionBank from '../components/app/QuestionBank.jsx'

const TABS = [
  { id: 'upload', label: '📤 Upload Books',    path: '/app/upload' },
  { id: 'ask',    label: '🤖 Ask AI Tutor',    path: '/app/ask' },
  { id: 'papers', label: '📄 Question Papers', path: '/app/papers' },
  { id: 'bank',   label: '🗂️ Question Bank',   path: '/app/bank' },
]

function activeTabFromPath(pathname) {
  if (pathname.startsWith('/app/ask'))    return 'ask'
  if (pathname.startsWith('/app/papers')) return 'papers'
  if (pathname.startsWith('/app/bank'))   return 'bank'
  return 'upload'
}

export default function AppPage() {
  const navigate  = useNavigate()
  const { pathname } = useLocation()
  const activeTab = activeTabFromPath(pathname)

  function handleSwitch(tabId) {
    const tab = TABS.find(t => t.id === tabId)
    if (tab) navigate(tab.path)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="app-logo">📚 EduAI</Link>
        <AppNav tabs={TABS} active={activeTab} onSwitch={handleSwitch} />
      </header>
      <main className="app-content">
        {activeTab === 'upload' && <Upload />}
        {activeTab === 'ask'    && <AskAI />}
        {activeTab === 'papers' && <QuestionPapers />}
        {activeTab === 'bank'   && <QuestionBank />}
      </main>
    </div>
  )
}
