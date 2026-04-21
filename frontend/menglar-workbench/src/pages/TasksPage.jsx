import { useQuery } from '@tanstack/react-query';
import { Fragment, useMemo, useState } from 'react';
import { Panel } from '../components/Panel';
import { StatusBadge } from '../components/StatusBadge';
import { fetchJobs } from '../lib/api';
import { formatNumber, formatText } from '../lib/format';

const TASK_TYPE_LABELS = {
  industry_general: '行业数据',
  hot_products: '热销商品',
};

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'running', label: '运行中' },
  { key: 'success', label: '成功' },
  { key: 'failed', label: '失败' },
];

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return formatText(value);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatTaskType(type) {
  return TASK_TYPE_LABELS[type] || formatText(type);
}

function getDuration(startedAt, finishedAt) {
  if (!startedAt || !finishedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '-';
  const totalSeconds = Math.round((end - start) / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function getErrorSummary(errorMessage) {
  if (!errorMessage) return '-';
  const compact = String(errorMessage).replace(/\s+/g, ' ').trim();
  if (!compact) return '-';
  return compact.length > 96 ? `${compact.slice(0, 96)}...` : compact;
}

export function TasksPage() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [expandedJobId, setExpandedJobId] = useState(null);

  const jobsQuery = useQuery({
    queryKey: ['jobs'],
    queryFn: fetchJobs,
    refetchInterval: 15000,
  });

  const jobs = jobsQuery.data?.jobs || [];
  const filteredJobs = useMemo(() => {
    if (activeFilter === 'all') return jobs;
    return jobs.filter((job) => job.job_status === activeFilter);
  }, [activeFilter, jobs]);
  const summary = useMemo(() => {
    const initial = {
      total: jobs.length,
      running: 0,
      success: 0,
      failed: 0,
      warning: 0,
    };
    return jobs.reduce((acc, job) => {
      if (job.job_status === 'running') acc.running += 1;
      if (job.job_status === 'success') acc.success += 1;
      if (job.job_status === 'failed') acc.failed += 1;
      acc.warning += Number(job.warning_count || 0);
      return acc;
    }, initial);
  }, [jobs]);

  const copyError = async (message) => {
    if (!message || !navigator.clipboard) return;
    await navigator.clipboard.writeText(message);
  };

  return (
    <div className="wb-page">
      <div className="wb-page-hero">
        <div>
          <p className="wb-kicker">Task Center</p>
          <h2>采集任务页</h2>
          <p>这个页面只处理抓取任务本身：任务状态、开始结束时间、入库数量和失败原因。</p>
        </div>
      </div>

      <div className="task-summary-grid">
        <div className="task-summary-card">
          <span>最近任务</span>
          <strong>{formatNumber(summary.total)}</strong>
        </div>
        <div className="task-summary-card">
          <span>运行中</span>
          <strong>{formatNumber(summary.running)}</strong>
        </div>
        <div className="task-summary-card is-good">
          <span>成功</span>
          <strong>{formatNumber(summary.success)}</strong>
        </div>
        <div className="task-summary-card is-danger">
          <span>失败</span>
          <strong>{formatNumber(summary.failed)}</strong>
        </div>
      </div>

      <Panel
        title="任务列表"
        subtitle="最近 20 条任务记录，长错误默认收起"
        actions={
          <div className="wb-inline-actions wb-wrap-actions">
            <div className="task-filter-tabs" aria-label="任务状态筛选">
              {FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  className={activeFilter === filter.key ? 'is-active' : ''}
                  onClick={() => setActiveFilter(filter.key)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <button className="wb-button ghost" onClick={() => jobsQuery.refetch()}>刷新</button>
          </div>
        }
      >
        {jobsQuery.isError ? (
          <div className="wb-feedback is-error">任务列表读取失败：{jobsQuery.error.message}</div>
        ) : null}

        <div className="wb-table-wrap task-table-wrap">
          <table className="wb-table task-table">
            <thead>
              <tr>
                <th>任务ID</th>
                <th>任务</th>
                <th>状态</th>
                <th>时间</th>
                <th>入库</th>
                <th>错误信息</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.length ? filteredJobs.map((job) => (
                <Fragment key={job.id}>
                  <tr>
                    <td className="mono task-id">#{job.id}</td>
                    <td>
                      <div className="cell-main">{formatText(job.page_name)}</div>
                      <div className="task-type-line">
                        <span className="wb-pill">{formatTaskType(job.page_type)}</span>
                        <span className="cell-sub">{formatText(job.page_type)}</span>
                      </div>
                    </td>
                    <td><StatusBadge status={job.job_status} /></td>
                    <td className="task-time-cell">
                      <div className="mono">{formatDateTime(job.started_at)}</div>
                      <div className="cell-sub">结束：{formatDateTime(job.finished_at)}</div>
                      <div className="cell-sub">耗时：{getDuration(job.started_at, job.finished_at)}</div>
                    </td>
                    <td>
                      <div className="cell-main">{formatNumber(job.raw_count)} / {formatNumber(job.normalized_count)}</div>
                      <div className="cell-sub">警告 {formatNumber(job.warning_count)}</div>
                    </td>
                    <td className={job.error_message ? 'task-error-summary is-error' : 'task-error-summary'}>
                      {getErrorSummary(job.error_message)}
                    </td>
                    <td>
                      <div className="task-row-actions">
                        {job.error_message ? (
                          <button
                            type="button"
                            className="wb-button ghost"
                            onClick={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
                          >
                            {expandedJobId === job.id ? '收起' : '详情'}
                          </button>
                        ) : null}
                        {job.error_message ? (
                          <button
                            type="button"
                            className="wb-button ghost"
                            onClick={() => copyError(job.error_message)}
                          >
                            复制
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {expandedJobId === job.id ? (
                    <tr key={`${job.id}-details`} className="task-detail-row">
                      <td colSpan="7">
                        <div className="task-detail-card">
                          <div>
                            <span>页面地址</span>
                            <p className="mono">{formatText(job.page_url)}</p>
                          </div>
                          <div>
                            <span>错误详情</span>
                            <pre>{formatText(job.error_message)}</pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )) : (
                <tr>
                  <td colSpan="7" className="wb-empty-cell">
                    {jobs.length ? '当前筛选下没有任务' : '暂无任务数据'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
