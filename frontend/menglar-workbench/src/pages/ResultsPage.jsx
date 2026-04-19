import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Panel } from '../components/Panel';
import { fetchProducts } from '../lib/api';
import { formatMoney, formatNumber, formatPercent, formatText } from '../lib/format';

const defaultFilters = {
  keyword: '',
  productType: '',
  categoryLevel1: '',
  minSales: '',
  minRevenue: '',
  sort: 'sales_desc',
};

export function ResultsPage() {
  const [filters, setFilters] = useState(defaultFilters);
  const [page, setPage] = useState(1);

  const productsQuery = useQuery({
    queryKey: ['products', filters, page],
    queryFn: () => fetchProducts({ ...filters, page, pageSize: 20 }),
  });

  const data = productsQuery.data;
  const items = data?.items || [];
  const pageCount = useMemo(() => Math.max(Math.ceil((data?.total || 0) / 20), 1), [data?.total]);

  const applyFilter = (key, value) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="wb-page">
      <div className="wb-page-hero split">
        <div>
          <p className="wb-kicker">Result Hub</p>
          <h2>结果展示页</h2>
          <p>这个页面只负责看结果：统计卡片、筛选条件和商品列表。采集任务状态不在这里展开。</p>
        </div>
        <motion.div
          className="wb-hero-card"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
        >
          <span>当前任务</span>
          <strong>{data?.latestJob ? `#${data.latestJob.id}` : '-'}</strong>
          <small>{data?.latestJob?.finished_at || data?.latestJob?.started_at || '-'}</small>
        </motion.div>
      </div>

      <div className="wb-metrics">
        <MetricCard label="商品数" value={formatNumber(data?.summary?.total_products || 0)} hint="当前任务已入库商品" />
        <MetricCard label="最高销量" value={formatNumber(data?.summary?.max_sales || 0)} hint="按 sales 统计" />
        <MetricCard label="最高销售额" value={formatMoney(data?.summary?.max_revenue || 0)} hint="按 revenue 统计" />
        <MetricCard label="平均毛利率" value={formatPercent(data?.summary?.avg_margin || 0)} hint="按 estimated_gross_margin 统计" />
      </div>

      <div className="wb-results-layout">
        <Panel title="筛选条件" subtitle="把结果页只留给筛选和浏览">
          <div className="wb-filter-grid">
            <label className="wb-field">
              <span>关键词</span>
              <input value={filters.keyword} onChange={(e) => applyFilter('keyword', e.target.value)} placeholder="商品ID / 品牌 / 类目" />
            </label>

            <label className="wb-field">
              <span>商品类型</span>
              <select value={filters.productType} onChange={(e) => applyFilter('productType', e.target.value)}>
                <option value="">全部</option>
                {(data?.options?.productType || []).map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>

            <label className="wb-field">
              <span>一级类目</span>
              <select value={filters.categoryLevel1} onChange={(e) => applyFilter('categoryLevel1', e.target.value)}>
                <option value="">全部</option>
                {(data?.options?.categoryLevel1 || []).map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>

            <label className="wb-field">
              <span>最低销量</span>
              <input type="number" min="0" value={filters.minSales} onChange={(e) => applyFilter('minSales', e.target.value)} />
            </label>

            <label className="wb-field">
              <span>最低销售额</span>
              <input type="number" min="0" value={filters.minRevenue} onChange={(e) => applyFilter('minRevenue', e.target.value)} />
            </label>

            <label className="wb-field">
              <span>排序方式</span>
              <select value={filters.sort} onChange={(e) => applyFilter('sort', e.target.value)}>
                <option value="sales_desc">销量降序</option>
                <option value="sales_growth_desc">销量增长降序</option>
                <option value="revenue_desc">销售额降序</option>
                <option value="margin_desc">毛利率降序</option>
                <option value="impressions_desc">曝光降序</option>
              </select>
            </label>

            <div className="wb-field">
              <span>当前结果</span>
              <div className="wb-filter-hint">共 {formatNumber(data?.total || 0)} 条</div>
            </div>
          </div>
        </Panel>

        <Panel
          title="商品结果"
          subtitle={`第 ${page} / ${pageCount} 页`}
          actions={
            <div className="wb-inline-actions">
              <button className="wb-button ghost" onClick={() => setPage((current) => Math.max(current - 1, 1))} disabled={page <= 1}>
                上一页
              </button>
              <button className="wb-button ghost" onClick={() => setPage((current) => Math.min(current + 1, pageCount))} disabled={page >= pageCount}>
                下一页
              </button>
            </div>
          }
        >
          <div className="wb-table-wrap">
            <table className="wb-table">
              <thead>
                <tr>
                  <th>商品ID</th>
                  <th>品牌 / 类型</th>
                  <th>类目</th>
                  <th>销量</th>
                  <th>销量增长</th>
                  <th>潜力指数</th>
                  <th>销售额</th>
                  <th>曝光 / 点击</th>
                  <th>转化 / 毛利</th>
                  <th>物流 / 时效</th>
                  <th>尺寸 / 重量</th>
                </tr>
              </thead>
              <tbody>
                {items.length ? items.map((item) => (
                  <tr key={item.id}>
                    <td className="mono">{item.ozon_product_id}</td>
                    <td>
                      <div className="cell-main">{formatText(item.brand)}</div>
                      <div className="cell-sub">{formatText(item.product_type)}</div>
                    </td>
                    <td>
                      <div className="cell-main">{formatText(item.category_level_1)}</div>
                      <div className="cell-sub">{formatText(item.category_level_2)} / {formatText(item.category_level_3)}</div>
                    </td>
                    <td>{formatNumber(item.sales)}</td>
                    <td>{formatPercent(item.sales_growth)}</td>
                    <td>{formatNumber(item.potential_index, 2)}</td>
                    <td>{formatMoney(item.revenue)}</td>
                    <td>{formatNumber(item.impressions)} / {formatNumber(item.clicks)}</td>
                    <td>
                      <div className={Number(item.estimated_gross_margin) >= 0 ? 'good' : 'danger'}>{formatPercent(item.order_conversion_rate)}</div>
                      <div className="cell-sub">毛利 {formatPercent(item.estimated_gross_margin)}</div>
                    </td>
                    <td>
                      <div className="cell-main">{formatText(item.shipping_mode)}</div>
                      <div className="cell-sub">配送 {formatText(item.delivery_time)}</div>
                    </td>
                    <td>{formatText(item.length_cm)} × {formatText(item.width_cm)} × {formatText(item.height_cm)} / {formatNumber(item.weight_g)}g</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="11" className="wb-empty-cell">当前没有匹配数据</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function MetricCard({ label, value, hint }) {
  return (
    <motion.article
      className="wb-metric-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </motion.article>
  );
}
