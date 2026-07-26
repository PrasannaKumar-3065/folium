/**
 * StatusBadge — shows a coloured pill for document / paper status values.
 * Extracted here so Upload.jsx and QuestionPapers.jsx share one definition.
 */
const STATUS_CLASS = {
  ready:      'badge-ready',
  processing: 'badge-processing',
  pending:    'badge-processing',
  failed:     'badge-failed',
  generating: 'badge-generating',
  done:       'badge-done',
}

export default function StatusBadge({ status }) {
  const cls = STATUS_CLASS[status] ?? 'badge-processing'
  return <span className={`badge ${cls}`}>{status}</span>
}
