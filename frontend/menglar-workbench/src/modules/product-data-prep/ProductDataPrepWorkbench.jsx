import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { ProductPrepDescriptionCategorySelect } from './components/ProductPrepDescriptionCategorySelect';
import { ProductPrepAttributePanel } from './components/ProductPrepAttributePanel';
import { ProductPrepFieldBoard } from './components/ProductPrepFieldBoard';
import { ProductPrepBoundaryPanel } from './components/ProductPrepBoundaryPanel';
import { ProductPrepWorkflowPanel } from './components/ProductPrepWorkflowPanel';
import {
  productPrepSafetyRules,
  productPrepWorkflowSteps,
} from './data/productDataPrepPlan';
import { getDescriptionCategorySelection } from './data/descriptionCategoryTree';
import {
  buildDraftAttributesFromRequirements,
  getAttributeKey,
  getDescriptionCategoryAttributes,
  getDescriptionCategoryAttributeValues,
} from './data/descriptionCategoryAttributes';
import { buildProductPrepFieldViewModel } from './data/productDataPrepFieldViews';
import { productPrepMockCandidates, productPrepMockDrafts } from './mock/productDataPrepMock';
import { fetchProductPrepCandidates } from './api/productDataPrepApi';
import {
  fetchOzonAttributeValues,
  fetchOzonCategoryAttributes,
  fetchOzonCategoryTree,
  OZON_DESCRIPTION_LANGUAGE,
} from '../../lib/api';

const OZON_CONNECTION_STORAGE_KEY = 'ozon-upload-connection-v1';

const emptyOzonCredentials = {
  clientId: '',
  apiKey: '',
  baseUrl: '',
};

