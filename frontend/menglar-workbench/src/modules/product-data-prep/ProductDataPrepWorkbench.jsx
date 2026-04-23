import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ProductPrepDescriptionCategorySelect } from './components/ProductPrepDescriptionCategorySelect';
import { ProductPrepFieldBoard } from './components/ProductPrepFieldBoard';
import { ProductPrepBoundaryPanel } from './components/ProductPrepBoundaryPanel';
import { ProductPrepWorkflowPanel } from './components/ProductPrepWorkflowPanel';
import {
  productPrepSafetyRules,
  productPrepWorkflowSteps,
} from './data/productDataPrepPlan';
import { getDescriptionCategorySelection } from './data/descriptionCategoryTree';
import { buildProductPrepFieldViewModel } from './data/productDataPrepFieldViews';
import { productPrepMockCandidates, productPrepMockDrafts } from './mock/productDataPrepMock';
import { fetchOzonCategoryTree } from '../../lib/api';

const OZON_CONNECTION_STORAGE_KEY = 'ozon-upload-connection-v1';

const emptyOzonCredentials = {
  clientId: '',
  apiKey: '',
  baseUrl: '',
};

function loadStoredOzonCredentials() {
  if (typeof window === 'undefined') return emptyOzonCredentials;
  try {
    const raw = window.localStorage.getItem(OZON_CONNECTION_STORAGE_KEY);
    if (!raw) return emptyOzonCredentials;
    const parsed = JSON.parse(raw);
    return {
      clientId: parsed.clientId || '',
      apiKey: parsed.apiKey || '',
      baseUrl: parsed.baseUrl || '',
    };
  } catch {
    return emptyOzonCredentials;
  }
}

function getCategoryTreeStatus({ hasOzonCredentials, categoryTreeQuery }) {
  if (!hasOzonCredentials) return '未连接：请先在 Ozon 批量上货工具里保存 Client ID 和 Api Key';
  if (categoryTreeQuery.isFetching) return '正在连接 Ozon：获取描述类目树中';
  if (categoryTreeQuery.isError) return `连接失败：${categoryTreeQuery.error.message}`;
  if (categoryTreeQuery.data) return '已连接：DescriptionCategoryAPI_GetTree 已返回';
  return '已读取连接配置，等待获取描述类目树';
}

export function ProductDataPrepWorkbench() {
  const activeCandidate = productPrepMockCandidates[0];
  const activeDraft = productPrepMockDrafts[0];
  const [selectedCategoryIndexes, setSelectedCategoryIndexes] = useState([]);
  const ozonCredentials = loadStoredOzonCredentials();
  const hasOzonCredentials = Boolean(ozonCredentials.clientId && ozonCredentials.apiKey);
  const categoryTreeQuery = useQuery({
    queryKey: ['ozon-description-category-tree', ozonCredentials.clientId, ozonCredentials.baseUrl],
    queryFn: () => fetchOzonCategoryTree(ozonCredentials),
    enabled: hasOzonCredentials,
    retry: false,
    staleTime: 10 * 60 * 1000,
  });
  const categorySelection = useMemo(
    () => getDescriptionCategorySelection(categoryTreeQuery.data, selectedCategoryIndexes),
    [categoryTreeQuery.data, selectedCategoryIndexes]
  );
  const displayedDraft = {
    ...activeDraft,
    descriptionCategoryId: categorySelection.descriptionCategoryId ?? activeDraft.descriptionCategoryId,
    typeId: categorySelection.typeId ?? activeDraft.typeId,
  };
  const descriptionCategoryControl = (
    <ProductPrepDescriptionCategorySelect
      treePayload={categoryTreeQuery.data}
      selectedIndexes={selectedCategoryIndexes}
      onSelectedIndexesChange={setSelectedCategoryIndexes}
      disabled={!hasOzonCredentials || categoryTreeQuery.isFetching}
    />
  );
  const { upstreamGroups, downstreamGroups } = buildProductPrepFieldViewModel({
    candidate: activeCandidate,
    draft: displayedDraft,
    descriptionCategoryTreeState: {
      hasCredentials: hasOzonCredentials,
      isLoading: categoryTreeQuery.isFetching,
      error: categoryTreeQuery.error,
      data: categoryTreeQuery.data,
      control: descriptionCategoryControl,
    },
  });
  const readyDraftCount = productPrepMockDrafts.filter((draft) => draft.draftStatus === 'ready').length;
  const categoryTreeStatus = getCategoryTreeStatus({ hasOzonCredentials, categoryTreeQuery });

  return (
    <div className="wb-page product-prep-page">
      <section className="wb-page-hero split">
        <div>
          <p className="wb-kicker">Product Data Prep Module</p>
          <h2>商品数据整理</h2>
          <p>
            页面主体现在先聚焦“字段工作台”：左侧展示上游已拿到的数据，右侧展示整理后准备输送到下游的数据。
            字段数据先用演示样例承载，后面我们可以再逐项把真实生成逻辑补进去。
          </p>
        </div>
        <div className="wb-hero-card wb-hero-card-stack">
          <span className="wb-pill">独立模块</span>
          <strong>{productPrepMockCandidates.length} 个候选样例</strong>
          <small className="cell-sub">
            当前演示候选 #{activeCandidate.id}，{productPrepMockDrafts.length} 个草稿样例里有 {readyDraftCount} 个 ready
          </small>
          <small className="cell-sub">{categoryTreeStatus}</small>
          <button
            className="wb-button ghost"
            disabled={!hasOzonCredentials || categoryTreeQuery.isFetching}
            onClick={() => categoryTreeQuery.refetch()}
          >
            刷新 Ozon 类目树
          </button>
        </div>
      </section>

      <section className="product-prep-dashboard-grid">
        <ProductPrepFieldBoard
          title="上游已拿到的字段"
          subtitle="先把当前能稳定继承的数据清晰摊开，后续做候选导入、字段映射和自动填充时会更顺。"
          tone="upstream"
          groups={upstreamGroups}
        />
        <ProductPrepFieldBoard
          title="下游准备输出的字段"
          subtitle="先把要发往 Ozon 的目标字段展示出来，之后再逐个补生成逻辑、校验和导出。"
          tone="downstream"
          groups={downstreamGroups}
        />
      </section>

      <section className="product-prep-grid">
        <ProductPrepWorkflowPanel steps={productPrepWorkflowSteps} />
        <ProductPrepBoundaryPanel rules={productPrepSafetyRules} />
      </section>
    </div>
  );
}
