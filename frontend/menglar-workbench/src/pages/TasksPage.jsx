import { useQuery } from '@tanstack/react-query';
import { Panel } from '../components/Panel';
import { StatusBadge } from '../components/StatusBadge';
import { fetchJobs } from '../lib/api';
import { formatNumber, formatText } from '../lib/format';

export function TasksPage() {
  const jobsQuery = useQuery({
    queryKey: ['jobs'],
    queryFn: fetchJobs,
    refetchInterval: 15000,
  });

  const jobs = jobsQuery.data?.jobs || [];

  return (
    <div className="wb-page">
      <div className="wb-page-hero">
        <div>
          <p className="wb-kicker">Task Center</p>
          <h2>采集任务页</h2>
          <p>这个页面只处理抓取任务本身：任务状态、开始结束时间、入库数量和失败原因。</p>
        </div>
      </div>

      <Panel
        title="任务列表"
        subtitle="最近 20 条任务记录"
        actions={<button className="wb-button ghost" onClick={() => jobsQuery.refetch()}>刷新</button>}
      >
        <div className="wb-table-wrap">
          <table className="wb-table">
            <thead>
              <tr>
                <th>任务ID</th>
                <th>页面</th>
                <th>状态</th>
                <th>开始时间</th>
                <th>结束时间</th>
                <th>原始 / 标准化</th>
                <th>警告数</th>
                <th>错误信息</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length ? jobs.map((job) => (
                <tr key={job.id}>
                  <td className="mono">#{job.id}</td>
                  <td>
                    <div className="cell-main">{formatText(job.page_name)}</div>
                    <div className="cell-sub">{formatText(job.page_type)}</div>
                  </td>
                  <td><StatusBadge status={job.job_status} /></td>
                  <td className="mono">{formatText(job.started_at)}</td>
                  <td className="mono">{formatText(job.finished_at)}</td>
                  <td>{formatNumber(job.raw_count)} / {formatNumber(job.normalized_count)}</td>
                  <td>{formatNumber(job.warning_count)}</td>
                  <td className="cell-sub">{formatText(job.error_message)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="8" className="wb-empty-cell">暂无任务数据</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
