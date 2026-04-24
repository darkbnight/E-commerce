import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Panel } from '../../components/Panel';
import { ProductPrepDescriptionCategorySelect } from './components/ProductPrepDescriptionCategorySelect';
import { ProductPrepAttributePanel } from './components/ProductPrepAttributePanel';
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
import { productPrepMockCandidates } from './mock/productDataPrepMock';
import {
  createProductPrepDraft,
  fetchProductPrepCandidates,
  fetchProductPrepDrafts,
  updateProductPrepDraft,
  validateProductPrepDraft,
} from './api/productDataPrepApi';
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

const emptyDraftForm = {
  id: null,
  resultKey: '',
  draftId: null,
  sourceJobId: null,
  sourceSnapshotId: null,
  productNormalizedId: null,
  platform: 'ozon',
  platformProductId: '',
  ozonProductId: '',
  offerId: '',
  name: '',
  description: '',
  descriptionCategoryId: null,
  typeId: null,
  vendor: '',
  modelName: '',
  barcode: '',
  price: '',
  oldPrice: '',
  premiumPrice: '',
  minPrice: '',
  currencyCode: '',
  vat: '',
  warehouseId: '',
  stock: 0,
  packageDepthMm: null,
  packageWidthMm: null,
  packageHeightMm: null,
  packageWeightG: null,
  images: [],
  attributes: [],
  draftStatus: 'draft',
  resultStatus: 'draft',
};

