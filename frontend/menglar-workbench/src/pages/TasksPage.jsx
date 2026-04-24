import { useMutation, useQuery } from '@tanstack/react-query';
import { Fragment, useMemo, useState } from 'react';
import { Panel } from '../components/Panel';
import { StatusBadge } from '../components/StatusBadge';
import { checkMenglarLoginHealth, fetchJobs } from '../lib/api';
import { formatNumber, formatText } from '../lib/format';

const TASK_TYPE_LABELS = {
  industry_general: '行业数据',
  hot_products: '热销商品',
};

const ERROR_TYPE_LABELS = {
  login_required: '登录失效',
  guest_blocked: '游客/权限',
  profile_locked: 'Profile 占用',
  browser_blocked: '浏览器异常',
  api_auth_missing: '接口鉴权缺失',
  api_unauthorized: '接口未授权',
  db_error: '数据库异常',
  unknown: '未知异常',
};

const ERROR_TYPE_ACTIONS = {
  login_required: '重新登录萌拉后再采集',
  guest_blocked: '确认账号不是游客态且有目标页面权限',
  profile_locked: '关闭占用紫鸟 Profile 的浏览器，必要时刷新 Profile 副本',
  browser_blocked: '检查 Chrome 路径、权限和残留浏览器进程',
  api_auth_missing: '先打开目标页，确认业务接口正常加载',
  api_unauthorized: '重新登录萌拉，关闭紫鸟窗口让登录态落盘后，刷新 Profile 再检查',
  db_error: '检查本地数据库路径与写入权限',
  unknown: '查看错误详情并按日志定位',
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

function formatErrorType(type) {
  return ERROR_TYPE_LABELS[type] || formatText(type);
}

function getErrorAction(type) {
  return ERROR_TYPE_ACTIONS[type] || ERROR_TYPE_ACTIONS.unknown;
}

function getJobResult(job) {
  const requestCount = Number(job.request_count || 0);
  const successCount = Number(job.success_count || 0);
  const recordCount = Number(job.record_count || 0);

  if (job.page_type === 'industry_general') {
    if (requestCount === 0 && successCount === 0 && recordCount === 0) {
      return {
        kind: '行业',
        primary: '历史任务',
        secondary: '无统计口径',
      };
    }
    return {
      kind: '行业',
      primary: `请求 ${formatNumber(requestCount)} / 成功 ${formatNumber(successCount)}`,
      secondary: `类目记录 ${formatNumber(recordCount)}`,
    };
  }

  if (job.page_type === 'hot_products') {
    return {
      kind: '商品',
      primary: `原始 ${formatNumber(job.raw_count)} / 标准化 ${formatNumber(job.normalized_count)}`,
      secondary: `警告 ${formatNumber(job.warning_count)}`,
    };
  }

  return {
    kind: '任务',
    primary: `请求 ${formatNumber(job.request_count)} / 成功 ${formatNumber(job.success_count)}`,
    secondary: `记录 ${formatNumber(job.record_count)}`,
  };
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
  const [loginHealth, setLoginHealth] = useState(null);

  const jobsQuery = useQuery({
    queryKey: ['jobs'],
    queryFn: fetchJobs,
    refetchInterval: 15000,
  });

  const jobs = jobsQuery.data?.jobs || [];
  const loginHealthMutation = useMutation({
    mutationFn: checkMenglarLoginHealth,
    onSuccess: setLoginHealth,
  });
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

  const runLoginHealth = (refresh = false) => {
    loginHealthMutation.mutate({
      target: 'hot_products',
      refresh,
      headless: true,
    });
  };

  return (
    <div className="wb-page">
      <Panel
        title="采集可用性检查"
        subtitle="正式采集前先确认萌拉登录态和业务接口授权是否可用"
        actions={
          <div className="wb-inline-actions wb-wrap-actions">
            <button
              type="button"
              className="wb-button wb-button-primary"
              onClick={() => runLoginHealth(false)}
              disabled={loginHealthMutation.isPending}
            >
              {loginHealthMutation.isPending ? '检查中' : '检查是否可采'}
            </button>
            <button
              type="button"
              className="wb-button ghost"
              onClick={() => runLoginHealth(true)}
              disabled={loginHealthMutation.isPending}
            >
              刷新 Profile 后检查
            </button>
          </div>
        }
      >
        <LoginHealthPanel
          result={loginHealth}
          error={loginHealthMutation.error}
          isPending={loginHealthMutation.isPending}
        />
      </Panel>

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
            <colgroup>
              <col className="task-col-id" />
              <col className="task-col-name" />
              <col className="task-col-status" />
              <col className="task-col-time" />
              <col className="task-col-result" />
              <col className="task-col-error" />
              <col className="task-col-action" />
            </colgroup>
            <thead>
              <tr>
                <th>任务ID</th>
                <th>任务</th>
                <th>状态</th>
                <th>时间</th>
                <th>采集结果</th>
                <th>错误信息</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.length ? filteredJobs.map((job) => (
                (() => {
                  const result = getJobResult(job);
                  return (
                <Fragment key={job.id}>
                  <tr>
                    <td className="mono task-id">#{job.id}</td>
                    <td>
                      <div className="cell-main">{formatText(job.page_name)}</div>
                      <div className="task-type-line">
                        <span className="wb-pill">{formatTaskType(job.page_type)}</span>
                      </div>
                    </td>
                    <td><StatusBadge status={job.job_status} /></td>
                    <td className="task-time-cell">
                      <div className="mono">{formatDateTime(job.started_at)}</div>
                      <div className="cell-sub">结束：{formatDateTime(job.finished_at)}</div>
                      <div className="cell-sub">耗时：{getDuration(job.started_at, job.finished_at)}</div>
                    </td>
                    <td>
                      <div className="task-result-kind">{result.kind}</div>
                      <div className="cell-main">{result.primary}</div>
                      <div className="cell-sub">{result.secondary}</div>
                    </td>
                    <td className={job.error_message ? 'task-error-summary is-error' : 'task-error-summary'}>
                      {job.error_type ? <span className="task-error-type">{formatErrorType(job.error_type)}</span> : null}
                      <span>{getErrorSummary(job.error_message)}</span>
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
                            <span>问题类型</span>
                            <p>{formatErrorType(job.error_type)}</p>
                          </div>
                          <div>
                            <span>建议处理</span>
                            <p>{job.error_type ? getErrorAction(job.error_type) : '-'}</p>
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
                  );
                })()
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

function LoginHealthPanel({ result, error, isPending }) {
  if (error) {
    return <div className="wb-feedback is-error">登录态检查失败：{error.message}</div>;
  }

  if (!result && !isPending) {
    return (
      <div className="login-health-empty">
        <strong>尚未检查</strong>
        <span>点击检查后，会验证 profile、页面状态、Authorization 和 401/403 响应。</span>
      </div>
    );
  }

  if (isPending) {
    return <div className="wb-feedback is-busy">正在打开目标页并检查萌拉业务接口授权...</div>;
  }

  const ok = Boolean(result?.ok);
  const errorType = result?.errorType;
  return (
    <div className={ok ? 'login-health-card is-ready' : 'login-health-card is-blocked'}>
      <div className="login-health-status">
        <span>{ok ? '可正常采集' : '暂不可采集'}</span>
        <strong>{ok ? 'Ready' : formatErrorType(errorType)}</strong>
      </div>
      <div className="login-health-grid">
        <div>
          <span>检查时间</span>
          <strong>{formatDateTime(result?.checkedAt)}</strong>
        </div>
        <div>
          <span>实际页面</span>
          <strong>{formatText(result?.page?.url)}</strong>
        </div>
        <div>
          <span>本地缓存</span>
          <strong>{result?.storage?.runtimeStorageLoaded ? '已读取' : '未读取'}</strong>
        </div>
        <div>
          <span>授权请求</span>
          <strong>{formatNumber(result?.api?.authorizedRequestCount || 0)} / {formatNumber(result?.api?.requestCount || 0)}</strong>
        </div>
        <div>
          <span>401/403</span>
          <strong>{formatNumber(result?.api?.unauthorizedResponseCount || 0)}</strong>
        </div>
        <div>
          <span>建议处理</span>
          <strong>{formatText(result?.nextAction)}</strong>
        </div>
      </div>
    </div>
  );
}
