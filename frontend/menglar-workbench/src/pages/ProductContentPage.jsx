import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Panel } from '../components/Panel';
import {
  fetchProductBusinessLatest,
  fetchProductContent,
  fetchProductContentSkus,
} from '../lib/api';
import { formatCurrency, formatNumber, formatPercent, formatText } from '../lib/format';

const defaultFilters = {
  platform: 'ozon',
  keyword: '',
  status: 'all',
  hasHistory: 'all',
};

const detailTabs = [
  { key: 'description', label: '描述详情' },
  { key: 'gallery', label: '图库' },
  { key: 'sku', label: 'SKU' },
  { key: 'versions', label: '版本' },
  { key: 'business', label: '经营' },
];

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return formatText(value);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatHash(value) {
  if (!value) return '-';
  return value.length > 18 ? `${value.slice(0, 12)}...` : value;
}

function getAssetChecks(item, skus = []) {
  const imageCount = item?.image_urls?.length || 0;
  const tagCount = item?.tags?.length || 0;
  const skuCount = typeof item?.sku_count === 'number' ? item.sku_count : skus.length;
  const skuImageCount = skus.filter((sku) => (sku.images || []).length > 0).length;
  const checks = [
    { key: 'title', label: '标题', ok: Boolean(item?.title), issue: '描述缺失' },
    { key: 'description', label: '描述', ok: Boolean(item?.description), issue: '描述缺失' },
    { key: 'mainImage', label: '主图', ok: Boolean(item?.main_image_url), issue: '缺主图' },
    { key: 'gallery', label: '图库', ok: imageCount > 0, issue: '缺图库' },
    { key: 'tags', label: '标签', ok: tagCount >= 3, issue: '标签不足' },
    { key: 'sku', label: 'SKU', ok: skuCount > 0, issue: '缺SKU' },
  ];

  if (skus.length) {
    checks.push({
      key: 'skuImages',
      label: 'SKU图片',
      ok: skuImageCount === skus.length,
      issue: '缺SKU图片',
    });
  }

  return checks;
}

function getAssetStatus(item, skus = []) {
  const failed = getAssetChecks(item, skus).filter((check) => !check.ok);
  if (!failed.length) return { label: '正常', tone: 'success' };
  if (failed.some((check) => check.key === 'mainImage')) return { label: '缺主图', tone: 'danger' };
  if (failed.some((check) => check.key === 'gallery')) return { label: '缺图库', tone: 'warning' };
  if (failed.some((check) => check.key === 'skuImages')) return { label: '缺SKU图片', tone: 'warning' };
  if (failed.some((check) => check.key === 'tags')) return { label: '标签不足', tone: 'warning' };
  return { label: '待确认', tone: 'warning' };
}

function StatusPill({ status }) {
  return <span className={`product-content-status is-${status.tone}`}>{status.label}</span>;
}

