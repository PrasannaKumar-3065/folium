/**
 * EmptyState — a centred placeholder shown when a list has no items.
 *
 * Usage:
 *   <EmptyState icon="📚" title="No books yet">
 *     Upload a PDF textbook above to get started.
 *   </EmptyState>
 */
export default function EmptyState({ icon, title, children }) {
  return (
    <div className="empty-state">
      {icon && <span className="icon">{icon}</span>}
      {title && <strong>{title}</strong>}
      {children}
    </div>
  )
}