const emptyCandidate = {
  id: '暂无',
  sourceJobId: '',
  pageName: '',
  pageType: '',
  finishedAt: '',
  productNormalizedId: '',
  ozonProductId: '',
  productType: '',
  brand: '',
  categoryLevels: [],
  screeningStatus: '',
  sales: null,
  revenue: null,
  estimatedGrossMargin: null,
  impressions: null,
  clicks: null,
  shippingMode: '',
  deliveryTime: '',
  lengthCm: null,
  widthCm: null,
  heightCm: null,
  weightG: null,
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

function getCandidateStatus(candidateQuery) {
  if (candidateQuery.isLoading) return '正在读取本地数据库候选商品';
  if (candidateQuery.isError) return `候选商品读取失败，暂用兜底样例：${candidateQuery.error.message}`;

  const source = candidateQuery.data?.meta?.source;
  const total = candidateQuery.data?.total ?? 0;
  if (source === 'db/menglar-mvp.sqlite') return `已读取 SQLite 候选商品：${total} 条`;
  if (source === 'module-mock-fallback') return '未发现本地 SQLite 数据库，暂用模块兜底样例';
  return '等待候选商品数据';
}

function getAttributeStatus({ hasOzonCredentials, categoryAttributesQuery, attributes }) {
  if (!hasOzonCredentials) return '属性未查询：缺少 Ozon 连接配置';
  if (categoryAttributesQuery.isFetching) return '正在查询类目属性：DescriptionCategoryAPI_GetAttributes';
  if (categoryAttributesQuery.isError) return `属性查询失败：${categoryAttributesQuery.error.message}`;
  if (categoryAttributesQuery.data) {
    const requiredCount = attributes.filter((attribute) => attribute.isRequired).length;
    return `已查询类目属性：${attributes.length} 个属性，${requiredCount} 个必填`;
  }
  return '等待选择 description_category_id 和 type_id 后查询属性';
}

export function ProductDataPrepWorkbench() {
  const [selectedCategoryIndexes, setSelectedCategoryIndexes] = useState([]);
  const [attributeFormValues, setAttributeFormValues] = useState({});
  const candidateQuery = useQuery({
    queryKey: ['product-data-prep-candidates'],
    queryFn: () => fetchProductPrepCandidates({ limit: 20 }),
    retry: false,
    staleTime: 60 * 1000,
  });
  const ozonCredentials = loadStoredOzonCredentials();
  const hasOzonCredentials = Boolean(ozonCredentials.clientId && ozonCredentials.apiKey);
  const categoryTreeQuery = useQuery({
    queryKey: ['ozon-description-category-tree', ozonCredentials.clientId, ozonCredentials.baseUrl, OZON_DESCRIPTION_LANGUAGE],
    queryFn: () => fetchOzonCategoryTree({
      ...ozonCredentials,
      language: OZON_DESCRIPTION_LANGUAGE,
    }),
    enabled: hasOzonCredentials,
    retry: false,
    staleTime: 10 * 60 * 1000,
  });

  const candidatePayloadItems = Array.isArray(candidateQuery.data?.items) ? candidateQuery.data.items : [];
  const hasDbCandidatePayload = candidateQuery.data?.meta?.source === 'db/menglar-mvp.sqlite';
  const candidateItems = candidatePayloadItems.length
    ? candidatePayloadItems
    : hasDbCandidatePayload
      ? []
      : productPrepMockCandidates;
  const activeCandidate = candidateItems[0] || emptyCandidate;
  const activeDraft = productPrepMockDrafts[0];
  const categorySelection = useMemo(
    () => getDescriptionCategorySelection(categoryTreeQuery.data, selectedCategoryIndexes),
    [categoryTreeQuery.data, selectedCategoryIndexes]
  );
  const resolvedDescriptionCategoryId = categorySelection.descriptionCategoryId ?? activeDraft.descriptionCategoryId;
  const resolvedTypeId = categorySelection.typeId ?? activeDraft.typeId;
  const attributeQuerySelection = {
    descriptionCategoryId: resolvedDescriptionCategoryId,
    typeId: resolvedTypeId,
    path: categorySelection.path,
    source: categorySelection.isComplete ? 'category-selector' : 'draft-default',
  };
  const categoryAttributesQuery = useQuery({
    queryKey: [
      'ozon-description-category-attributes',
      ozonCredentials.clientId,
      ozonCredentials.baseUrl,
      OZON_DESCRIPTION_LANGUAGE,
      resolvedDescriptionCategoryId,
      resolvedTypeId,
    ],
    queryFn: () => fetchOzonCategoryAttributes({
      ...ozonCredentials,
      language: OZON_DESCRIPTION_LANGUAGE,
      descriptionCategoryId: resolvedDescriptionCategoryId,
      typeId: resolvedTypeId,
    }),
    enabled: hasOzonCredentials && Boolean(resolvedDescriptionCategoryId && resolvedTypeId),
    retry: false,
    staleTime: 10 * 60 * 1000,
  });
  const attributes = useMemo(
    () => getDescriptionCategoryAttributes(categoryAttributesQuery.data),
    [categoryAttributesQuery.data]
  );
  const requiredDictionaryAttributes = useMemo(
    () => attributes.filter((attribute) => attribute.isRequired && attribute.dictionaryId),
    [attributes]
  );
  const attributeValueQueries = useQueries({
    queries: requiredDictionaryAttributes.map((attribute) => ({
      queryKey: [
        'ozon-description-category-attribute-values',
        ozonCredentials.clientId,
        ozonCredentials.baseUrl,
        OZON_DESCRIPTION_LANGUAGE,
        resolvedDescriptionCategoryId,
        resolvedTypeId,
        attribute.id,
      ],
      queryFn: () => fetchOzonAttributeValues({
        ...ozonCredentials,
        language: OZON_DESCRIPTION_LANGUAGE,
        descriptionCategoryId: resolvedDescriptionCategoryId,
        typeId: resolvedTypeId,
        attributeId: attribute.id,
        limit: 50,
      }),
      enabled: hasOzonCredentials && Boolean(resolvedDescriptionCategoryId && resolvedTypeId),
      retry: false,
      staleTime: 10 * 60 * 1000,
    })),
  });

  useEffect(() => {
    setAttributeFormValues({});
  }, [resolvedDescriptionCategoryId, resolvedTypeId]);

  const attributeValuesByKey = useMemo(() => {
    const entries = requiredDictionaryAttributes.map((attribute, index) => [
      getAttributeKey(attribute),
      getDescriptionCategoryAttributeValues(attributeValueQueries[index]?.data),
    ]);
    return Object.fromEntries(entries);
  }, [attributeValueQueries, requiredDictionaryAttributes]);
  const attributeValueQueriesByKey = useMemo(() => {
    const entries = requiredDictionaryAttributes.map((attribute, index) => [
      getAttributeKey(attribute),
      attributeValueQueries[index],
    ]);
    return Object.fromEntries(entries);
  }, [attributeValueQueries, requiredDictionaryAttributes]);
  const displayedAttributes = useMemo(
    () => buildDraftAttributesFromRequirements({
      attributes,
      draftAttributes: activeDraft.attributes,
      formValues: attributeFormValues,
    }),
    [activeDraft.attributes, attributeFormValues, attributes]
  );
  const displayedDraft = {
    ...activeDraft,
    sourceJobId: activeCandidate.sourceJobId || activeDraft.sourceJobId,
    productNormalizedId: activeCandidate.productNormalizedId || activeDraft.productNormalizedId,
    vendor: activeDraft.vendor || activeCandidate.brand || '',
    descriptionCategoryId: resolvedDescriptionCategoryId,
    typeId: resolvedTypeId,
    attributes: displayedAttributes,
  };
  const descriptionCategoryControl = (
    <ProductPrepDescriptionCategorySelect
      treePayload={categoryTreeQuery.data}
      selectedIndexes={selectedCategoryIndexes}
      onSelectedIndexesChange={setSelectedCategoryIndexes}
      disabled={!hasOzonCredentials || categoryTreeQuery.isFetching}
    />
  );
  const attributeControl = (
    <ProductPrepAttributePanel
      attributes={attributes}
      attributeValuesByKey={attributeValuesByKey}
      attributeValueQueriesByKey={attributeValueQueriesByKey}
      draftAttributes={displayedAttributes}
      formValues={attributeFormValues}
      onFormValueChange={(attributeKey, nextValue) => {
        setAttributeFormValues((current) => ({
          ...current,
          [attributeKey]: nextValue,
        }));
      }}
      hasCredentials={hasOzonCredentials}
      selection={attributeQuerySelection}
      isLoading={categoryAttributesQuery.isFetching}
      error={categoryAttributesQuery.error}
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
    descriptionCategoryAttributeState: {
      hasCredentials: hasOzonCredentials,
      isLoading: categoryAttributesQuery.isFetching,
      error: categoryAttributesQuery.error,
      data: categoryAttributesQuery.data,
      attributes,
      control: attributeControl,
    },
  });
  const readyDraftCount = productPrepMockDrafts.filter((draft) => draft.draftStatus === 'ready').length;
  const categoryTreeStatus = getCategoryTreeStatus({ hasOzonCredentials, categoryTreeQuery });
  const attributeStatus = getAttributeStatus({ hasOzonCredentials, categoryAttributesQuery, attributes });
  const candidateStatus = getCandidateStatus(candidateQuery);
  const candidateTotal = candidateQuery.data?.total ?? candidateItems.length;

  return (
    <div className="wb-page product-prep-page">
      <section className="wb-page-hero split">
        <div>
          <p className="wb-kicker">Product Data Prep Module</p>
          <h2>商品数据整理</h2>
          <p>
            页面主体现在先做焦点“字段工作台”：左侧展示上游已经拿到的数据库字段，
            右侧展示整理后准备发送到下游的字段。候选商品优先从本地 SQLite 读取，
            Ozon 类目属性会根据当前 description_category_id 和 type_id 动态查询。
          </p>
        </div>
        <div className="wb-hero-card wb-hero-card-stack">
          <span className="wb-pill">独立模块</span>
          <strong>{candidateTotal} 个候选商品</strong>
          <small className="cell-sub">
            当前候选 #{activeCandidate.id}，{productPrepMockDrafts.length} 个草稿样例里有 {readyDraftCount} 个 ready
          </small>
          <small className="cell-sub">{candidateStatus}</small>
          <small className="cell-sub">{categoryTreeStatus}</small>
          <small className="cell-sub">{attributeStatus}</small>
          <button
            className="wb-button ghost"
            disabled={!hasOzonCredentials || categoryTreeQuery.isFetching}
            onClick={() => {
              categoryTreeQuery.refetch();
              categoryAttributesQuery.refetch();
            }}
          >
            刷新 Ozon 类目与属性
          </button>
        </div>
      </section>

      <section className="product-prep-dashboard-grid">
        <ProductPrepFieldBoard
          title="上游已拿到的字段"
          subtitle="这里会读取 /api/product-data-prep/candidates，后端再映射 source_jobs 和 products_normalized。"
          tone="upstream"
          groups={upstreamGroups}
        />
        <ProductPrepFieldBoard
          title="下游准备输出的字段"
          subtitle="Ozon attributes 会按官方类目属性接口动态展示必填项、字典值和当前将下发的内容。"
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
