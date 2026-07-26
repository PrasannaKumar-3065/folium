export default function AppNav({ tabs, active, onSwitch }) {
  return (
    <nav className="app-nav">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`app-nav-btn ${active === tab.id ? 'active' : ''}`}
          data-tab={tab.id}
          onClick={() => onSwitch(tab.id)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
