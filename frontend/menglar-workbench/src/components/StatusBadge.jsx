export function StatusBadge({ status }) {
  const cls =
    status === 'success' ? 'is-success' :
    status === 'failed' ? 'is-failed' :
    'is-neutral';

  return <span className={`wb-badge ${cls}`}>{status || '-'}</span>;
}
