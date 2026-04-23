import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Panel } from '../components/Panel';
import { fetchProducts, fetchResultJobs } from '../lib/api';
import { formatMoney, formatNumber, formatPercent, formatText } from '../lib/format';

const defaultFilters = {
  keyword: '',
  productType: '',
  categoryLevel1: '',
  minSales: '',
  minRevenue: '',
  sort: 'sales_desc',
};

const modeOptions = [
  { key: 'result', label: '结果展示' },
  { key: 'screening', label: '商品筛选' },
];

const screeningStatusLabels = {
  pending: '待判断',
  candidate: '已加入候选',
  rejected: '已排除',
};

const pageSize = 20;

function getInitialMode(searchParams) {
  return searchParams.get('mode') === 'screening' ? 'screening' : 'result';
}

function getInitialFilters(searchParams) {
  return {
    keyword: searchParams.get('keyword') || '',
    productType: searchParams.get('productType') || '',
    categoryLevel1: searchParams.get('categoryLevel1') || '',
    minSales: searchParams.get('minSales') || '',
    minRevenue: searchParams.get('minRevenue') || '',
    sort: searchParams.get('sort') || 'sales_desc',
  };
}

function formatJobType(value) {
  const map = {
    hot_products: '热销商品',
    industry_general: '行业数据',
  };
  return map[value] || formatText(value);
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return formatText(value);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function ResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState(() => getInitialMode(searchParams));
  const [filters, setFilters] = useState(() => getInitialFilters(searchParams));
  const [page, setPage] = useState(() => Math.max(Number(searchParams.get('page') || 1), 1));
  const [selectedJobId, setSelectedJobId] = useState(() => searchParams.get('jobId') || '');
  const [showUnavailableJobs, setShowUnavailableJobs] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [screeningPool, setScreeningPool] = useState([]);
  const [screeningState, setScreeningState] = useState({});
  const [screeningFilter, setScreeningFilter] = useState('all');

  const resultJobsQuery = useQuery({
    queryKey: ['result-jobs', showUnavailableJobs],
    queryFn: () => fetchResultJobs({
      includeEmpty: showUnavailableJobs,
      includeFailed: showUnavailableJobs,
      limit: 50,
    }),
  });

  const jobs = resultJobsQuery.data?.jobs || [];

  useEffect(() => {
    if (!selectedJobId && jobs.length) {
      setSelectedJobId(String(jobs[0].id));
    }
  }, [jobs, selectedJobId]);

  useEffect(() => {
    const next = new URLSearchParams();
    next.set('mode', mode);
    if (selectedJobId) next.set('jobId', selectedJobId);
    if (page > 1) next.set('page', String(page));
    Object.entries(filters).forEach(([key, value]) => {
      if (value) next.set(key, String(value));
    });
    setSearchParams(next, { replace: true });
  }, [filters, mode, page, selectedJobId, setSearchParams]);

  const productsQuery = useQuery({
    queryKey: ['products', selectedJobId, filters, page],
    queryFn: () => fetchProducts({ ...filters, jobId: selectedJobId, page, pageSize }),
    enabled: Boolean(selectedJobId),
  });

  const data = productsQuery.data;
  const items = data?.items || [];
  const pageCount = useMemo(() => Math.max(Math.ceil((data?.total || 0) / pageSize), 1), [data?.total]);
  const currentJob = data?.latestJob || jobs.find((job) => String(job.id) === String(selectedJobId));
  const firstAvailableJob = jobs.find((job) => Number(job.product_count || 0) > 0 && job.job_status === 'success');
  const isEmptyBatch = Boolean(selectedJobId && data && Number(data.actualProductCount || 0) === 0);

  const screeningCounts = useMemo(() => {
    const counts = {
      all: screeningPool.length,
      pending: 0,
      candidate: 0,
      rejected: 0,
    };
    screeningPool.forEach((item) => {
      const status = screeningState[item.id] || 'pending';
      counts[status] += 1;
    });
    return counts;
  }, [screeningPool, screeningState]);

  const visibleItems = useMemo(() => {
    if (mode !== 'screening') return items;
    if (screeningFilter === 'all') return screeningPool;
    return screeningPool.filter((item) => (screeningState[item.id] || 'pending') === screeningFilter);
  }, [items, mode, screeningFilter, screeningPool, screeningState]);

  const applyFilter = (key, value) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setPage(1);
    setFilters(defaultFilters);
  };

  const selectJob = (jobId) => {
    setSelectedJobId(String(jobId));
    setPage(1);
    setBatchOpen(false);
  };

  const setItemScreeningStatus = (itemId, status) => {
    setScreeningState((prev) => ({ ...prev, [itemId]: status }));
  };

  const addCurrentPageToScreeningPool = () => {
    if (!items.length) return;
    setScreeningPool((prev) => {
      const byId = new Map(prev.map((item) => [item.id, item]));
      items.forEach((item) => byId.set(item.id, item));
      return Array.from(byId.values());
    });
  };

  return (
    <div className="wb-page results-workbench">
      <div className="result-mode-tabs" aria-label="结果工作台模式">
        {modeOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            className={mode === option.key ? 'is-active' : ''}
            onClick={() => setMode(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="result-metrics-bar">
        <MetricCard label="商品数" value={formatNumber(data?.summary?.total_products || 0)} />
        <MetricCard label="当前命中" value={formatNumber(data?.total || 0)} />
        <MetricCard label="最高销售量" value={formatNumber(data?.summary?.max_sales || 0)} />
        <MetricCard label="最高销售金额" value={formatMoney(data?.summary?.max_revenue || 0)} />
        <MetricCard label="平均毛利率" value={formatPercent(data?.summary?.avg_margin || 0)} />
      </div>

      {mode === 'screening' ? (
        <div className="screening-status-strip">
          {[
            ['all', '筛选池', screeningCounts.all],
            ['pending', '待判断', screeningCounts.pending],
            ['candidate', '已加入候选', screeningCounts.candidate],
            ['rejected', '已排除', screeningCounts.rejected],
          ].map(([key, label, value]) => (
            <button
              key={key}
              type="button"
              className={screeningFilter === key ? 'is-active' : ''}
              onClick={() => setScreeningFilter(key)}
            >
              <span>{label}</span>
              <strong>{formatNumber(value)}</strong>
            </button>
          ))}
        </div>
      ) : null}

      <div className="wb-results-layout result-workbench-layout">
        <Panel title="筛选条件" subtitle="批次决定当前数据范围">
          <div className="wb-filter-grid">
            <div className="wb-field result-batch-field">
              <span>数据批次</span>
              <button type="button" className="result-batch-trigger" onClick={() => setBatchOpen((open) => !open)}>
                <strong>{currentJob ? `#${currentJob.id} · 商品 ${formatNumber(data?.actualProductCount ?? currentJob.product_count ?? 0)}` : '选择批次'}</strong>
                <small>{currentJob ? `${formatJobType(currentJob.page_type)} · ${formatDate(currentJob.finished_at)}` : '默认只显示有商品数据的成功批次'}</small>
              </button>

              {batchOpen ? (
                <div className="result-batch-popover">
                  <label className="result-batch-toggle">
                    <input
                      type="checkbox"
                      checked={showUnavailableJobs}
                      onChange={(event) => setShowUnavailableJobs(event.target.checked)}
                    />
                    <span>显示空批次和失败批次</span>
                  </label>
                  <div className="result-batch-list">
                    {jobs.length ? jobs.map((job) => (
                      <button
                        key={job.id}
                        type="button"
                        className={String(job.id) === String(selectedJobId) ? 'is-active' : ''}
                        onClick={() => selectJob(job.id)}
                      >
                        <strong>#{job.id}</strong>
                        <span>商品 {formatNumber(job.product_count || 0)} · {formatJobType(job.page_type)} · {formatDate(job.finished_at)}</span>
                        {job.job_status !== 'success' ? <em>失败/未完成</em> : null}
                        {job.job_status === 'success' && Number(job.product_count || 0) === 0 ? <em>无商品</em> : null}
                      </button>
                    )) : (
                      <div className="wb-empty-cell">暂无可选批次</div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <label className="wb-field">
              <span>关键词</span>
              <input value={filters.keyword} onChange={(event) => applyFilter('keyword', event.target.value)} placeholder="平台商品ID / 品牌 / 类目" />
            </label>

            <label className="wb-field">
              <span>商品类型</span>
              <select value={filters.productType} onChange={(event) => applyFilter('productType', event.target.value)}>
                <option value="">全部</option>
                {(data?.options?.productType || []).map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>

            <label className="wb-field">
              <span>一级类目</span>
              <select value={filters.categoryLevel1} onChange={(event) => applyFilter('categoryLevel1', event.target.value)}>
                <option value="">全部</option>
                {(data?.options?.categoryLevel1 || []).map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>

            <label className="wb-field">
              <span>最低销售量</span>
              <input type="number" min="0" value={filters.minSales} onChange={(event) => applyFilter('minSales', event.target.value)} />
            </label>

            <label className="wb-field">
              <span>最低销售金额</span>
              <input type="number" min="0" value={filters.minRevenue} onChange={(event) => applyFilter('minRevenue', event.target.value)} />
            </label>

            <label className="wb-field">
              <span>排序方式</span>
              <select value={filters.sort} onChange={(event) => applyFilter('sort', event.target.value)}>
                <option value="sales_desc">销售量降序</option>
                <option value="sales_growth_desc">销售量增长降序</option>
                <option value="revenue_desc">销售金额降序</option>
                <option value="margin_desc">毛利率降序</option>
                <option value="impressions_desc">曝光降序</option>
              </select>
            </label>

            <div className="wb-field">
              <span>当前结果</span>
              <div className="wb-filter-hint">共 {formatNumber(data?.total || 0)} 条</div>
            </div>

            <button type="button" className="wb-button ghost" onClick={resetFilters}>重置筛选</button>
          </div>
        </Panel>

        <Panel
          title={mode === 'screening' ? '商品筛选' : '商品结果'}
          subtitle={mode === 'screening' ? `筛选池 ${formatNumber(screeningPool.length)} 个商品` : `第 ${page} / ${pageCount} 页`}
          actions={
            <div className="wb-inline-actions">
              {mode === 'result' ? (
                <button className="wb-button wb-button-primary" onClick={addCurrentPageToScreeningPool} disabled={!items.length}>
                  将当前页加入筛选池
                </button>
              ) : null}
              {mode === 'result' ? (
                <>
                  <button className="wb-button ghost" onClick={() => setPage((current) => Math.max(current - 1, 1))} disabled={page <= 1}>
                    上一页
                  </button>
                  <button className="wb-button ghost" onClick={() => setPage((current) => Math.min(current + 1, pageCount))} disabled={page >= pageCount}>
                    下一页
                  </button>
                </>
              ) : null}
            </div>
          }
        >
          {productsQuery.isError ? (
            <div className="wb-feedback is-error">商品读取失败：{productsQuery.error.message}</div>
          ) : null}

          {mode === 'screening' && !screeningPool.length ? (
            <div className="result-empty-batch">
              <strong>筛选池还没有商品</strong>
              <p>请先在“结果展示”页签中选择批次和筛选条件，再点击“将当前页加入筛选池”。商品筛选页签只处理你主动加入的商品。</p>
              <div className="wb-inline-actions">
                <button type="button" className="wb-button wb-button-primary" onClick={() => setMode('result')}>回到结果展示</button>
              </div>
            </div>
          ) : isEmptyBatch ? (
            <div className="result-empty-batch">
              <strong>当前批次没有商品明细数据</strong>
              <p>#{selectedJobId} 任务存在，但没有关联到商品经营快照记录。它可能是行业数据采集任务，或本次采集没有解析出商品明细。</p>
              <div className="wb-inline-actions">
                {firstAvailableJob ? (
                  <button type="button" className="wb-button wb-button-primary" onClick={() => selectJob(firstAvailableJob.id)}>
                    切换到最近有商品数据的批次 #{firstAvailableJob.id}
                  </button>
                ) : null}
                <button type="button" className="wb-button ghost" onClick={() => setBatchOpen(true)}>重新选择批次</button>
              </div>
            </div>
          ) : (
            <ProductTable
              items={visibleItems}
              mode={mode}
              screeningState={screeningState}
              setItemScreeningStatus={setItemScreeningStatus}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}

function ProductTable({ items, mode, screeningState, setItemScreeningStatus }) {
  const isScreening = mode === 'screening';

  return (
    <div className="wb-table-wrap result-table-wrap">
      <table className={isScreening ? 'wb-table result-table is-screening' : 'wb-table result-table'}>
        <thead>
          <tr>
            {isScreening ? <th>状态</th> : null}
            <th>平台商品ID</th>
            <th>品牌 / 类型</th>
            <th>类目</th>
            <th className="num">销售量</th>
            <th className="num">销售量增长</th>
            <th className="num">潜力指数</th>
            <th className="num">销售金额</th>
            <th className="num">曝光 / 点击</th>
            <th className="num">转化 / 毛利</th>
            <th>物流 / 时效</th>
            <th>尺寸 / 重量</th>
            {isScreening ? <th>操作</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.length ? items.map((item) => {
            const status = screeningState[item.id] || 'pending';
            return (
              <tr key={item.id}>
                {isScreening ? (
                  <td>
                    <span className={`screening-state-pill is-${status}`}>{screeningStatusLabels[status]}</span>
                  </td>
                ) : null}
                <td className="mono">
                  <div className="cell-main">{item.platform_product_id}</div>
                  <div className="cell-sub">{formatText(item.platform)}</div>
                </td>
                <td>
                  <div className="cell-main">{formatText(item.brand)}</div>
                  <div className="cell-sub">{formatText(item.product_type)}</div>
                </td>
                <td>
                  <div className="cell-main">{formatText(item.category_level_1)}</div>
                  <div className="cell-sub">{formatText(item.category_level_2)} / {formatText(item.category_level_3)}</div>
                </td>
                <td className="num">{formatNumber(item.sales_volume)}</td>
                <td className="num">{formatPercent(item.sales_growth)}</td>
                <td className="num">{formatNumber(item.potential_index, 2)}</td>
                <td className="num">{formatMoney(item.sales_amount)}</td>
                <td className="num">{formatNumber(item.impressions)} / {formatNumber(item.clicks)}</td>
                <td className="num">
                  <div className={Number(item.estimated_gross_margin) >= 0 ? 'good' : 'danger'}>{formatPercent(item.order_conversion_rate)}</div>
                  <div className="cell-sub">毛利 {formatPercent(item.estimated_gross_margin)}</div>
                </td>
                <td>
                  <div className="cell-main">{formatText(item.shipping_mode)}</div>
                  <div className="cell-sub">配送 {formatText(item.delivery_time)}</div>
                </td>
                <td>{formatText(item.length_cm)} × {formatText(item.width_cm)} × {formatText(item.height_cm)} / {formatNumber(item.weight_g)}g</td>
                {isScreening ? (
                  <td>
                    <div className="screening-row-actions">
                      <button type="button" onClick={() => setItemScreeningStatus(item.id, 'candidate')}>标为候选</button>
                      <button type="button" onClick={() => setItemScreeningStatus(item.id, 'rejected')}>标为排除</button>
                      <button type="button" onClick={() => setItemScreeningStatus(item.id, 'pending')}>标为待判断</button>
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          }) : (
            <tr>
              <td colSpan={isScreening ? 13 : 11} className="wb-empty-cell">当前没有匹配数据</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <article className="result-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
