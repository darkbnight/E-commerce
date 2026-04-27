import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Panel } from '../components/Panel';
import {
  fetchProductBusinessLatest,
  fetchProductContent,
  fetchProductContentSkus,
} from '../lib/api';
import { formatCurrency, formatNumber, formatPercent, formatText } from '../lib/format';

const defaultSearch = {
  platform: 'ozon',
  productId: '',
};

const demoProducts = [
  {
    productId: 'demo-content-ornament-001',
    label: '挂饰套装',
    description: '2 个内容版本，适合先看版本切换效果',
  },
  {
    productId: 'demo-content-organizer-002',
    label: '收纳盒',
    description: '单版本多图，适合核对主图与多图展示',
  },
  {
    productId: 'demo-content-kitchen-003',
    label: '厨房用品',
    description: '多 SKU 图片与价格映射示例',
  },
];

function readSearch(searchParams) {
  return {
    platform: searchParams.get('platform') || 'ozon',
    productId: searchParams.get('productId') || '',
  };
}

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

function buildSubmittedKey(filters) {
  return `${filters.platform}:${filters.productId.trim()}`;
}

async function copyText(value, setFeedback) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(String(value));
    setFeedback(`已复制：${value}`);
  } catch {
    setFeedback('复制失败，请检查浏览器剪贴板权限');
  }
}

function CopyPill({ label, value, onCopy }) {
  return (
    <button type="button" className="product-content-copy-pill" onClick={() => onCopy(value)}>
      <span>{label}</span>
      <strong>{formatText(value)}</strong>
    </button>
  );
}