function SummaryCard({ label, value, tone = 'neutral' }) {
  return (
    <article className={`product-content-browser-metric is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function FieldBlock({ label, children }) {
  return (
    <section className="product-content-field-block">
      <small>{label}</small>
      <div>{children}</div>
    </section>
  );
}

export function ProductContentPage() {
  const [filters, setFilters] = useState(defaultFilters);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedContentId, setSelectedContentId] = useState(null);
  const [activeTab, setActiveTab] = useState('description');

  const listQuery = useQuery({
    queryKey: ['product-content', 'browser-list', filters.platform],
    queryFn: () => fetchProductContent({ platform: filters.platform }),
  });

  const allItems = listQuery.data?.items || [];

  const filteredItems = useMemo(() => {
    const keyword = filters.keyword.trim().toLowerCase();
    return allItems.filter((item) => {
      const status = getAssetStatus(item);
      const matchesKeyword = !keyword
        || String(item.platform_product_id || '').toLowerCase().includes(keyword)
        || String(item.title || '').toLowerCase().includes(keyword);
      const matchesStatus = filters.status === 'all' || status.label === filters.status;
      const matchesHistory = filters.hasHistory === 'all'
        || (filters.hasHistory === 'yes' && Number(item.version_count || 0) > 1)
        || (filters.hasHistory === 'no' && Number(item.version_count || 0) <= 1);
      return matchesKeyword && matchesStatus && matchesHistory;
    });
  }, [allItems, filters]);

  const selectedListItem = useMemo(
    () => allItems.find((item) => item.platform_product_id === selectedProductId) || null,
    [allItems, selectedProductId],
  );

  const historyQuery = useQuery({
    queryKey: ['product-content', 'history', filters.platform, selectedProductId],
    queryFn: () => fetchProductContent({
      platform: filters.platform,
      productId: selectedProductId,
      latest: false,
    }),
    enabled: Boolean(selectedProductId),
  });

  const historyItems = historyQuery.data?.items || [];

  useEffect(() => {
    if (!selectedProductId) return;
    const nextItem = historyItems[0] || selectedListItem;
    if (nextItem && !historyItems.some((item) => item.id === selectedContentId)) {
      setSelectedContentId(nextItem.id);
    }
  }, [historyItems, selectedContentId, selectedListItem, selectedProductId]);

  const selectedItem = useMemo(
    () => historyItems.find((item) => item.id === selectedContentId) || selectedListItem,
    [historyItems, selectedContentId, selectedListItem],
  );

  const skusQuery = useQuery({
    queryKey: ['product-content-skus', selectedContentId],
    queryFn: () => fetchProductContentSkus(selectedContentId),
    enabled: Boolean(selectedContentId),
  });

  const businessQuery = useQuery({
    queryKey: ['product-business-latest', filters.platform, selectedProductId],
    queryFn: () => fetchProductBusinessLatest({
      platform: filters.platform,
      productId: selectedProductId,
    }),
    enabled: Boolean(selectedProductId),
  });

  const selectedSkus = skusQuery.data?.skus || [];
  const businessItem = businessQuery.data?.item || null;
  const detailStatus = selectedItem ? getAssetStatus(selectedItem, selectedSkus) : null;
  const detailChecks = selectedItem ? getAssetChecks(selectedItem, selectedSkus) : [];

  const summary = useMemo(() => {
    const problemItems = allItems.filter((item) => getAssetStatus(item).label !== '正常');
    const missingImages = allItems.filter((item) => !item.main_image_url || !(item.image_urls || []).length);
    const missingSkus = allItems.filter((item) => !Number(item.sku_count || 0));
    const today = new Date().toISOString().slice(0, 10);
    const todayItems = allItems.filter((item) => String(item.captured_at || '').slice(0, 10) === today);
    return {
      total: allItems.length,
      problem: problemItems.length,
      missingImages: missingImages.length,
      missingSkus: missingSkus.length,
      today: todayItems.length,
      latest: allItems[0]?.captured_at,
    };
  }, [allItems]);

  const openDetail = (item) => {
    setSelectedProductId(item.platform_product_id);
    setSelectedContentId(item.id);
    setActiveTab('description');
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
  };

  return (
    <div className="wb-page product-content-page">
      <section className="product-content-browser-head">
        <div>
          <p className="wb-kicker">Content Assets</p>
          <h2>商品内容资产浏览器</h2>
          <p>按商品浏览已采集的标题、描述、标签、图片、SKU 图片和历史版本，列表负责定位，详情抽屉负责核查。</p>
        </div>
      </section>

      <Panel title="筛选" subtitle="默认展示每个商品最新一条内容资产，点击表格行查看完整详情。">
        <div className="product-content-browser-filter">
          <label className="wb-field">
            <span>平台</span>
            <select
              value={filters.platform}
              onChange={(event) => setFilters((current) => ({ ...current, platform: event.target.value }))}
            >
              <option value="ozon">ozon</option>
            </select>
          </label>
          <label className="wb-field">
            <span>商品ID / 标题</span>
            <input
              value={filters.keyword}
              onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
              placeholder="输入关键词筛选"
            />
          </label>
          <label className="wb-field">
            <span>内容状态</span>
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="all">全部</option>
              <option value="正常">正常</option>
              <option value="待确认">待确认</option>
              <option value="缺主图">缺主图</option>
              <option value="缺图库">缺图库</option>
              <option value="缺SKU图片">缺SKU图片</option>
              <option value="标签不足">标签不足</option>
            </select>
          </label>
          <label className="wb-field">
            <span>历史版本</span>
            <select
              value={filters.hasHistory}
              onChange={(event) => setFilters((current) => ({ ...current, hasHistory: event.target.value }))}
            >
              <option value="all">全部</option>
              <option value="yes">有历史版本</option>
              <option value="no">仅单版本</option>
            </select>
          </label>
          <button className="wb-button ghost" type="button" onClick={resetFilters}>重置</button>
        </div>
      </Panel>

      <div className="product-content-browser-metrics">
        <SummaryCard label="商品数" value={summary.total} />
        <SummaryCard label="待处理" value={summary.problem} tone={summary.problem ? 'warning' : 'success'} />
        <SummaryCard label="缺图片" value={summary.missingImages} tone={summary.missingImages ? 'warning' : 'success'} />
        <SummaryCard label="缺SKU" value={summary.missingSkus} tone={summary.missingSkus ? 'warning' : 'success'} />
        <SummaryCard label="今日新增" value={summary.today} />
        <SummaryCard label="最近采集" value={formatDate(summary.latest)} />
      </div>

      {listQuery.isError ? <div className="wb-feedback is-error">读取内容资产列表失败：{listQuery.error.message}</div> : null}
      {listQuery.isLoading ? <div className="wb-feedback is-busy">正在读取商品内容资产列表...</div> : null}

      <Panel
        title="内容资产列表"
        subtitle={`当前筛选结果 ${filteredItems.length} 条，表格每行对应一个平台商品。`}
      >
        <div className="wb-table-wrap product-content-table-wrap">
          <table className="wb-table product-content-table">
            <thead>
              <tr>
                <th>主图</th>
                <th>商品标题</th>
                <th>平台</th>
                <th>平台商品ID</th>
                <th>状态</th>
                <th>图片</th>
                <th>SKU</th>
                <th>标签</th>
                <th>版本</th>
                <th>最新采集</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const status = getAssetStatus(item);
                return (
                  <tr key={item.id} className={selectedProductId === item.platform_product_id ? 'is-selected' : ''}>
                    <td>
                      {item.main_image_url ? (
                        <img className="product-content-thumb" src={item.main_image_url} alt="" loading="lazy" />
                      ) : (
                        <div className="product-content-thumb is-empty">无图</div>
                      )}
                    </td>
                    <td>
                      <button type="button" className="product-content-title-button" onClick={() => openDetail(item)}>
                        {formatText(item.title)}
                      </button>
                    </td>
                    <td>{formatText(item.platform)}</td>
                    <td className="product-content-id-cell">{formatText(item.platform_product_id)}</td>
                    <td><StatusPill status={status} /></td>
                    <td>{item.main_image_url ? 1 : 0} / {(item.image_urls || []).length}</td>
                    <td>{item.sku_count ?? 0}</td>
                    <td>{(item.tags || []).length}</td>
                    <td>{item.version_count ?? 1}</td>
                    <td>{formatDate(item.captured_at)}</td>
                    <td>
                      <button type="button" className="wb-button ghost" onClick={() => openDetail(item)}>查看</button>
                    </td>
                  </tr>
                );
              })}
              {!filteredItems.length && !listQuery.isLoading ? (
                <tr>
                  <td colSpan="11" className="wb-empty-cell">没有符合筛选条件的内容资产</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      {selectedItem ? (
        <div className="product-content-drawer-backdrop" onClick={() => setSelectedProductId('')}>
          <aside className="product-content-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="product-content-drawer-head">
              <h3>{formatText(selectedItem.title)}</h3>
              <button type="button" className="product-content-drawer-close" onClick={() => setSelectedProductId('')}>关闭</button>
            </div>

            <div className="product-content-info-card">
              <div className="product-content-info-card-image">
                {selectedItem.main_image_url ? (
                  <img src={selectedItem.main_image_url} alt="" loading="lazy" />
                ) : (
                  <div className="product-content-image-empty">暂无主图</div>
                )}
              </div>
              <div className="product-content-info-card-details">
                <div className="product-content-info-card-row">
                  <span className="product-content-info-card-label">商品ID</span>
                  <span>{formatText(selectedItem.platform_product_id)}</span>
                </div>
                <div className="product-content-info-card-row">
                  <span className="product-content-info-card-label">状态</span>
                  <StatusPill status={detailStatus} />
                </div>
                <div className="product-content-info-card-row">
                  <span className="product-content-info-card-label">标签</span>
                  <div className="product-content-tag-list">
                    {(selectedItem.tags || []).length
                      ? selectedItem.tags.map((tag) => <span key={String(tag)}>{String(tag)}</span>)
                      : <em>暂无标签</em>}
                  </div>
                </div>
                <div className="product-content-info-card-checks">
                  {detailChecks
                    .filter((c) => ['mainImage', 'gallery', 'sku', 'skuImages'].includes(c.key))
                    .map((check) => (
                      <span
                        key={check.key}
                        className={`product-content-info-card-check ${check.ok ? 'is-ok' : 'is-warning'}`}
                      >
                        {check.ok ? '✓' : '⚠'} {check.label}
                      </span>
                    ))}
                </div>
              </div>
            </div>

            <div className="product-content-drawer-tabs">
              {detailTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={activeTab === tab.key ? 'is-active' : ''}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {historyQuery.isLoading || skusQuery.isLoading ? (
              <div className="wb-feedback is-busy">正在读取详情...</div>
            ) : null}

            {activeTab === 'description' ? (
              <div className="product-content-drawer-body">
                <FieldBlock label="描述">
                  {selectedItem.description
                    ? <p>{formatText(selectedItem.description)}</p>
                    : <em>暂无描述</em>}
                </FieldBlock>
                <FieldBlock label="基础信息">
                  <div className="product-content-meta-grid">
                    <span>平台：{formatText(selectedItem.platform)}</span>
                    <span>版本ID：{selectedItem.id}</span>
                    <span>采集时间：{formatDate(selectedItem.captured_at)}</span>
                    <span>内容哈希：{formatHash(selectedItem.content_hash)}</span>
                  </div>
                </FieldBlock>
              </div>
            ) : null}

            {activeTab === 'gallery' ? (
              <div className="product-content-drawer-body">
                <div className="product-content-drawer-gallery">
                  {(selectedItem.image_urls || []).length
                    ? selectedItem.image_urls.map((url, index) => <img key={`${url}-${index}`} src={url} alt="" loading="lazy" />)
                    : <div className="product-content-image-empty">暂无图库</div>}
                </div>
              </div>
            ) : null}

            {activeTab === 'sku' ? (
              <div className="product-content-drawer-body product-content-sku-list">
                {selectedSkus.length ? selectedSkus.map((sku) => (
                  <article key={sku.id} className="product-content-sku-card">
                    <div className="product-content-sku-head">
                      <div>
                        <small>SKU</small>
                        <strong>{formatText(sku.sku_name || sku.platform_sku_id)}</strong>
                      </div>
                      <div className="product-content-sku-price">
                        <small>价格</small>
                        <strong>{formatCurrency(sku.price, sku.currency_code || 'CNY')}</strong>
                      </div>
                    </div>
                    <div className="product-content-meta-grid">
                      <span>平台SKU：{formatText(sku.platform_sku_id)}</span>
                      <span>图片数：{sku.images?.length || 0}</span>
                    </div>
                    <div className="product-content-drawer-gallery">
                      {sku.images?.length
                        ? sku.images.map((url, index) => <img key={`${sku.id}-${index}`} src={url} alt="" loading="lazy" />)
                        : <div className="product-content-image-empty">暂无 SKU 图片</div>}
                    </div>
                  </article>
                )) : (
                  <div className="product-content-empty">当前版本没有 SKU 数据</div>
                )}
              </div>
            ) : null}

            {activeTab === 'versions' ? (
              <div className="product-content-drawer-body product-content-version-list">
                {historyItems.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`product-content-version-card ${item.id === selectedItem.id ? 'is-active' : ''}`}
                    onClick={() => setSelectedContentId(item.id)}
                  >
                    <div className="product-content-version-head">
                      <span>版本 {historyItems.length - index}</span>
                      {index === 0 ? <em>最新</em> : null}
                    </div>
                    <strong>{formatDate(item.captured_at)}</strong>
                    <small>hash: {formatHash(item.content_hash)}</small>
                    <small>SKU: {item.sku_count ?? '-'}</small>
                  </button>
                ))}
              </div>
            ) : null}

            {activeTab === 'business' ? (
              <div className="product-content-drawer-body">
                {businessItem ? (
                  <>
                    <div className="product-content-detail-metrics">
                      <SummaryCard label="销量" value={formatNumber(businessItem.sales_volume)} />
                      <SummaryCard label="销售额" value={formatCurrency(businessItem.sales_amount_cny, 'CNY')} />
                      <SummaryCard label="均价" value={formatCurrency(businessItem.avg_price_cny, 'CNY')} />
                      <SummaryCard label="毛利率" value={formatPercent(businessItem.estimated_gross_margin)} />
                    </div>
                    <div className="product-content-meta-grid">
                      <span>店铺：{formatText(businessItem.shop_name)}</span>
                      <span>品牌：{formatText(businessItem.brand)}</span>
                      <span>曝光：{formatNumber(businessItem.impressions)}</span>
                      <span>点击：{formatNumber(businessItem.clicks)}</span>
                      <span>转化率：{formatPercent(businessItem.order_conversion_rate)}</span>
                      <span>物流：{formatText(businessItem.shipping_mode)} / {formatText(businessItem.delivery_time)}</span>
                    </div>
                  </>
                ) : (
                  <div className="product-content-empty">当前商品没有经营快照</div>
                )}
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