function toNumberOrNull(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeImages(images = []) {
  return (Array.isArray(images) ? images : []).map((image, index) => {
    if (typeof image === 'string') {
      return {
        url: image,
        sortOrder: index + 1,
        isMain: index === 0,
      };
    }

    return {
      url: image?.url || '',
      sortOrder: Number(image?.sortOrder ?? index + 1),
      isMain: Boolean(image?.isMain ?? index === 0),
    };
  });
}

function buildDraftFromCandidate(candidate) {
  return {
    ...emptyDraftForm,
    sourceJobId: candidate?.sourceJobId ?? null,
    sourceSnapshotId: candidate?.sourceSnapshotId ?? candidate?.productNormalizedId ?? null,
    productNormalizedId: candidate?.productNormalizedId ?? null,
    platform: candidate?.platform || 'ozon',
    platformProductId: candidate?.platformProductId || candidate?.ozonProductId || '',
    ozonProductId: candidate?.ozonProductId || candidate?.platformProductId || '',
    name: candidate?.title || '',
    vendor: candidate?.brand || '',
    packageDepthMm: candidate?.lengthCm == null ? null : Math.round(Number(candidate.lengthCm) * 10),
    packageWidthMm: candidate?.widthCm == null ? null : Math.round(Number(candidate.widthCm) * 10),
    packageHeightMm: candidate?.heightCm == null ? null : Math.round(Number(candidate.heightCm) * 10),
    packageWeightG: candidate?.weightG ?? null,
  };
}

function normalizeDraftForm(draft, candidate) {
  const base = draft || buildDraftFromCandidate(candidate);
  const status = base.resultStatus || base.draftStatus || 'draft';

  return {
    ...emptyDraftForm,
    ...base,
    descriptionCategoryId: toNumberOrNull(base.descriptionCategoryId),
    typeId: toNumberOrNull(base.typeId),
    warehouseId: base.warehouseId == null ? '' : String(base.warehouseId),
    stock: base.stock == null ? 0 : Number(base.stock),
    packageDepthMm: toNumberOrNull(base.packageDepthMm),
    packageWidthMm: toNumberOrNull(base.packageWidthMm),
    packageHeightMm: toNumberOrNull(base.packageHeightMm),
    packageWeightG: toNumberOrNull(base.packageWeightG),
    images: normalizeImages(base.images),
    attributes: Array.isArray(base.attributes) ? base.attributes : [],
    draftStatus: status,
    resultStatus: status,
  };
}

function buildCandidateKey(candidate) {
  const sourceJobId = candidate?.sourceJobId ?? 'no-job';
  const sourceProductId = candidate?.sourceSnapshotId
    ?? candidate?.productNormalizedId
    ?? candidate?.platformProductId
    ?? candidate?.ozonProductId
    ?? candidate?.id
    ?? 'no-product';
  return `${sourceJobId}:${sourceProductId}`;
}

function findDraftForCandidate(candidate, drafts) {
  if (!candidate) return null;

  const candidateKey = buildCandidateKey(candidate);
  const candidateSourceJobId = candidate.sourceJobId == null ? null : Number(candidate.sourceJobId);
  const candidateSourceSnapshotId = candidate.sourceSnapshotId == null ? null : Number(candidate.sourceSnapshotId);
  const candidateProductNormalizedId = candidate.productNormalizedId == null ? null : Number(candidate.productNormalizedId);

  return drafts.find((draft) => {
    if (draft.resultKey === candidateKey) return true;
    if (candidateSourceJobId == null || Number(draft.sourceJobId) !== candidateSourceJobId) return false;
    if (candidateSourceSnapshotId != null && Number(draft.sourceSnapshotId) === candidateSourceSnapshotId) return true;
    return candidateProductNormalizedId != null && Number(draft.productNormalizedId) === candidateProductNormalizedId;
  }) || null;
}

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

function getStatusLabel(status) {
  const labels = {
    draft: '草稿',
    invalid: '未通过',
    ready: '已就绪',
    missing: '未建草稿',
  };
  return labels[status] || status || '草稿';
}

function getCandidateTitle(candidate) {
  return candidate?.title || candidate?.platformProductId || candidate?.ozonProductId || `候选 #${candidate?.id}`;
}

function getCategoryTreeStatus({ hasOzonCredentials, categoryTreeQuery }) {
  if (!hasOzonCredentials) return '尚未保存 Ozon 连接配置';
  if (categoryTreeQuery.isFetching) return '正在读取 Ozon 类目树';
  if (categoryTreeQuery.isError) return `Ozon 类目树读取失败：${categoryTreeQuery.error.message}`;
  if (categoryTreeQuery.data) return 'Ozon 类目树已读取';
  return '已读取 Ozon 连接配置';
}

function getIssueSummary(issues = []) {
  return {
    errors: issues.filter((issue) => issue.level === 'error'),
    warnings: issues.filter((issue) => issue.level !== 'error'),
  };
}

function Field({ label, children }) {
  return (
    <label className="product-prep-edit-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function IssueList({ issues = [] }) {
  const { errors, warnings } = getIssueSummary(issues);

  if (!issues.length) {
    return (
      <div className="product-prep-validation-empty">
        保存或校验草稿后，这里会显示字段问题。
      </div>
    );
  }

  return (
    <div className="product-prep-issue-list">
      <div className="product-prep-validation-summary">
        <span className={errors.length ? 'is-error' : 'is-ok'}>{errors.length} 个错误</span>
        <span>{warnings.length} 个警告</span>
      </div>
      {issues.map((issue, index) => (
        <article className={`product-prep-issue is-${issue.level}`} key={`${issue.field}-${index}`}>
          <strong>{issue.field}</strong>
          <span>{issue.message}</span>
        </article>
      ))}
    </div>
  );
}

export function ProductDataPrepWorkbench() {
  const queryClient = useQueryClient();
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [selectedDraftId, setSelectedDraftId] = useState(null);
  const [draftForm, setDraftForm] = useState(emptyDraftForm);
  const [selectedCategoryIndexes, setSelectedCategoryIndexes] = useState([]);
  const [attributeFormValues, setAttributeFormValues] = useState({});
  const [lastIssues, setLastIssues] = useState([]);

  const candidateQuery = useQuery({
    queryKey: ['product-data-prep-candidates'],
    queryFn: () => fetchProductPrepCandidates({ limit: 50 }),
    retry: false,
    staleTime: 60 * 1000,
  });
  const draftsQuery = useQuery({
    queryKey: ['product-data-prep-drafts'],
    queryFn: () => fetchProductPrepDrafts({ limit: 200 }),
    retry: false,
    staleTime: 20 * 1000,
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
  const hasDbCandidatePayload = candidateQuery.data?.meta?.source === 'db/ecommerce-workbench.sqlite';
  const candidates = candidatePayloadItems.length
    ? candidatePayloadItems
    : hasDbCandidatePayload
      ? []
      : productPrepMockCandidates;
  const drafts = Array.isArray(draftsQuery.data?.items) ? draftsQuery.data.items : [];
  const activeCandidate = candidates.find((candidate) => String(candidate.id) === String(selectedCandidateId)) || candidates[0] || null;
  const existingDraft = selectedDraftId
    ? drafts.find((draft) => Number(draft.id) === Number(selectedDraftId))
    : findDraftForCandidate(activeCandidate, drafts);

  const categorySelection = useMemo(
    () => getDescriptionCategorySelection(categoryTreeQuery.data, selectedCategoryIndexes),
    [categoryTreeQuery.data, selectedCategoryIndexes]
  );
  const resolvedDescriptionCategoryId = categorySelection.descriptionCategoryId ?? draftForm.descriptionCategoryId;
  const resolvedTypeId = categorySelection.typeId ?? draftForm.typeId;
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
    if (!selectedCandidateId && candidates[0]) {
      setSelectedCandidateId(candidates[0].id);
    }
  }, [candidates, selectedCandidateId]);

  useEffect(() => {
    setDraftForm(normalizeDraftForm(existingDraft, activeCandidate));
    setSelectedDraftId(existingDraft?.id || null);
    setLastIssues([]);
    setAttributeFormValues({});
    setSelectedCategoryIndexes([]);
  }, [activeCandidate?.id, existingDraft?.id]);

  useEffect(() => {
    if (!categorySelection.isComplete) return;
    setDraftForm((current) => ({
      ...current,
      descriptionCategoryId: categorySelection.descriptionCategoryId,
      typeId: categorySelection.typeId,
    }));
  }, [categorySelection.descriptionCategoryId, categorySelection.isComplete, categorySelection.typeId]);

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
      draftAttributes: draftForm.attributes,
      formValues: attributeFormValues,
    }),
    [attributeFormValues, attributes, draftForm.attributes]
  );
  const displayedDraft = {
    ...draftForm,
    sourceJobId: activeCandidate?.sourceJobId ?? draftForm.sourceJobId,
    sourceSnapshotId: activeCandidate?.sourceSnapshotId ?? activeCandidate?.productNormalizedId ?? draftForm.sourceSnapshotId,
    productNormalizedId: activeCandidate?.productNormalizedId ?? draftForm.productNormalizedId,
    platform: activeCandidate?.platform || draftForm.platform || 'ozon',
    platformProductId: activeCandidate?.platformProductId || activeCandidate?.ozonProductId || draftForm.platformProductId || '',
    ozonProductId: activeCandidate?.ozonProductId || activeCandidate?.platformProductId || draftForm.ozonProductId || '',
    descriptionCategoryId: resolvedDescriptionCategoryId,
    typeId: resolvedTypeId,
    attributes: displayedAttributes,
  };

  const createDraftMutation = useMutation({
    mutationFn: (candidateId) => createProductPrepDraft({ candidateId }),
    onSuccess: (payload) => {
      queryClient.invalidateQueries({ queryKey: ['product-data-prep-drafts'] });
      if (payload?.item) {
        setSelectedDraftId(payload.item.id);
        setDraftForm(normalizeDraftForm(payload.item, activeCandidate));
      }
    },
  });
  const saveDraftMutation = useMutation({
    mutationFn: ({ requestedStatus = 'draft' } = {}) => updateProductPrepDraft(displayedDraft.id, {
      ...displayedDraft,
      draftStatus: requestedStatus,
      resultStatus: requestedStatus,
    }),
    onSuccess: (payload) => {
      queryClient.invalidateQueries({ queryKey: ['product-data-prep-drafts'] });
      if (payload?.item) {
        setDraftForm(normalizeDraftForm(payload.item, activeCandidate));
        setSelectedDraftId(payload.item.id);
      }
      setLastIssues(Array.isArray(payload?.issues) ? payload.issues : []);
    },
  });
  const validateDraftMutation = useMutation({
    mutationFn: () => validateProductPrepDraft(displayedDraft.id),
    onSuccess: (payload) => {
      queryClient.invalidateQueries({ queryKey: ['product-data-prep-drafts'] });
      if (payload?.item) {
        setDraftForm(normalizeDraftForm(payload.item, activeCandidate));
      }
      setLastIssues(Array.isArray(payload?.issues) ? payload.issues : []);
    },
  });

  const candidateStatus = candidateQuery.isLoading
    ? '正在读取候选商品'
    : `${candidates.length} 个候选商品`;
  const categoryTreeStatus = getCategoryTreeStatus({ hasOzonCredentials, categoryTreeQuery });
  const currentStatus = displayedDraft.resultStatus || displayedDraft.draftStatus || 'draft';
  const canEdit = Boolean(displayedDraft.id);
  const isBusy = createDraftMutation.isPending || saveDraftMutation.isPending || validateDraftMutation.isPending;
  const latestIssues = lastIssues.length ? lastIssues : [];

  function updateField(field, value) {
    setDraftForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateNumberField(field, value) {
    updateField(field, value === '' ? null : Number(value));
  }

  function updateImage(index, patch) {
    setDraftForm((current) => ({
      ...current,
      images: current.images.map((image, imageIndex) => (
        imageIndex === index ? { ...image, ...patch } : image
      )),
    }));
  }

  function addImage() {
    setDraftForm((current) => ({
      ...current,
      images: [
        ...current.images,
        {
          url: '',
          sortOrder: current.images.length + 1,
          isMain: current.images.length === 0,
        },
      ],
    }));
  }

  function removeImage(index) {
    setDraftForm((current) => {
      const nextImages = current.images.filter((_, imageIndex) => imageIndex !== index)
        .map((image, imageIndex) => ({
          ...image,
          sortOrder: imageIndex + 1,
          isMain: image.isMain && current.images.length > 1,
        }));
      if (nextImages.length && !nextImages.some((image) => image.isMain)) {
        nextImages[0].isMain = true;
      }
      return { ...current, images: nextImages };
    });
  }

  function setMainImage(index) {
    setDraftForm((current) => ({
      ...current,
      images: current.images.map((image, imageIndex) => ({
        ...image,
        isMain: imageIndex === index,
      })),
    }));
  }

  function moveImage(index, direction) {
    setDraftForm((current) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.images.length) return current;
      const nextImages = [...current.images];
      const currentImage = nextImages[index];
      nextImages[index] = nextImages[targetIndex];
      nextImages[targetIndex] = currentImage;
      return {
        ...current,
        images: nextImages.map((image, imageIndex) => ({
          ...image,
          sortOrder: imageIndex + 1,
        })),
      };
    });
  }

  function ensureDraft() {
    if (!activeCandidate || displayedDraft.id) return;
    createDraftMutation.mutate(activeCandidate.id);
  }

  return (
    <div className="wb-page product-prep-page">
      <section className="wb-page-hero split">
        <div>
          <p className="wb-kicker">商品数据整理模块</p>
          <h2>商品草稿编辑</h2>
          <p>
            将候选商品整理成可编辑草稿，保存到 product_content_result，并校验是否满足下一阶段 Ozon 上架导入。
          </p>
        </div>
        <div className="wb-hero-card wb-hero-card-stack">
          <span className={`wb-pill is-${currentStatus === 'ready' ? 'good' : currentStatus === 'invalid' ? 'danger' : 'neutral'}`}>
            {getStatusLabel(currentStatus)}
          </span>
          <strong>{candidateStatus}</strong>
          <small className="cell-sub">{drafts.length} 个已保存草稿</small>
          <small className="cell-sub">{categoryTreeStatus}</small>
          <button
            className="wb-button ghost"
            disabled={!hasOzonCredentials || categoryTreeQuery.isFetching}
            onClick={() => {
              categoryTreeQuery.refetch();
              if (resolvedDescriptionCategoryId && resolvedTypeId) categoryAttributesQuery.refetch();
            }}
          >
            刷新 Ozon 类目与属性
          </button>
        </div>
      </section>

      <section className="product-prep-edit-layout">
        <Panel
          title="候选商品"
          subtitle="选择候选商品后，可以创建或打开已有草稿。"
          actions={<span className="product-prep-board-badge is-upstream">{candidates.length}</span>}
        >
          <div className="product-prep-candidate-list">
            {candidates.map((candidate) => {
              const draft = findDraftForCandidate(candidate, drafts);
              const isActive = String(candidate.id) === String(activeCandidate?.id);
              const status = draft?.resultStatus || draft?.draftStatus || 'missing';
              return (
                <button
                  className={`product-prep-candidate-card ${isActive ? 'is-active' : ''}`}
                  type="button"
                  onClick={() => {
                    setSelectedCandidateId(candidate.id);
                    setSelectedDraftId(draft?.id || null);
                  }}
                  key={candidate.id}
                >
                  <span>#{candidate.id}</span>
                  <strong>{getCandidateTitle(candidate)}</strong>
                  <small>{candidate.brand || '无品牌'} / 销量 {candidate.sales ?? '-'}</small>
                  <em className={`product-prep-state-pill is-${status}`}>
                    {getStatusLabel(status)}
                  </em>
                </button>
              );
            })}
            {!candidates.length ? (
              <div className="product-prep-validation-empty">暂无候选商品。</div>
            ) : null}
          </div>
        </Panel>

        <Panel
          title="草稿编辑"
          subtitle="保存不会丢弃未通过校验的数据；校验结果决定是否可以进入已就绪状态。"
          actions={(
            <div className="product-prep-action-row">
              {!canEdit ? (
                <button className="wb-button wb-button-primary" disabled={!activeCandidate || createDraftMutation.isPending} onClick={ensureDraft}>
                  {createDraftMutation.isPending ? '创建中' : '创建草稿'}
                </button>
              ) : null}
              <button className="wb-button ghost" disabled={!canEdit || isBusy} onClick={() => saveDraftMutation.mutate({ requestedStatus: 'draft' })}>
                保存草稿
              </button>
              <button className="wb-button wb-button-primary" disabled={!canEdit || isBusy} onClick={() => saveDraftMutation.mutate({ requestedStatus: 'ready' })}>
                保存并校验为已就绪
              </button>
            </div>
          )}
        >
          {!canEdit ? (
            <div className="product-prep-validation-empty">
              当前候选商品还没有草稿，请先创建草稿后再编辑。
            </div>
          ) : (
            <div className="product-prep-editor">
              <section className="product-prep-edit-section">
                <h3>基础信息</h3>
                <div className="product-prep-edit-grid">
                  <Field label="offer_id">
                    <input value={draftForm.offerId} onChange={(event) => updateField('offerId', event.target.value)} />
                  </Field>
                  <Field label="vendor / 品牌">
                    <input value={draftForm.vendor} onChange={(event) => updateField('vendor', event.target.value)} />
                  </Field>
                  <Field label="name / 标题">
                    <input value={draftForm.name} onChange={(event) => updateField('name', event.target.value)} />
                  </Field>
                  <Field label="model_name">
                    <input value={draftForm.modelName} onChange={(event) => updateField('modelName', event.target.value)} />
                  </Field>
                  <Field label="description / 描述">
                    <textarea rows={4} value={draftForm.description} onChange={(event) => updateField('description', event.target.value)} />
                  </Field>
                  <Field label="barcode / 条码">
                    <input value={draftForm.barcode} onChange={(event) => updateField('barcode', event.target.value)} />
                  </Field>
                </div>
              </section>

              <section className="product-prep-edit-section">
                <h3>Ozon 类目与属性</h3>
                <div className="product-prep-edit-grid">
                  <Field label="description_category_id">
                    <input type="number" value={draftForm.descriptionCategoryId ?? ''} onChange={(event) => updateNumberField('descriptionCategoryId', event.target.value)} />
                  </Field>
                  <Field label="type_id">
                    <input type="number" value={draftForm.typeId ?? ''} onChange={(event) => updateNumberField('typeId', event.target.value)} />
                  </Field>
                </div>
                <ProductPrepDescriptionCategorySelect
                  treePayload={categoryTreeQuery.data}
                  selectedIndexes={selectedCategoryIndexes}
                  onSelectedIndexesChange={setSelectedCategoryIndexes}
                  disabled={!hasOzonCredentials || categoryTreeQuery.isFetching}
                />
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
                  selection={{
                    descriptionCategoryId: resolvedDescriptionCategoryId,
                    typeId: resolvedTypeId,
                    path: categorySelection.path,
                  }}
                  isLoading={categoryAttributesQuery.isFetching}
                  error={categoryAttributesQuery.error}
                />
              </section>

              <section className="product-prep-edit-section">
                <h3>价格与税务</h3>
                <div className="product-prep-edit-grid">
                  <Field label="price">
                    <input value={draftForm.price} onChange={(event) => updateField('price', event.target.value)} />
                  </Field>
                  <Field label="currency_code">
                    <input value={draftForm.currencyCode} onChange={(event) => updateField('currencyCode', event.target.value)} placeholder="CNY" />
                  </Field>
                  <Field label="VAT">
                    <input value={draftForm.vat} onChange={(event) => updateField('vat', event.target.value)} placeholder="0" />
                  </Field>
                  <Field label="old_price">
                    <input value={draftForm.oldPrice} onChange={(event) => updateField('oldPrice', event.target.value)} />
                  </Field>
                  <Field label="premium_price">
                    <input value={draftForm.premiumPrice} onChange={(event) => updateField('premiumPrice', event.target.value)} />
                  </Field>
                  <Field label="min_price">
                    <input value={draftForm.minPrice} onChange={(event) => updateField('minPrice', event.target.value)} />
                  </Field>
                </div>
              </section>

              <section className="product-prep-edit-section">
                <h3>图片 URL</h3>
                <div className="product-prep-image-list">
                  {draftForm.images.map((image, index) => (
                    <article className="product-prep-image-row" key={`${index}-${image.sortOrder}`}>
                      <label>
                        <span>主图</span>
                        <input type="radio" checked={image.isMain} onChange={() => setMainImage(index)} />
                      </label>
                      <input value={image.url} onChange={(event) => updateImage(index, { url: event.target.value })} placeholder="https://..." />
                      <div className="product-prep-image-actions">
                        <button className="wb-button ghost" type="button" onClick={() => moveImage(index, -1)} disabled={index === 0}>上移</button>
                        <button className="wb-button ghost" type="button" onClick={() => moveImage(index, 1)} disabled={index === draftForm.images.length - 1}>下移</button>
                        <button className="wb-button danger" type="button" onClick={() => removeImage(index)}>删除</button>
                      </div>
                    </article>
                  ))}
                  <button className="wb-button ghost" type="button" onClick={addImage}>添加图片 URL</button>
                </div>
              </section>

              <section className="product-prep-edit-section">
                <h3>包装与库存</h3>
                <div className="product-prep-edit-grid">
                  <Field label="depth mm / 深度">
                    <input type="number" value={draftForm.packageDepthMm ?? ''} onChange={(event) => updateNumberField('packageDepthMm', event.target.value)} />
                  </Field>
                  <Field label="width mm / 宽度">
                    <input type="number" value={draftForm.packageWidthMm ?? ''} onChange={(event) => updateNumberField('packageWidthMm', event.target.value)} />
                  </Field>
                  <Field label="height mm / 高度">
                    <input type="number" value={draftForm.packageHeightMm ?? ''} onChange={(event) => updateNumberField('packageHeightMm', event.target.value)} />
                  </Field>
                  <Field label="weight g / 重量">
                    <input type="number" value={draftForm.packageWeightG ?? ''} onChange={(event) => updateNumberField('packageWeightG', event.target.value)} />
                  </Field>
                  <Field label="warehouse_id">
                    <input value={draftForm.warehouseId} onChange={(event) => updateField('warehouseId', event.target.value)} />
                  </Field>
                  <Field label="stock / 库存">
                    <input type="number" value={draftForm.stock ?? 0} onChange={(event) => updateNumberField('stock', event.target.value)} />
                  </Field>
                </div>
              </section>
            </div>
          )}
        </Panel>

        <Panel
          title="校验结果"
          subtitle="错误会阻止草稿进入已就绪状态；警告会保留给下一阶段处理。"
          actions={<span className={`product-prep-state-pill is-${currentStatus}`}>{getStatusLabel(currentStatus)}</span>}
        >
          <div className="product-prep-validation-actions">
            <button className="wb-button ghost" disabled={!canEdit || isBusy} onClick={() => validateDraftMutation.mutate()}>
              重新校验已保存草稿
            </button>
          </div>
          <IssueList issues={latestIssues} />
          {saveDraftMutation.isError ? <div className="wb-feedback is-error">保存失败：{saveDraftMutation.error.message}</div> : null}
          {validateDraftMutation.isError ? <div className="wb-feedback is-error">校验失败：{validateDraftMutation.error.message}</div> : null}
          {createDraftMutation.isError ? <div className="wb-feedback is-error">创建失败：{createDraftMutation.error.message}</div> : null}
          {saveDraftMutation.isSuccess ? <div className="wb-feedback">已保存到 product_content_result #{saveDraftMutation.data?.item?.id}</div> : null}
        </Panel>
      </section>

      <section className="product-prep-grid">
        <ProductPrepWorkflowPanel steps={productPrepWorkflowSteps} />
        <ProductPrepBoundaryPanel rules={productPrepSafetyRules} />
      </section>
    </div>
  );
}