export function ProductContentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => readSearch(searchParams));
  const [submittedFilters, setSubmittedFilters] = useState(() => readSearch(searchParams));
  const [selectedContentId, setSelectedContentId] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState('');

  const hasQuery = Boolean(submittedFilters.productId.trim());
  const submittedKey = buildSubmittedKey(submittedFilters);

  useEffect(() => {
    const next = new URLSearchParams();
    if (submittedFilters.platform) next.set('platform', submittedFilters.platform);
    if (submittedFilters.productId) next.set('productId', submittedFilters.productId);
    setSearchParams(next, { replace: true });
  }, [submittedFilters, setSearchParams]);

  useEffect(() => {
    if (!copyFeedback) return undefined;
    const timer = window.setTimeout(() => setCopyFeedback(''), 1800);
    return () => window.clearTimeout(timer);
  }, [copyFeedback]);

  const latestQuery = useQuery({
    queryKey: ['product-content', 'latest', submittedKey],
    queryFn: () => fetchProductContent({
      platform: submittedFilters.platform,
      productId: submittedFilters.productId.trim(),
      latest: true,
    }),
    enabled: hasQuery,
  });

  const historyQuery = useQuery({
    queryKey: ['product-content', 'history', submittedKey],
    queryFn: () => fetchProductContent({
      platform: submittedFilters.platform,
      productId: submittedFilters.productId.trim(),
      latest: false,
    }),
    enabled: hasQuery,
  });

  const businessQuery = useQuery({
    queryKey: ['product-business-latest', submittedKey],
    queryFn: () => fetchProductBusinessLatest({
      platform: submittedFilters.platform,
      productId: submittedFilters.productId.trim(),
    }),
    enabled: hasQuery,
  });

  const historyItems = historyQuery.data?.items || [];
  const latestItem = latestQuery.data?.item || null;
  const businessItem = businessQuery.data?.item || null;

  useEffect(() => {
    if (!historyItems.length) {
      setSelectedContentId(null);
      return;
    }
    setSelectedContentId((current) => {
      if (current && historyItems.some((item) => item.id === current)) {
        return current;
      }
      return historyItems[0].id;
    });
  }, [historyItems]);

  const selectedHistoryItem = useMemo(
    () => historyItems.find((item) => item.id === selectedContentId) || null,
    [historyItems, selectedContentId],
  );

  const skusQuery = useQuery({
    queryKey: ['product-content-skus', selectedContentId],
    queryFn: () => fetchProductContentSkus(selectedContentId),
    enabled: Boolean(selectedContentId) && selectedContentId !== latestItem?.id,
  });

  const selectedItem = selectedHistoryItem || latestItem;
  const selectedSkus = selectedContentId === latestItem?.id
    ? (latestQuery.data?.skus || [])
    : (skusQuery.data?.skus || []);
  const isInitialLoading = hasQuery && (latestQuery.isLoading || historyQuery.isLoading);
  const isMissing = hasQuery && !isInitialLoading && !latestItem;

  const metricCards = [
    { label: '最新采集', value: selectedItem ? formatDate(selectedItem.captured_at) : '-' },
    { label: '历史版本', value: String(historyQuery.data?.total || 0) },
    { label: '当前 SKU 数', value: String(selectedSkus.length) },
  ];

  const contentSummaryCards = selectedItem ? [
    { label: '标题长度', value: String((selectedItem.title || '').length) },
    { label: '标签数量', value: String((selectedItem.tags || []).length) },
    { label: '图片数量', value: String((selectedItem.image_urls || []).length) },
    { label: 'SKU 数量', value: String(selectedSkus.length) },
  ] : [];

  const businessCards = businessItem ? [
    { label: '销量', value: formatNumber(businessItem.sales_volume) },
    { label: '销售额', value: formatCurrency(businessItem.sales_amount_cny, 'CNY') },
    { label: '均价', value: formatCurrency(businessItem.avg_price_cny, 'CNY') },
    { label: '毛利率', value: formatPercent(businessItem.estimated_gross_margin) },
  ] : [];

  const submitSearch = (event) => {
    event.preventDefault();
    setSubmittedFilters({
      platform: filters.platform || 'ozon',
      productId: filters.productId.trim(),
    });
  };

  const resetSearch = () => {
    setFilters(defaultSearch);
    setSubmittedFilters(defaultSearch);
    setSelectedContentId(null);
  };

  const applyDemo = (productId) => {
    const next = {
      platform: 'ozon',
      productId,
    };
    setFilters(next);
    setSubmittedFilters(next);
  };

  return (
    <div className="wb-page product-content-page">
      <section className="wb-page-hero product-content-hero">
        <div className="product-content-hero-main">
          <p className="wb-kicker">Content QA</p>
          <h2>商品内容资产</h2>
          <p>
            这个页面专门用来核对内容版本，不混入经营快照。重点看 4 件事：标题描述是否正确、标签是否合理、
            图片是否齐全、SKU 与价格图片的映射是否稳定。
          </p>
          <div className="product-content-demo-strip">
            {demoProducts.map((demo) => (
              <button key={demo.productId} type="button" onClick={() => applyDemo(demo.productId)}>
                <strong>{demo.label}</strong>
                <span>{demo.productId}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="product-content-hero-side">
          {metricCards.map((card) => (
            <article key={card.label} className="wb-hero-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          ))}
        </div>
      </section>

      <Panel
        title="内容资产检索"
        subtitle="围绕 platform + platform_product_id 查询内容版本；下方 3 个示例商品已写入当前数据库"
      >
        <form className="wb-filter-grid product-content-search-grid" onSubmit={submitSearch}>
          <label className="wb-field">
            <span>平台</span>
            <select
              value={filters.platform}
              onChange={(event) => setFilters((current) => ({ ...current, platform: event.target.value }))}
            >
              <option value="ozon">ozon</option>
            </select>
          </label>

          <label className="wb-field wb-field-span-2">
            <span>平台商品 ID</span>
            <input
              value={filters.productId}
              onChange={(event) => setFilters((current) => ({ ...current, productId: event.target.value }))}
              placeholder="例如 demo-content-ornament-001"
            />
          </label>

          <div className="wb-inline-actions product-content-search-actions">
            <button className="wb-button wb-button-primary" type="submit">查询内容资产</button>
            <button className="wb-button ghost" type="button" onClick={resetSearch}>重置</button>
          </div>
        </form>
      </Panel>

      {latestQuery.isError ? <div className="wb-feedback is-error">读取最新内容资产失败：{latestQuery.error.message}</div> : null}
      {historyQuery.isError ? <div className="wb-feedback is-error">读取历史版本失败：{historyQuery.error.message}</div> : null}
      {skusQuery.isError ? <div className="wb-feedback is-error">读取 SKU 资产失败：{skusQuery.error.message}</div> : null}
      {businessQuery.isError ? <div className="wb-feedback is-error">读取经营快照失败：{businessQuery.error.message}</div> : null}
      {copyFeedback ? <div className="wb-feedback">{copyFeedback}</div> : null}
      {isInitialLoading ? <div className="wb-feedback is-busy">正在读取商品内容资产和版本历史...</div> : null}

      {!hasQuery ? (
        <Panel title="示例商品" subtitle="直接点击即可查看页面效果，不需要自己先准备数据">
          <div className="product-content-demo-grid">
            {demoProducts.map((demo) => (
              <button
                key={demo.productId}
                type="button"
                className="product-content-demo-card"
                onClick={() => applyDemo(demo.productId)}
              >
                <strong>{demo.label}</strong>
                <span>{demo.productId}</span>
                <small>{demo.description}</small>
              </button>
            ))}
          </div>
        </Panel>
      ) : null}

      {isMissing ? (
        <Panel title="查询结果" subtitle={`未找到 ${submittedFilters.platform} / ${submittedFilters.productId} 的内容资产`}>
          <div className="product-content-empty">
            <strong>没有内容资产数据</strong>
            <p>当前商品还没有写入 `product_content_assets`，或者平台商品 ID 输入不正确。</p>
          </div>
        </Panel>
      ) : null}

      {hasQuery && selectedItem ? (
        <div className="product-content-layout">
          <Panel
            title="版本列表"
            subtitle={`当前商品共 ${historyQuery.data?.total || 0} 个内容版本，最新版本默认排在最上面`}
          >
            <div className="product-content-version-list">
              {historyItems.map((item, index) => {
                const isActive = item.id === selectedItem.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`product-content-version-card ${isActive ? 'is-active' : ''}`}
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
                );
              })}
            </div>
          </Panel>

          <div className="product-content-main-column">
            <Panel
              title="内容概览"
              subtitle={`当前查看 ${selectedItem.platform} / ${selectedItem.platform_product_id}`}
            >
              <div className="product-content-summary-grid">
                {contentSummaryCards.map((card) => (
                  <article key={card.label} className="product-content-summary-card">
                    <span>{card.label}</span>
                    <strong>{card.value}</strong>
                  </article>
                ))}
              </div>

              <div className="product-content-copy-row">
                <CopyPill label="商品 ID" value={selectedItem.platform_product_id} onCopy={(value) => copyText(value, setCopyFeedback)} />
                <CopyPill label="内容哈希" value={selectedItem.content_hash} onCopy={(value) => copyText(value, setCopyFeedback)} />
                <CopyPill label="版本 ID" value={selectedItem.id} onCopy={(value) => copyText(value, setCopyFeedback)} />
              </div>

              <div className="product-content-detail">
                <div className="product-content-meta-strip">
                  <span>平台：{formatText(selectedItem.platform)}</span>
                  <span>商品 ID：{formatText(selectedItem.platform_product_id)}</span>
                  <span>采集时间：{formatDate(selectedItem.captured_at)}</span>
                  <span>内容哈希：{formatText(selectedItem.content_hash)}</span>
                </div>

                <section className="product-content-section">
                  <small>标题</small>
                  <h3>{formatText(selectedItem.title)}</h3>
                </section>

                <section className="product-content-section">
                  <small>描述</small>
                  <p>{formatText(selectedItem.description)}</p>
                </section>

                <section className="product-content-section">
                  <small>标签</small>
                  <div className="product-content-tag-list">
                    {(selectedItem.tags || []).length ? (selectedItem.tags || []).map((tag) => (
                      <span key={String(tag)}>{String(tag)}</span>
                    )) : <em>暂无标签</em>}
                  </div>
                </section>
              </div>
            </Panel>

            <Panel title="经营快照" subtitle="补看这个商品最近一次经营表现，便于判断内容核对优先级">
              {businessItem ? (
                <div className="product-content-business-block">
                  <div className="product-content-summary-grid">
                    {businessCards.map((card) => (
                      <article key={card.label} className="product-content-summary-card">
                        <span>{card.label}</span>
                        <strong>{card.value}</strong>
                      </article>
                    ))}
                  </div>
                  <div className="product-content-business-meta">
                    <span>店铺：{formatText(businessItem.shop_name)}</span>
                    <span>品牌：{formatText(businessItem.brand)}</span>
                    <span>曝光：{formatNumber(businessItem.impressions)}</span>
                    <span>点击：{formatNumber(businessItem.clicks)}</span>
                    <span>转化率：{formatPercent(businessItem.order_conversion_rate)}</span>
                    <span>物流：{formatText(businessItem.shipping_mode)} / {formatText(businessItem.delivery_time)}</span>
                  </div>
                </div>
              ) : (
                <div className="product-content-empty">
                  <strong>当前商品没有经营快照</strong>
                  <p>内容资产已存在，但还没有关联到 `product_business_snapshots` 的最近经营记录。</p>
                </div>
              )}
            </Panel>

            <div className="product-content-asset-grid">
              <Panel title="主图" subtitle="当前内容版本的主展示图">
                {selectedItem.main_image_url ? (
                  <img
                    className="product-content-main-image"
                    src={selectedItem.main_image_url}
                    alt={selectedItem.title || selectedItem.platform_product_id}
                    loading="lazy"
                  />
                ) : (
                  <div className="product-content-image-empty">暂无主图</div>
                )}
              </Panel>

              <Panel title="图片画廊" subtitle="当前内容版本的多图列表">
                <div className="product-content-gallery">
                  {(selectedItem.image_urls || []).length ? (selectedItem.image_urls || []).map((url, index) => (
                    <img
                      key={`${selectedItem.id}-image-${index}`}
                      src={url}
                      alt=""
                      loading="lazy"
                    />
                  )) : <div className="product-content-image-empty">暂无多图</div>}
                </div>
              </Panel>
            </div>

            <Panel title="SKU 资产" subtitle="当前版本下的 SKU 图片、价格与平台 SKU ID">
              <div className="product-content-sku-list">
                {selectedSkus.length ? selectedSkus.map((sku) => (
                  <article key={sku.id} className="product-content-sku-card">
                    <div className="product-content-sku-head">
                      <div>
                        <small>SKU 名称</small>
                        <strong>{formatText(sku.sku_name)}</strong>
                      </div>
                      <div className="product-content-sku-price">
                        <small>价格</small>
                        <strong>{formatCurrency(sku.price, sku.currency_code || 'CNY')}</strong>
                      </div>
                    </div>
                    <div className="product-content-sku-copy-row">
                      <CopyPill label="SKU ID" value={sku.platform_sku_id} onCopy={(value) => copyText(value, setCopyFeedback)} />
                      <CopyPill label="排序" value={sku.sort_order} onCopy={(value) => copyText(value, setCopyFeedback)} />
                    </div>
                    <div className="product-content-sku-meta">
                      <span>采集时间：{formatDate(sku.captured_at)}</span>
                      <span>图片数：{sku.images?.length || 0}</span>
                    </div>
                    <div className="product-content-sku-images">
                      {sku.images?.length ? sku.images.map((url, index) => (
                        <div key={`${sku.id}-${index}`} className="product-content-sku-image-card">
                          <img src={url} alt="" loading="lazy" />
                          <small>图 {index + 1}</small>
                        </div>
                      )) : <div className="product-content-image-empty">暂无 SKU 图片</div>}
                    </div>
                  </article>
                )) : (
                  <div className="product-content-empty">
                    <strong>当前版本没有 SKU 数据</strong>
                    <p>如果内容版本存在但 SKU 为空，说明该版本尚未写入 `product_content_skus`。</p>
                  </div>
                )}
              </div>
            </Panel>
          </div>
        </div>
      ) : null}
    </div>
  );
}
