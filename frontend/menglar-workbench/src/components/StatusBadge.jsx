const STATUS_LABELS = {
  success: '成功',
  failed: '失败',
  running: '运行中',
};

export function StatusBadge({ status }) {
  const cls =
    status === 'success' ? 'is-success' :
    status === 'failed' ? 'is-failed' :
    'is-neutral';

  return <span className={`wb-badge ${cls}`}>{STATUS_LABELS[status] || status || '-'}</span>;
}
