import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Panel } from '../components/Panel';
import {
  compareShippingServices,
  createProductSelectionItems,
  fetchProducts,
  fetchProductSelectionItems,
  fetchResultJobs,
  transferProductSelectionItemToPrep,
  updateProductSelectionItem,
} from '../lib/api';
import { formatCurrency, formatNumber, formatPercent, formatText } from '../lib/format';
import categoryRatesData from '../modules/ozon-pricing/data/categoryRates.json';
import exchangeRatesData from '../modules/ozon-pricing/data/exchangeRates.json';
import logisticsData from '../modules/ozon-pricing/data/logistics.json';
import {
  calculatePricing,
  defaultPricingForm,
  getRate,
  normalizeInitialForm,
} from '../modules/ozon-pricing/pricingCalculator';

const defaultFilters = {
  keyword: '',
  productType: '',
  categoryLevel1: '',
  minSales: '',
  minGrowth: '',
  minRevenue: '',
  minAvgPrice: '',
  maxAvgPrice: '',
  minWeight: '',
  maxWeight: '',
  productStatus: 'pending',
  sort: 'sales_desc',
};

const defaultSelectionFilters = {
  keyword: '',
  sourceJobId: '',
  pricingStatus: 'all',
  profitStatus: 'all',
  supplyStatus: 'all',
  competitorStatus: 'all',
};

const modeOptions = [
  { key: 'result', label: '结果展示' },
  { key: 'screening', label: '商品筛选' },
];

const stageLabels = {
  pool_pending: '待初筛',
  screening_rejected: '淘汰',
  pricing_pending: '待测价',
  pricing_rejected: '利润不成立',
  source_pending: '待找供应链',
  competitor_pending: '待整理竞品',
  prep_ready: '可流转',
};

const stageToneMap = {
  pool_pending: 'neutral',
  screening_rejected: '淘汰',
  pricing_pending: 'accent',
  pricing_rejected: 'danger',
  source_pending: 'accent',
  competitor_pending: 'accent',
  prep_ready: 'success',
};

const selectionOverviewTabs = [
  { key: 'all', label: '全部' },
  { key: 'pool_pending', label: '待初筛' },
  { key: 'pricing_pending', label: '待测价' },
  { key: 'source_pending', label: '待找供应链' },
  { key: 'competitor_pending', label: '待整理竞品' },
  { key: 'prep_ready', label: '可流转' },
  { key: 'rejected', label: '已淘汰' },
];

const selectionProgressSteps = [
  { key: 'pool_pending', label: '初筛' },
  { key: 'pricing_pending', label: '测价' },
  { key: 'source_pending', label: '找货' },
  { key: 'competitor_pending', label: '竞品' },
  { key: 'prep_ready', label: '流转' },
];

const pageSize = 20;
const categoryRates = categoryRatesData.items || [];
const exchangeRates = exchangeRatesData.items || [];
const logistics = logisticsData.items || [];
const quickPricingBaseForm = normalizeInitialForm(defaultPricingForm, categoryRates, logistics);
const quickPricingFixedParams = {
  profitType: 'rate',
  profitVal: '20',
  discount: '50',
  chinaFee: '0',
  adsRate: '0',
  cashRate: '1',
  refundRate: '2',
  otherFee: '0',
};
const defaultPricingTemplateValues = {
  profitType: quickPricingFixedParams.profitType,
  profitVal: quickPricingFixedParams.profitVal,
  adsRate: quickPricingFixedParams.adsRate,
  cashRate: quickPricingFixedParams.cashRate,
  refundRate: quickPricingFixedParams.refundRate,
  otherFee: quickPricingFixedParams.otherFee,
};
const builtInPricingTemplates = [
  {
    id: 'standard',
    name: '标准利润 20%',
    values: defaultPricingTemplateValues,
  },
  {
    id: 'conservative',
    name: '保守测算 25%',
    values: { ...defaultPricingTemplateValues, profitVal: '25', adsRate: '5', refundRate: '3' },
  },
  {
    id: 'traffic',
    name: '投流测试 18%',
    values: { ...defaultPricingTemplateValues, profitVal: '18', adsRate: '8', refundRate: '3' },
  },
];
const pricingTemplateStorageKey = 'menglar-selection-pricing-templates';

function getInitialMode(searchParams) {
  return searchParams.get('mode') === 'screening' ? 'screening' : 'result';
}

function getInitialFilters(searchParams) {
  return {
    keyword: searchParams.get('keyword') || '',
    productType: searchParams.get('productType') || '',
    categoryLevel1: searchParams.get('categoryLevel1') || '',
    minSales: searchParams.get('minSales') || '',
    minGrowth: searchParams.get('minGrowth') || '',
    minRevenue: searchParams.get('minRevenue') || '',
    minAvgPrice: searchParams.get('minAvgPrice') || '',
    maxAvgPrice: searchParams.get('maxAvgPrice') || '',
    minWeight: searchParams.get('minWeight') || '',
    maxWeight: searchParams.get('maxWeight') || '',
    productStatus: searchParams.get('productStatus') || defaultFilters.productStatus,
    sort: searchParams.get('sort') || 'sales_desc',
  };
}

function hasInitialAdvancedFilters(searchParams) {
  return ['minSales', 'minGrowth', 'minRevenue', 'minAvgPrice', 'maxAvgPrice', 'minWeight', 'maxWeight']
    .some((key) => Boolean(searchParams.get(key)));
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

function formatDeliveryDays(value) {
  if (value == null || value === '') return '-';
  const number = Number(value);
  if (Number.isFinite(number)) {
    if (number < 0) return '-';
    const daysText = Number.isInteger(number) ? formatNumber(number) : String(Number(number.toFixed(1)));
    return `${daysText}天`;
  }
  const text = formatText(value);
  return text === '-' ? '-' : text;
}

function formatSignedIntegerPercent(value) {
  if (value == null || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  const sign = number > 0 ? '+' : '';
  return `${sign}${formatIntegerPercent(number)}`;
}

function getStageCount(entries, key) {
  if (key === 'all') return entries.filter((entry) => !isRejectedStage(entry.stage)).length;
  if (key === 'rejected') {
    return entries.filter((entry) => isRejectedStage(entry.stage)).length;
  }
  return entries.filter((entry) => entry.stage === key).length;
}

function matchesSelectionFilter(entry, filters, stageFilter) {
  const isRejected = isRejectedStage(entry.stage);
  if (stageFilter !== 'all') {
    if (stageFilter === 'rejected') {
      if (!isRejected) return false;
    } else if (entry.stage !== stageFilter) {
      return false;
    }
  } else if (isRejected) {
    return false;
  }

  const keyword = filters.keyword.trim().toLowerCase();
  if (keyword) {
    const haystack = [
      entry.item.title,
      entry.item.brand,
      entry.item.shop_name,
      entry.item.platform_product_id,
      entry.item.category_level_1,
      entry.item.category_level_2,
      entry.item.category_level_3,
    ].join(' ').toLowerCase();
    if (!haystack.includes(keyword)) return false;
  }

  if (filters.sourceJobId && String(entry.sourceJobId) !== String(filters.sourceJobId)) return false;
  if (filters.pricingStatus === 'priced' && entry.pricingDecision === 'pending') return false;
  if (filters.pricingStatus === 'unpriced' && entry.pricingDecision !== 'pending') return false;
  if (filters.profitStatus === 'ok' && entry.pricingDecision !== 'continue') return false;
  if (filters.profitStatus === 'bad' && entry.pricingDecision !== 'reject') return false;
  if (filters.supplyStatus === 'matched' && entry.supplyMatchStatus !== 'matched') return false;
  if (filters.supplyStatus === 'pending' && entry.supplyMatchStatus !== 'pending') return false;
  if (filters.competitorStatus === 'ready' && entry.competitorPacketStatus !== 'ready') return false;
  if (filters.competitorStatus === 'pending' && entry.competitorPacketStatus !== 'pending') return false;

  return true;
}

function isRejectedStage(stage) {
  return stage === 'screening_rejected' || stage === 'pricing_rejected';
}

function getSelectionProgressIndex(stage) {
  const index = selectionProgressSteps.findIndex((step) => step.key === stage);
  return index < 0 ? 0 : index;
}

function formatDualTargetPrice(cnyPrice) {
  if (cnyPrice == null) return '未测价';
  const rubRate = getRate(exchangeRates, 'RUB');
  const rubPrice = rubRate > 0 ? Number(cnyPrice) * rubRate : null;
  return rubPrice == null
    ? formatCurrency(cnyPrice, 'CNY')
    : `${formatCurrency(rubPrice, 'RUB')} / ${formatCurrency(cnyPrice, 'CNY')}`;
}

function formatSelectionProfit(entry) {
  if (entry.initialTargetPrice == null || entry.initialProfitRate == null) return '待确认';
  const profitAmount = Number(entry.initialTargetPrice) * (Number(entry.initialProfitRate) / 100);
  if (!Number.isFinite(profitAmount)) return '待确认';
  return `${formatCurrency(profitAmount, 'CNY')} · ${formatPercent(entry.initialProfitRate)}`;
}

function formatLogisticsCost(entry) {
  if (entry.initialDeliveryCost == null) return '-';
  const salePrice = entry.item?.avg_price_cny;
  if (salePrice == null || Number(salePrice) <= 0) return formatCurrency(entry.initialDeliveryCost, 'CNY');
  const ratio = (entry.initialDeliveryCost / Number(salePrice)) * 100;
  return (
    <>
      {formatCurrency(entry.initialDeliveryCost, 'CNY')}
      <span className="logistics-ratio"> · {formatPercent(ratio)}</span>
    </>
  );
}

function buildPricingFormForEntry(entry, overrides = {}) {
  const { item } = entry;

  let savedForm = null;
  if (entry.pricingFormJson) {
    try {
      savedForm = JSON.parse(entry.pricingFormJson);
    } catch {
      // ignore parse error
    }
  }

  const avgPrice = Number(item.avg_price_cny || 0);
  const weight = Number(item.weight_g || 0);
  const cost = Number((avgPrice * 0.56).toFixed(2));
  const computedDefaults = {
    purchaseCost: String(cost || quickPricingBaseForm.purchaseCost),
    weight: String(weight || quickPricingBaseForm.weight),
    volumeL: String(Number(item.length_cm || 0) > 0 ? item.length_cm : quickPricingBaseForm.volumeL),
    volumeW: String(Number(item.width_cm || 0) > 0 ? item.width_cm : quickPricingBaseForm.volumeW),
    volumeH: String(Number(item.height_cm || 0) > 0 ? item.height_cm : quickPricingBaseForm.volumeH),
    manualLogisticsFee: '',
  };

  return {
    ...quickPricingBaseForm,
    ...quickPricingFixedParams,
    ...computedDefaults,
    ...savedForm,
    ...overrides,
  };
}

function toShippingQuote(item, rates) {
  const currency = item.result.currency || 'CNY';
  const rawFee = Number(item.result.totalLogisticsCost || 0);
  let feeRmb = rawFee;
  if (currency === 'USD') {
    const usdRate = getRate(rates, 'USD');
    feeRmb = usdRate > 0 ? rawFee / usdRate : rawFee * 7.2;
  }
  if (currency === 'RUB') {
    const rubRate = getRate(rates, 'RUB');
    feeRmb = rubRate > 0 ? rawFee / rubRate : rawFee;
  }
  return {
    key: `${item.service.carrierCode}:${item.service.deliveryMethodCode}`,
    name: item.service.displayName,
    feeRmb,
    feeOriginal: rawFee,
    currency,
    chargeableWeightG: item.result.chargeableWeightG,
    physicalWeightG: item.result.physicalWeightG,
    volumetricWeightG: item.result.volumetricWeightG,
    incrementUnitG: item.result.ruleMeta?.incrementUnitG,
  };
}

function computeQuickPricingFromForm(form, shippingQuote = null) {
  return calculatePricing({
    form,
    logistics,
    categoryRates,
    exchangeRates,
    shippingQuote,
  });
}

function computePricingSnapshotFromResult(quickPricing, decision) {

  if (!quickPricing.ok) {
    return {
      pricingDecision: decision,
    };
  }

  return {
    initialCostPrice: Number(quickPricing.input.purchaseCost.toFixed(2)),
    initialDeliveryCost: Number(quickPricing.logisticsFee.toFixed(2)),
    initialTargetPrice: Number(quickPricing.salePriceRmb.toFixed(2)),
    initialProfitRate: Number((quickPricing.actualProfitRate * 100).toFixed(2)),
    pricingDecision: decision,
  };
}

function loadStoredPricingTemplates() {
  if (typeof window === 'undefined') return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(pricingTemplateStorageKey) || '[]');
    return Array.isArray(stored) ? stored.filter((item) => item?.id && item?.name && item?.values) : [];
  } catch {
    return [];
  }
}

function saveStoredPricingTemplates(templates) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(pricingTemplateStorageKey, JSON.stringify(templates));
}

function pickPricingTemplateValues(form) {
  return {
    profitType: form.profitType,
    profitVal: form.profitVal,
    adsRate: form.adsRate,
    cashRate: form.cashRate,
    refundRate: form.refundRate,
    otherFee: form.otherFee,
  };
}

function formatIntegerCurrency(value, currency = 'CNY') {
  return formatCurrency(value, currency, 0);
}

function formatIntegerPercent(value) {
  return formatPercent(value, 0);
}

function getDimensionSummary(item) {
  const hasDimension = [item.length_cm, item.width_cm, item.height_cm].some((value) => value != null && value !== '');
  return {
    sizeText: hasDimension
      ? `${formatText(item.length_cm)} × ${formatText(item.width_cm)} × ${formatText(item.height_cm)} cm`
      : '-',
    weightText: item.weight_g == null || item.weight_g === '' ? '-' : `${formatNumber(item.weight_g)} g`,
  };
}

export function ResultsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState(() => getInitialMode(searchParams));
  const [filters, setFilters] = useState(() => getInitialFilters(searchParams));
  const [selectionFilters, setSelectionFilters] = useState(defaultSelectionFilters);
  const [page, setPage] = useState(() => Math.max(Number(searchParams.get('page') || 1), 1));
  const [selectedJobId, setSelectedJobId] = useState(() => searchParams.get('jobId') || '');
  const [showUnavailableJobs, setShowUnavailableJobs] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(() => hasInitialAdvancedFilters(searchParams));
  const [selectionTab, setSelectionTab] = useState('all');
  const [selectionFeedback, setSelectionFeedback] = useState('');
  const [selectionActionPending, setSelectionActionPending] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [competitorDetailEntry, setCompetitorDetailEntry] = useState(null);
  const [selectionDialogPage, setSelectionDialogPage] = useState('detail');
  const [pricingDialogEntry, setPricingDialogEntry] = useState(null);
  const [pricingDialogForm, setPricingDialogForm] = useState(null);
  const [customPricingTemplates, setCustomPricingTemplates] = useState(() => loadStoredPricingTemplates());

  const shippingPayload = useMemo(() => {
    if (!pricingDialogForm) return null;
    return {
      originCountry: 'CN',
      warehouseType: 'seller_warehouse',
      salesScheme: 'realFBS',
      price: Math.max(Number(pricingDialogForm.purchaseCost) || 0, 1),
      lengthCm: Math.max(Number(pricingDialogForm.volumeL) || 0, 0.01),
      widthCm: Math.max(Number(pricingDialogForm.volumeW) || 0, 0.01),
      heightCm: Math.max(Number(pricingDialogForm.volumeH) || 0, 0.01),
      weightG: Math.max(Number(pricingDialogForm.weight) || 0, 1),
      orderDate: '2026-04-21',
      includeXlsxCandidates: false,
    };
  }, [
    pricingDialogForm?.purchaseCost,
    pricingDialogForm?.weight,
    pricingDialogForm?.volumeL,
    pricingDialogForm?.volumeW,
    pricingDialogForm?.volumeH,
  ]);

  const shippingMutation = useMutation({ mutationFn: compareShippingServices });

  useEffect(() => {
    if (shippingPayload) {
      shippingMutation.mutate(shippingPayload);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shippingPayload]);

  const shippingQuote = useMemo(() => {
    const services = shippingMutation.data?.items || [];
    if (!services.length) return null;
    const cheapest = [...services].sort((a, b) => a.result.totalLogisticsCost - b.result.totalLogisticsCost)[0];
    return toShippingQuote(cheapest, exchangeRates);
  }, [shippingMutation.data]);

  const resultJobsQuery = useQuery({
    queryKey: ['result-jobs', showUnavailableJobs],
    queryFn: () => fetchResultJobs({
      includeEmpty: showUnavailableJobs,
      includeFailed: showUnavailableJobs,
      limit: 50,
    }),
  });

  const selectionQuery = useQuery({
    queryKey: ['product-selection-items'],
    queryFn: () => fetchProductSelectionItems(),
  });

  const jobs = resultJobsQuery.data?.jobs || [];

  const lastAutoFilledLogisticsRef = useRef(null);

  useEffect(() => {
    if (!shippingQuote || !pricingDialogForm) return;
    const computedFee = String(shippingQuote.feeRmb.toFixed(2));
    const currentManualFee = pricingDialogForm.manualLogisticsFee;
    if (!currentManualFee || currentManualFee === lastAutoFilledLogisticsRef.current) {
      updatePricingDialogForm('manualLogisticsFee', computedFee);
      lastAutoFilledLogisticsRef.current = computedFee;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shippingQuote]);

  useEffect(() => {
    if (!pricingDialogEntry) {
      lastAutoFilledLogisticsRef.current = null;
    }
  }, [pricingDialogEntry]);

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

  useEffect(() => {
    if (!previewImage) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setPreviewImage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewImage]);

  useEffect(() => {
    if (!competitorDetailEntry) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setCompetitorDetailEntry(null);
        setPricingDialogEntry(null);
        setPricingDialogForm(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [competitorDetailEntry]);

  useEffect(() => {
    if (!pricingDialogEntry) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setCompetitorDetailEntry(null);
        setPricingDialogEntry(null);
        setPricingDialogForm(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pricingDialogEntry]);

  const productsQuery = useQuery({
    queryKey: ['products', selectedJobId, filters, page],
    queryFn: () => fetchProducts({ ...filters, jobId: selectedJobId, page, pageSize }),
    enabled: Boolean(selectedJobId),
  });

  const data = productsQuery.data;
  const items = data?.items || [];
  const selectionEntries = selectionQuery.data?.items || [];
  const pageCount = useMemo(() => Math.max(Math.ceil((data?.total || 0) / pageSize), 1), [data?.total]);
  const currentJob = data?.latestJob || jobs.find((job) => String(job.id) === String(selectedJobId));
  const firstAvailableJob = jobs.find((job) => Number(job.product_count || 0) > 0 && job.job_status === 'success');
  const isEmptyBatch = Boolean(selectedJobId && data && Number(data.actualProductCount || 0) === 0);
  const resultFilterTitle = currentJob
    ? `原始结果筛选 #${currentJob.id} · 商品 ${formatNumber(data?.actualProductCount ?? currentJob.product_count ?? 0)}`
    : '原始结果筛选 选择批次';
  const hasAdvancedFilters = Boolean(
    filters.minSales
      || filters.minGrowth
      || filters.minRevenue
      || filters.minAvgPrice
      || filters.maxAvgPrice
      || filters.minWeight
      || filters.maxWeight,
  );
  const showAdvancedFilters = advancedFiltersOpen;

  const selectionCounts = useMemo(() => {
    return selectionOverviewTabs.reduce((acc, tab) => {
      acc[tab.key] = getStageCount(selectionEntries, tab.key);
      return acc;
    }, {});
  }, [selectionEntries]);

  const activeSelectionEntries = useMemo(() => {
    return selectionEntries.filter((entry) => !isRejectedStage(entry.stage));
  }, [selectionEntries]);

  const visibleSelectionEntries = useMemo(() => {
    return selectionEntries.filter((entry) => matchesSelectionFilter(entry, selectionFilters, selectionTab));
  }, [selectionEntries, selectionFilters, selectionTab]);

  const selectedSnapshotIds = useMemo(() => {
    return new Set(selectionEntries.map((entry) => Number(entry.item?.id)).filter(Boolean));
  }, [selectionEntries]);

  const selectionStatusBySnapshotId = useMemo(() => {
    return new Map(selectionEntries.map((entry) => [Number(entry.item?.id), entry.stage]));
  }, [selectionEntries]);

  const applyFilter = (key, value) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setPage(1);
    setAdvancedFiltersOpen(false);
    setFilters(defaultFilters);
  };

  const applySelectionFilter = (key, value) => {
    setSelectionFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetSelectionFilters = () => {
    setSelectionFilters(defaultSelectionFilters);
    setSelectionTab('all');
  };

  const selectJob = (jobId) => {
    setSelectedJobId(String(jobId));
    setPage(1);
    setBatchOpen(false);
  };

  const runSelectionAction = async (action, buildFeedback) => {
    setSelectionActionPending(true);
    try {
      const payload = await action();
      if (Array.isArray(payload?.items)) {
        queryClient.setQueryData(['product-selection-items'], (prev) => ({
          ...(prev || {}),
          items: payload.items,
        }));
      }
      await selectionQuery.refetch();
      await productsQuery.refetch();
      setSelectionFeedback(typeof buildFeedback === 'function' ? buildFeedback(payload) : '');
    } catch (error) {
      setSelectionFeedback(error.message);
    } finally {
      setSelectionActionPending(false);
    }
  };

  const addCurrentPageToSelectionPool = async () => {
    if (!items.length) return;
    await runSelectionAction(
      () => createProductSelectionItems({
        items: items.map((item) => ({ sourceSnapshotId: item.id })),
      }),
      (payload) => buildSelectionAddFeedback(payload),
    );
  };

  const addSingleProductToSelectionPool = async (item) => {
    await runSelectionAction(
      () => createProductSelectionItems({
        items: [{ sourceSnapshotId: item.id }],
      }),
      (payload) => buildSelectionAddFeedback(payload),
    );
  };

  const rejectCurrentPage = async () => {
    if (!items.length) return;
    await runSelectionAction(
      () => createProductSelectionItems({
        selectionStage: 'screening_rejected',
        items: items.map((item) => ({ sourceSnapshotId: item.id })),
      }),
      (payload) => buildSelectionRejectFeedback(payload),
    );
  };

  const rejectSingleProduct = async (item) => {
    await runSelectionAction(
      () => createProductSelectionItems({
        selectionStage: 'screening_rejected',
        items: [{ sourceSnapshotId: item.id }],
      }),
      (payload) => buildSelectionRejectFeedback(payload),
    );
  };

  const updateSelectionStage = async (entryId, patch, successMessage) => {
    await runSelectionAction(
      () => updateProductSelectionItem(entryId, patch),
      () => successMessage,
    );
  };

  const updateSelectionNote = async (entryId, note) => {
    try {
      await updateProductSelectionItem(entryId, { selectionNote: note });
      queryClient.setQueryData(['product-selection-items'], (prev) => {
        if (!prev?.items) return prev;
        return {
          ...prev,
          items: prev.items.map((item) =>
            Number(item.id) === Number(entryId) ? { ...item, selectionNote: note } : item
          ),
        };
      });
    } catch (error) {
      setSelectionFeedback(error.message);
    }
  };

  const openPricingDialog = (entry) => {
    const existingValues = {
      ...(entry.initialCostPrice != null ? { purchaseCost: String(entry.initialCostPrice) } : {}),
    };
    setCompetitorDetailEntry(entry);
    setSelectionDialogPage('pricing');
    setPricingDialogEntry(entry);
    setPricingDialogForm(buildPricingFormForEntry(entry, existingValues));
  };

  const openCompetitorDetail = (entry) => {
    setCompetitorDetailEntry(entry);
    setSelectionDialogPage('detail');
  };

  const closeSelectionDialog = () => {
    setCompetitorDetailEntry(null);
    setPricingDialogEntry(null);
    setPricingDialogForm(null);
  };

  const switchSelectionDialogPage = (page) => {
    setSelectionDialogPage(page);
    if (page === 'pricing' && competitorDetailEntry) {
      const existingValues = {
        ...(competitorDetailEntry.initialCostPrice != null ? { purchaseCost: String(competitorDetailEntry.initialCostPrice) } : {}),
      };
      setPricingDialogEntry(competitorDetailEntry);
      setPricingDialogForm((current) => current || buildPricingFormForEntry(competitorDetailEntry, existingValues));
    }
  };

  const updatePricingDialogForm = (key, value) => {
    setPricingDialogForm((prev) => ({ ...(prev || quickPricingBaseForm), [key]: value }));
  };

  const applyPricingTemplate = (templateId) => {
    const template = [...builtInPricingTemplates, ...customPricingTemplates].find((item) => item.id === templateId);
    if (!template || !pricingDialogEntry) return;
    setPricingDialogForm(buildPricingFormForEntry(pricingDialogEntry, template.values));
  };

  const savePricingTemplate = (name) => {
    const trimmed = name.trim();
    if (!trimmed || !pricingDialogForm) return;
    const template = {
      id: `custom-${Date.now()}`,
      name: trimmed,
      values: pickPricingTemplateValues(pricingDialogForm),
    };
    const nextTemplates = [...customPricingTemplates, template];
    setCustomPricingTemplates(nextTemplates);
    saveStoredPricingTemplates(nextTemplates);
  };

  const confirmPricing = async (decision) => {
    if (!pricingDialogEntry || !pricingDialogForm) return;
    const result = computeQuickPricingFromForm(pricingDialogForm, shippingQuote);
    if (!result.ok) {
      setSelectionFeedback(result.error || '当前参数无法生成测价结果');
      return;
    }
    const stage = decision === 'continue' ? 'source_pending' : 'pricing_rejected';
    await updateSelectionStage(pricingDialogEntry.id, {
      stage,
      ...computePricingSnapshotFromResult(result, decision),
      pricingFormJson: JSON.stringify(pricingDialogForm),
    }, decision === 'continue' ? '测价通过，已进入找供应链阶段' : '利润不成立，已停止推进');
    setCompetitorDetailEntry(null);
    setPricingDialogEntry(null);
    setPricingDialogForm(null);
  };

  const resultBatchSelector = (
    <div className="result-batch-field result-batch-action">
      <button type="button" className="result-batch-trigger" onClick={() => setBatchOpen((open) => !open)}>
        <strong>{currentJob ? `#${currentJob.id} · 商品 ${formatNumber(data?.actualProductCount ?? currentJob.product_count ?? 0)}` : '选择批次'}</strong>
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
  );

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

      {mode === 'screening' ? (
        <Panel title="选品工作流过滤">
          <SelectionFilterBar
            selectionFilters={selectionFilters}
            applySelectionFilter={applySelectionFilter}
            resetSelectionFilters={resetSelectionFilters}
          />
        </Panel>
      ) : null}

      {mode === 'screening' ? (
        <div className="screening-status-strip">
          {selectionOverviewTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={selectionTab === tab.key ? 'is-active' : ''}
              onClick={() => setSelectionTab(tab.key)}
            >
              <span>{tab.label}</span>
              <strong>{formatNumber(selectionCounts[tab.key] || 0)}</strong>
            </button>
          ))}
        </div>
      ) : null}

      <div className={`wb-results-layout result-workbench-layout ${mode === 'result' ? 'is-result-mode' : 'is-screening-mode'}`}>
        {mode === 'result' ? (
          <Panel
            title={resultFilterTitle}
            actions={(
              <div className="result-filter-actions">
                {resultBatchSelector}
                <span className="result-filter-count">当前结果 {formatNumber(data?.total || 0)} 条</span>
                <button type="button" className="wb-button ghost" onClick={() => setAdvancedFiltersOpen((open) => !open)}>
                  {showAdvancedFilters ? '收起高级筛选' : hasAdvancedFilters ? '高级筛选（已启用）' : '高级筛选'}
                </button>
                <button type="button" className="wb-button ghost" onClick={resetFilters}>重置筛选</button>
              </div>
            )}
          >
            <div className="wb-filter-grid result-filter-grid is-compact">
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
                <span>商品状态</span>
                <select value={filters.productStatus} onChange={(event) => applyFilter('productStatus', event.target.value)}>
                  <option value="">全部</option>
                  <option value="pending">待处理</option>
                  <option value="selected">已加筛</option>
                  <option value="rejected">淘汰</option>
                </select>
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

              {showAdvancedFilters ? (
                <div className="result-advanced-filters">
                  <label className="wb-field">
                    <span>最低销售量</span>
                    <input type="number" min="0" value={filters.minSales} onChange={(event) => applyFilter('minSales', event.target.value)} />
                  </label>

                  <label className="wb-field">
                    <span>最低增长率（%）</span>
                    <input type="number" value={filters.minGrowth} onChange={(event) => applyFilter('minGrowth', event.target.value)} placeholder="例如 30" />
                  </label>

                  <label className="wb-field">
                    <span>最低销售金额</span>
                    <input type="number" min="0" value={filters.minRevenue} onChange={(event) => applyFilter('minRevenue', event.target.value)} />
                  </label>

                  <div className="wb-field">
                    <span>均价区间（CNY）</span>
                    <div className="wb-range-grid">
                      <input type="number" min="0" value={filters.minAvgPrice} onChange={(event) => applyFilter('minAvgPrice', event.target.value)} placeholder="最低均价" />
                      <input type="number" min="0" value={filters.maxAvgPrice} onChange={(event) => applyFilter('maxAvgPrice', event.target.value)} placeholder="最高均价" />
                    </div>
                  </div>

                  <div className="wb-field">
                    <span>重量区间（g）</span>
                    <div className="wb-range-grid">
                      <input type="number" min="0" value={filters.minWeight} onChange={(event) => applyFilter('minWeight', event.target.value)} placeholder="最轻重量" />
                      <input type="number" min="0" value={filters.maxWeight} onChange={(event) => applyFilter('maxWeight', event.target.value)} placeholder="最重重量" />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </Panel>
        ) : null}

        <Panel
          title={mode === 'screening' ? '商品筛选工作台' : '商品结果'}
          subtitle={mode === 'screening'
            ? `${selectionOverviewTabs.find((tab) => tab.key === selectionTab)?.label || '全部'} · ${formatNumber(visibleSelectionEntries.length)} 个商品`
            : `第 ${page} / ${pageCount} 页`}
          actions={mode === 'result' ? (
            <div className="wb-inline-actions">
              <button className="wb-button wb-button-primary" onClick={() => void addCurrentPageToSelectionPool()} disabled={!items.length || selectionActionPending}>
                当前页加入筛选池
              </button>
              <button className="wb-button danger" onClick={() => void rejectCurrentPage()} disabled={!items.length || selectionActionPending}>
                当前页全部淘汰
              </button>
              <button className="wb-button ghost" onClick={() => setPage((current) => Math.max(current - 1, 1))} disabled={page <= 1}>
                上一页
              </button>
              <button className="wb-button ghost" onClick={() => setPage((current) => Math.min(current + 1, pageCount))} disabled={page >= pageCount}>
                下一页
              </button>
            </div>
          ) : null}
        >
          {productsQuery.isError ? (
            <div className="wb-feedback is-error">商品读取失败：{productsQuery.error.message}</div>
          ) : null}

          {selectionQuery.isError ? (
            <div className="wb-feedback is-error">商品筛选工作台读取失败：{selectionQuery.error.message}</div>
          ) : null}

          {selectionFeedback ? (
            <div className={`wb-feedback ${selectionFeedback.includes('失败') || selectionFeedback.includes('错误') ? 'is-error' : ''}`}>{selectionFeedback}</div>
          ) : null}

          {mode === 'screening' && !activeSelectionEntries.length && selectionTab !== 'rejected' ? (
            <div className="result-empty-batch">
              <strong>筛选池还没有商品</strong>
              <p>请先在“结果展示”里按页或按单品把目标商品加入筛选池。商品筛选工作台只处理你主动加入的商品。</p>
              <div className="wb-inline-actions">
                <button type="button" className="wb-button wb-button-primary" onClick={() => setMode('result')}>回到结果展示</button>
              </div>
            </div>
          ) : mode === 'screening' && !visibleSelectionEntries.length ? (
            <div className="result-empty-batch">
              <strong>当前过滤条件下没有商品</strong>
              <p>已入池商品仍然存在，但它们不符合当前“全部 / 阶段 / 过滤条件”的组合。你可以重置过滤，或切换到其他阶段继续处理。</p>
              <div className="wb-inline-actions">
                <button type="button" className="wb-button wb-button-primary" onClick={resetSelectionFilters}>重置过滤</button>
              </div>
            </div>
          ) : mode === 'result' && isEmptyBatch ? (
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
          ) : mode === 'result' ? (
            <RawResultsTable
              items={items}
              onAddSingle={addSingleProductToSelectionPool}
              onRejectSingle={rejectSingleProduct}
              actionPending={selectionActionPending}
              selectedSnapshotIds={selectedSnapshotIds}
              selectionStatusBySnapshotId={selectionStatusBySnapshotId}
              onPreviewImage={setPreviewImage}
            />
          ) : (
            <SelectionWorkbenchTable
              entries={visibleSelectionEntries}
              actionPending={selectionActionPending}
              onUpdateNote={updateSelectionNote}
              onOpenPricing={openPricingDialog}
              onReject={(entryId) => updateSelectionStage(entryId, {
                stage: 'screening_rejected',
              }, '已淘汰')}
              onResetToPool={(entryId) => updateSelectionStage(entryId, {
                stage: 'pool_pending',
                pricingDecision: 'pending',
                initialCostPrice: null,
                initialDeliveryCost: null,
                initialTargetPrice: null,
                initialProfitRate: null,
                supplyMatchStatus: 'pending',
                supplyReferenceUrl: '',
                supplyVendorName: '',
                competitorPacketStatus: 'pending',
                transferToPrepAt: null,
              }, '已恢复到待初筛')}
              onSupplyMatched={(entry) => updateSelectionStage(entry.id, {
                stage: 'competitor_pending',
                supplyMatchStatus: 'matched',
                supplyVendorName: entry.supplyVendorName || `${formatText(entry.item.brand)} 1688 供应商`,
                supplyReferenceUrl: entry.supplyReferenceUrl || 'https://detail.1688.com/offer/mock-source.html',
              }, '已记录供应链，进入竞品整理阶段')}
              onCompetitorReady={(entryId) => updateSelectionStage(entryId, {
                stage: 'prep_ready',
                competitorPacketStatus: 'ready',
              }, '竞品数据已整理，可流转商品数据整理')}
              onOpenCompetitorDetail={openCompetitorDetail}
              onTransferToPrep={(entryId) => runSelectionAction(
                () => transferProductSelectionItemToPrep(entryId),
                () => '已流转到商品数据整理',
              )}
            />
          )}
        </Panel>
      </div>

      {previewImage ? (
        <div className="image-preview-backdrop" role="presentation" onClick={() => setPreviewImage(null)}>
          <div className="image-preview-dialog" role="dialog" aria-modal="true" aria-label="商品图片预览" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="image-preview-close" onClick={() => setPreviewImage(null)}>关闭</button>
            <img src={previewImage.src} alt={previewImage.alt || ''} />
          </div>
        </div>
      ) : null}

      {competitorDetailEntry ? (
        <SelectionWorkflowDialog
          entry={competitorDetailEntry}
          activePage={selectionDialogPage}
          form={pricingDialogForm}
          templates={[...builtInPricingTemplates, ...customPricingTemplates]}
          result={pricingDialogForm ? computeQuickPricingFromForm(pricingDialogForm, shippingQuote) : null}
          actionPending={selectionActionPending}
          onPageChange={switchSelectionDialogPage}
          onChange={updatePricingDialogForm}
          onApplyTemplate={applyPricingTemplate}
          onSaveTemplate={savePricingTemplate}
          onConfirm={confirmPricing}
          onClose={closeSelectionDialog}
        />
      ) : null}
    </div>
  );
}

function buildSelectionAddFeedback(payload) {
  const inserted = Number(payload?.insertedCount || 0);
  const duplicate = Number(payload?.duplicateCount || 0);
  const skipped = Number(payload?.skippedCount || 0);

  if (inserted && duplicate) {
    return `已加入 ${inserted} 个商品，${duplicate} 个商品已在筛选池中。`;
  }
  if (inserted && skipped) {
    return `已加入 ${inserted} 个商品，${skipped} 个商品未找到来源快照。`;
  }
  if (inserted) {
    return `已加入 ${inserted} 个商品到筛选池。`;
  }
  if (duplicate) {
    return '所选商品已在筛选池中，未重复加入。';
  }
  return '没有成功加入商品，请检查来源数据。';
}

function buildSelectionRejectFeedback(payload) {
  const inserted = Number(payload?.insertedCount || 0);
  const updated = Number(payload?.updatedCount || 0);
  const skipped = Number(payload?.skippedCount || 0);
  const rejected = inserted + updated;

  if (rejected && skipped) {
    return `已淘汰 ${rejected} 个商品，${skipped} 个商品未找到来源快照。`;
  }
  if (rejected) {
    return `已淘汰 ${rejected} 个商品。`;
  }
  return '没有成功淘汰商品，请检查来源数据。';
}

function getRawProductStatus(item, selectionStatusBySnapshotId) {
  const stage = selectionStatusBySnapshotId.get(Number(item.id)) || item.selection_stage || '';
  if (isRejectedStage(stage)) {
    return { key: 'rejected', label: '淘汰' };
  }
  if (stage) {
    return { key: 'selected', label: '已加筛' };
  }
  return { key: 'pending', label: '待处理' };
}

function RawResultsTable({ items, onAddSingle, onRejectSingle, actionPending, selectedSnapshotIds, selectionStatusBySnapshotId, onPreviewImage }) {
  return (
    <div className="wb-table-wrap result-table-wrap">
      <table className="wb-table result-table">
        <thead>
          <tr>
            <th>商品信息</th>
            <th>品牌 / 店铺</th>
            <th>类目</th>
            <th className="num">销售量 / 增长</th>
            <th className="num">销售金额</th>
            <th className="num">均价</th>
            <th>尺寸 / 重量</th>
            <th className="num">潜力指数</th>
            <th className="num">曝光 / 点击率</th>
            <th className="num">转化 / 毛利</th>
            <th className="num">广告</th>
            <th>物流 / 时效</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.length ? items.map((item) => {
            const status = getRawProductStatus(item, selectionStatusBySnapshotId);
            const isSelected = status.key === 'selected' || (selectedSnapshotIds.has(Number(item.id)) && status.key !== 'rejected');
            const isRejected = status.key === 'rejected';
            return (
            <tr key={item.id} className={isRejected ? 'is-rejected' : isSelected ? 'is-in-selection-pool' : ''}>
              <td>
                <div className="product-info-cell">
                  {item.product_image_url ? (
                    <button
                      type="button"
                      className="product-image-trigger"
                      onClick={() => onPreviewImage({
                        src: item.product_image_url,
                        alt: formatText(item.title),
                      })}
                    >
                      <img src={item.product_image_url} alt="" loading="lazy" />
                    </button>
                  ) : (
                    <span className="product-image-placeholder" />
                  )}
                  <div>
                    <div className="cell-main product-title">{formatText(item.title)}</div>
                    <div className="cell-sub mono">{item.product_url ? (
                      <a href={item.product_url} target="_blank" rel="noreferrer">{item.platform_product_id}</a>
                    ) : item.platform_product_id}</div>
                    <div className="cell-sub">创建 {formatText(item.product_created_date)}</div>
                  </div>
                </div>
              </td>
              <td>
                <div className="cell-main">{formatText(item.brand)}</div>
                <div className="cell-sub shop-name">{formatText(item.shop_name)}</div>
                <div className="cell-sub">{formatText(item.product_type)}</div>
              </td>
              <td>
                <div className="cell-main">{formatText(item.category_level_1)}</div>
                <div className="cell-sub">{formatText(item.category_level_2)} / {formatText(item.category_level_3)}</div>
              </td>
              <td className="num">
                <div>{formatNumber(item.sales_volume)}</div>
                <div className="cell-sub metric-sub">{formatSignedIntegerPercent(item.sales_growth)}</div>
              </td>
              <td className="num">
                <div>{formatIntegerCurrency(item.sales_amount, 'RUB')}</div>
                <div className="cell-sub">{formatIntegerCurrency(item.sales_amount_cny, 'CNY')}</div>
              </td>
              <td className="num">
                <div>{formatCurrency(item.avg_price_rub, 'RUB')}</div>
                <div className="cell-sub metric-sub">{formatCurrency(item.avg_price_cny, 'CNY')}</div>
              </td>
              <td>
                <div>{getDimensionSummary(item).sizeText}</div>
                <div className="cell-sub metric-sub">{getDimensionSummary(item).weightText}</div>
              </td>
              <td className="num">{formatNumber(item.potential_index, 0)}</td>
              <td className="num">
                <div>{formatNumber(item.impressions)} / {formatNumber(item.clicks)}</div>
                <div className="cell-sub">点击率 {formatPercent(item.view_rate)}</div>
              </td>
              <td className="num">
                <div className={Number(item.order_conversion_rate) >= 0 ? 'good' : 'danger'}>{formatPercent(item.order_conversion_rate)}</div>
                <div className="cell-sub">毛利 {formatPercent(item.estimated_gross_margin)}</div>
              </td>
              <td className="num">
                <div>{formatIntegerCurrency(item.ad_cost, 'RUB')}</div>
                <div className="cell-sub">{formatIntegerCurrency(item.ad_cost_cny, 'CNY')}</div>
                <div className="cell-sub">占比 {formatIntegerPercent(item.ad_cost_rate)}</div>
              </td>
              <td>
                <div className="cell-main">{formatText(item.shipping_mode)}</div>
                <div className="cell-sub">配送 {formatDeliveryDays(item.delivery_time)}</div>
              </td>
              <td>
                <span className="product-batch-pill">#{formatText(item.job_id)}</span>
                <span className={`raw-product-status is-${status.key}`}>{status.label}</span>
              </td>
              <td>
                <div className="screening-row-actions">
                  {!isRejected ? (
                    <>
                      {!isSelected ? (
                        <button type="button" onClick={() => void onAddSingle(item)} disabled={actionPending}>
                          加入筛选池
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="is-reject"
                        onClick={() => void onRejectSingle(item)}
                        disabled={actionPending}
                      >
                        淘汰
                      </button>
                    </>
                  ) : (
                    <span className="cell-sub">-</span>
                  )}
                </div>
              </td>
            </tr>
            );
          }) : (
            <tr>
              <td colSpan={14} className="wb-empty-cell">当前没有匹配数据</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SelectionFilterBar({
  selectionFilters,
  applySelectionFilter,
  resetSelectionFilters,
}) {
  return (
    <div className="wb-filter-grid selection-filter-bar">
      <label className="wb-field selection-filter-keyword">
        <span>关键词</span>
        <input value={selectionFilters.keyword} onChange={(event) => applySelectionFilter('keyword', event.target.value)} placeholder="商品ID / 品牌 / 类目" />
      </label>

      <label className="wb-field">
        <span>供应链</span>
        <select value={selectionFilters.supplyStatus} onChange={(event) => applySelectionFilter('supplyStatus', event.target.value)}>
          <option value="all">全部</option>
          <option value="matched">已找到货源</option>
          <option value="pending">待找货源</option>
        </select>
      </label>

      <label className="wb-field">
        <span>竞品整理</span>
        <select value={selectionFilters.competitorStatus} onChange={(event) => applySelectionFilter('competitorStatus', event.target.value)}>
          <option value="all">全部</option>
          <option value="ready">已整理</option>
          <option value="pending">待整理</option>
        </select>
      </label>

      <button type="button" className="wb-button ghost selection-filter-reset" onClick={resetSelectionFilters}>重置过滤</button>
    </div>
  );
}

function SelectionWorkbenchTable({
  entries,
  actionPending,
  onUpdateNote,
  onOpenPricing,
  onReject,
  onResetToPool,
  onSupplyMatched,
  onCompetitorReady,
  onOpenCompetitorDetail,
  onTransferToPrep,
}) {
  return (
    <div className="selection-workbench-list" aria-label="商品筛选工作台列表">
      <div className="selection-list-head" aria-hidden="true">
        <span>商品</span>
        <span>重量与物流<span className="product-prep-icon product-prep-info-icon" data-tooltip={'重量：商品包装重量(g)\n跨境物流费：后端自动测算的最优物流费用 · 占商品原始售价的比例'} aria-label="重量与物流说明" tabIndex={0}>i</span></span>
        <span>售价与销量</span>
        <span>测价</span>
        <span>供应链</span>
        <span>备注</span>
        <span>执行</span>
      </div>
      {entries.map((entry) => (
        <SelectionRow
          key={entry.id}
          entry={entry}
          actionPending={actionPending}
          onUpdateNote={onUpdateNote}
          onOpenPricing={onOpenPricing}
          onReject={onReject}
          onResetToPool={onResetToPool}
          onSupplyMatched={onSupplyMatched}
          onCompetitorReady={onCompetitorReady}
          onOpenCompetitorDetail={onOpenCompetitorDetail}
          onTransferToPrep={onTransferToPrep}
        />
      ))}
    </div>
  );
}

function SelectionRow({
  entry,
  actionPending,
  onUpdateNote,
  onOpenPricing,
  onReject,
  onResetToPool,
  onSupplyMatched,
  onCompetitorReady,
  onOpenCompetitorDetail,
  onTransferToPrep,
}) {
  const { item } = entry;
  const isRejected = entry.stage === 'screening_rejected' || entry.stage === 'pricing_rejected';
  const isPriced = entry.pricingDecision !== 'pending' && entry.initialTargetPrice != null;
  const dimensionSummary = getDimensionSummary(item);
  const primaryAction = getPrimaryAction();
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const noteRef = useRef(null);
  const currentNote = entry.selectionNote || '';
  const pricingRows = [
    ['预估售价', formatDualTargetPrice(entry.initialTargetPrice)],
    [
      '利润',
      isPriced ? formatSelectionProfit(entry) : '待确认',
      entry.pricingDecision === 'continue' ? 'is-good' : entry.pricingDecision === 'reject' ? 'is-danger' : '',
    ],
  ];
  return (
    <article className={`selection-decision-card ${isRejected ? 'is-rejected' : ''}`}>
      <section className="selection-product-block">
        <button type="button" className="selection-product-media" onClick={() => onOpenCompetitorDetail(entry)}>
          {item.product_image_url ? (
            <img src={item.product_image_url} alt="" loading="lazy" />
          ) : (
            <span className="product-image-placeholder" />
          )}
        </button>
        <div className="selection-product-info">
          <div className="selection-product-head">
            <span className={`screening-state-pill is-${stageToneMap[entry.stage] || 'neutral'}`}>{stageLabels[entry.stage]}</span>
            <span className="selection-product-id mono">{item.platform_product_id}</span>
          </div>
          <div className="cell-main product-title">{formatText(item.title)}</div>
          <div className="selection-source-meta">
            <span>批次 #{formatText(entry.sourceJobId)}</span>
            <span>{formatJobType(entry.sourcePageType)}</span>
            <span>{formatDate(entry.sourceFinishedAt)}</span>
          </div>
        </div>
      </section>

      <section className="selection-logistics-block">
        <div className="selection-info-panel">
          <div className="selection-info-line">
            <span>重量</span>
            <strong>{dimensionSummary.weightText}</strong>
          </div>
          <div className="selection-info-line">
            <span>跨境物流</span>
            <strong>{formatLogisticsCost(entry)}</strong>
          </div>
        </div>
      </section>

      <section className="selection-market-block">
        <div className="selection-info-panel">
          <div className="selection-info-line">
            <span>售价</span>
            <strong>{formatCurrency(entry.item.avg_price_rub, 'RUB')} / {formatCurrency(entry.item.avg_price_cny, 'CNY')}</strong>
          </div>
          <div className="selection-info-line">
            <span>销量</span>
            <strong>{formatNumber(entry.item.sales_volume)}</strong>
          </div>
        </div>
      </section>

      <section className="selection-pricing-block">
        <div className={`selection-info-panel selection-pricing-summary ${entry.pricingDecision === 'continue' ? 'is-good' : entry.pricingDecision === 'reject' ? 'is-danger' : ''}`}>
          {pricingRows.map(([label, value, tone]) => (
            <div className="selection-info-line" key={label}>
              <span>{label}</span>
              <strong className={tone || ''}>{value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="selection-supply-block">
        <div className="selection-info-panel">
          <div className="selection-info-line">
            <span>货源</span>
            <strong>{entry.supplyMatchStatus === 'matched' ? entry.supplyVendorName || '已找到' : '未记录'}</strong>
          </div>
          <div className="selection-info-line">
            <span>竞品</span>
            <strong>{entry.competitorPacketStatus === 'ready' ? '已整理' : '待整理'}</strong>
          </div>
        </div>
      </section>

      <section className="selection-note-block">
        {noteEditing ? (
          <textarea
            ref={noteRef}
            className="selection-note-input"
            value={noteDraft}
            placeholder="输入备注…"
            rows={2}
            onChange={(event) => setNoteDraft(event.target.value)}
            onBlur={() => {
              const trimmed = noteDraft.trim();
              if (trimmed !== currentNote.trim()) {
                onUpdateNote(entry.id, trimmed);
              }
              setNoteEditing(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.target.blur();
              }
              if (event.key === 'Escape') {
                setNoteDraft(currentNote);
                setNoteEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className={`selection-note-display ${currentNote ? 'has-note' : ''}`}
            title={currentNote || '点击添加备注'}
            onClick={() => {
              setNoteDraft(currentNote);
              setNoteEditing(true);
              setTimeout(() => noteRef.current?.focus(), 0);
            }}
          >
            {currentNote || '+ 添加备注'}
          </button>
        )}
      </section>

      <section className="selection-action-block">
        <button className="selection-primary-action" type="button" onClick={primaryAction.onClick} disabled={actionPending || primaryAction.disabled}>
          {primaryAction.label}
        </button>
        <div className="screening-row-actions selection-actions">
          <button type="button" onClick={() => onOpenCompetitorDetail(entry)} disabled={actionPending}>详情</button>
          {!isRejected ? (
            <button type="button" className="is-reject" onClick={() => void onReject(entry.id)} disabled={actionPending}>淘汰</button>
          ) : null}
        </div>
      </section>
    </article>
  );

  function getPrimaryAction() {
    if (entry.stage === 'pool_pending') {
      return { label: '进入测价', onClick: () => onOpenPricing(entry) };
    }
    if (entry.stage === 'pricing_pending') {
      return { label: '填写测价参数', onClick: () => onOpenPricing(entry) };
    }
    if (entry.stage === 'source_pending') {
      return { label: '标记已找到货源', onClick: () => void onSupplyMatched(entry) };
    }
    if (entry.stage === 'competitor_pending') {
      return { label: '整理竞品完成', onClick: () => void onCompetitorReady(entry.id) };
    }
    if (entry.stage === 'prep_ready') {
      return {
        label: entry.transferToPrepAt ? '已流转商品整理' : '进入商品整理',
        onClick: () => void onTransferToPrep(entry.id),
        disabled: Boolean(entry.transferToPrepAt),
      };
    }
    return { label: '恢复到待初筛', onClick: () => void onResetToPool(entry.id) };
  }
}

function SelectionWorkflowDialog({
  entry,
  activePage,
  form,
  templates,
  result,
  actionPending,
  onPageChange,
  onChange,
  onApplyTemplate,
  onSaveTemplate,
  onConfirm,
  onClose,
}) {
  const pages = [
    { key: 'detail', label: '商品详情', description: '经营快照与竞品画像' },
    { key: 'pricing', label: '测价参数', description: '成本、毛利与利润判断' },
  ];
  const pricingReady = form && result;

  return (
    <div className="selection-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="selection-dialog" role="dialog" aria-modal="true" aria-label="商品筛选详情">
        <aside className="selection-dialog-sidebar">
          <nav className="selection-dialog-nav" aria-label="商品弹窗分页">
            {pages.map((page) => (
              <button
                key={page.key}
                type="button"
                className={activePage === page.key ? 'is-active' : ''}
                onClick={() => onPageChange(page.key)}
              >
                <strong>{page.label}</strong>
              </button>
            ))}
          </nav>
        </aside>

        <main className="selection-dialog-main">
          <button type="button" className="selection-dialog-close" onClick={onClose}>关闭</button>
          {activePage === 'pricing' ? (
            pricingReady ? (
              <PricingDialogPage
                entry={entry}
                form={form}
                templates={templates}
                result={result}
                actionPending={actionPending}
                onChange={onChange}
                onApplyTemplate={onApplyTemplate}
                onSaveTemplate={onSaveTemplate}
                onConfirm={onConfirm}
              />
            ) : (
              <div className="wb-feedback is-busy">正在准备测价参数</div>
            )
          ) : (
            <CompetitorDetailPage entry={entry} />
          )}
        </main>
      </section>
    </div>
  );
}

function PricingDialogPage({
  entry,
  form,
  templates,
  result,
  actionPending,
  onChange,
  onApplyTemplate,
  onSaveTemplate,
  onConfirm,
}) {
  const [templateName, setTemplateName] = useState('');
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const dimension = getDimensionSummary(entry.item);
  const resultRows = result.ok
    ? [
        ['商品原价（折前）', `${formatCurrency(result.originalPriceRub, 'RUB')} / ${formatCurrency(result.originalPriceRmb, 'CNY')}`],
        ['预估售价', `${formatCurrency(result.salePriceRub, 'RUB')} / ${formatCurrency(result.salePriceRmb, 'CNY')}`],
        ['总成本', formatCurrency(result.totalCost, 'CNY')],
        ['利润', `${formatCurrency(result.profit, 'CNY')} · ${formatPercent(result.actualProfitRate * 100)}`, result.profit < 0 ? 'is-danger' : 'is-good'],
      ]
    : [];
  const incomeRows = result.ok
    ? [
        ['商品原价（折前）', `${formatCurrency(result.originalPriceRub, 'RUB')} / ${formatCurrency(result.originalPriceRmb, 'CNY')}`],
        ['商品售价（折后）', `${formatCurrency(result.salePriceRub, 'RUB')} / ${formatCurrency(result.salePriceRmb, 'CNY')}`],
        ['利润', formatCurrency(result.profit, 'CNY')],
        ['利润率', formatPercent(result.actualProfitRate * 100)],
      ]
    : [];
  const costRows = result.ok
    ? [
        ['采购成本', formatCurrency(result.input.purchaseCost, 'CNY')],
        ['境内运费', formatCurrency(result.input.chinaFee, 'CNY')],
        ['跨境物流费', formatCurrency(result.logisticsFee, 'CNY')],
        ['平台佣金', `${formatCurrency(result.commission, 'CNY')} · ${formatPercent(result.categoryRate * 100)}`],
        ['广告费用', `${formatCurrency(result.adsFee, 'CNY')} · ${formatPercent(result.input.adsRate * 100)}`],
        ['提现手续费', `${formatCurrency(result.cashFee, 'CNY')} · ${formatPercent(result.input.cashRate * 100)}`],
        ['退货损耗', `${formatCurrency(result.refundFee, 'CNY')} · ${formatPercent(result.input.refundRate * 100)}`],
        ['其他费用', formatCurrency(result.input.otherFee, 'CNY')],
      ]
    : [];

  return (
    <div className="selection-dialog-page pricing-dialog-page">
      <div className="pricing-dialog-body">
          <section className="pricing-dialog-form">
            <div className="pricing-template-bar">
              <label className="pricing-field">
                <span>参数模板</span>
                <select defaultValue="" onChange={(event) => {
                  if (event.target.value) onApplyTemplate(event.target.value);
                  event.target.value = '';
                }}>
                  <option value="">选择模板快速填充</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
            </label>
              <div className="pricing-template-actions">
                <button type="button" onClick={() => setSaveTemplateOpen((open) => !open)}>
                  另存为模板
                </button>
              </div>
            </div>

            {saveTemplateOpen ? (
              <div className="pricing-save-template">
                <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="输入模板名称" />
                <button type="button" onClick={() => {
                  onSaveTemplate(templateName);
                  setTemplateName('');
                  setSaveTemplateOpen(false);
                }}>保存模板</button>
              </div>
            ) : null}

            <div className="pricing-field-sections">
              <div className="pricing-field-section is-primary">
                <PricingNumberField className="is-emphasis" testId="pricing-purchase-cost" label="采购价" unit="¥" value={form.purchaseCost} onChange={(value) => onChange('purchaseCost', value)} />
                <PricingNumberField label="目标毛利" unit={form.profitType === 'amount' ? '¥' : '%'} value={form.profitVal} onChange={(value) => onChange('profitVal', value)} />
                <label className="pricing-field">
                  <span>模式</span>
                  <select value={form.profitType} onChange={(event) => onChange('profitType', event.target.value)}>
                    <option value="rate">毛利率</option>
                    <option value="amount">毛利额</option>
                  </select>
                </label>
                <PricingNumberField label="折扣" unit="%" value={form.discount} onChange={(value) => onChange('discount', value)} />
                <PricingNumberField label="境内运费" unit="¥" value={form.chinaFee} onChange={(value) => onChange('chinaFee', value)} />
                <PricingNumberField label="跨境物流" unit="¥" value={form.manualLogisticsFee} onChange={(value) => onChange('manualLogisticsFee', value)} />
              </div>

              <button className="pricing-advanced-toggle" type="button" onClick={() => setAdvancedOpen((open) => !open)}>
                {advancedOpen ? '收起高级参数' : '展开高级参数'}
              </button>

              {advancedOpen ? (
                <div className="pricing-advanced-panel">
                  <div className="pricing-field-section">
                    <PricingNumberField label="广告" unit="%" value={form.adsRate} onChange={(value) => onChange('adsRate', value)} />
                    <PricingNumberField label="提现" unit="%" value={form.cashRate} onChange={(value) => onChange('cashRate', value)} />
                    <PricingNumberField label="退货损耗" unit="%" value={form.refundRate} onChange={(value) => onChange('refundRate', value)} />
                    <PricingNumberField label="其他费用" unit="¥" value={form.otherFee} onChange={(value) => onChange('otherFee', value)} />
                  </div>

                  <div className="pricing-field-section">
                    <PricingNumberField label="重量" unit="g" step="1" value={form.weight} onChange={(value) => onChange('weight', value)} />
                    <PricingNumberField label="长" unit="cm" value={form.volumeL} onChange={(value) => onChange('volumeL', value)} />
                    <PricingNumberField label="宽" unit="cm" value={form.volumeW} onChange={(value) => onChange('volumeW', value)} />
                    <PricingNumberField label="高" unit="cm" value={form.volumeH} onChange={(value) => onChange('volumeH', value)} />
                  </div>

                  <label className="pricing-field">
                    <span>类目佣金</span>
                    <select value={form.categoryId} onChange={(event) => onChange('categoryId', event.target.value)}>
                      {categoryRates.map((item) => (
                        <option key={item.cId} value={item.cId}>{item.name} · {formatPercent(Number(item.rate) * 100)}</option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </div>
          </section>

          <aside className="pricing-dialog-result">
            {result.ok ? (
              <div className="pricing-result-stack">
                <div className="pricing-result-head">
                  <span>竞品价格</span>
                  <strong>{formatCurrency(entry.item.avg_price_rub, 'RUB')} / {formatCurrency(entry.item.avg_price_cny, 'CNY')}</strong>
                  <small>{dimension.weightText} · {dimension.sizeText}</small>
                </div>

                <div className="pricing-result-lines">
                  {resultRows.map(([label, value, tone]) => (
                    <div className="pricing-result-line" key={label}>
                      <span>{label}</span>
                      <strong className={tone || ''}>{value}</strong>
                    </div>
                  ))}
                </div>

                <section className="pricing-breakdown">
                  <button type="button" className="pricing-breakdown-toggle" onClick={() => setDetailsOpen((open) => !open)}>
                    <span>收入 / 成本明细</span>
                    <strong>{formatCurrency(result.salePriceRmb, 'CNY')} / {formatCurrency(result.totalCost, 'CNY')}</strong>
                    <em>{detailsOpen ? '收起' : '展开'}</em>
                  </button>

                  {detailsOpen ? (
                    <div className="pricing-breakdown-grid">
                      <PricingBreakdownGroup title="收入" rows={incomeRows} />
                      <PricingBreakdownGroup title="成本" rows={costRows} />
                    </div>
                  ) : null}
                </section>
              </div>
            ) : (
              <div className="wb-feedback is-error">{result.error || '当前参数无法生成测价结果'}</div>
            )}
          </aside>
      </div>

      <footer className="pricing-result-actions">
        <button type="button" className="wb-button wb-button-primary" onClick={() => void onConfirm('continue')} disabled={actionPending || !result.ok}>
          通过，进入找货
        </button>
        <button type="button" className="wb-button danger" onClick={() => void onConfirm('reject')} disabled={actionPending || !result.ok}>
          利润不成立
        </button>
      </footer>
    </div>
  );
}

function PricingBreakdownGroup({ title, rows }) {
  return (
    <article className="pricing-breakdown-group">
      <h4>{title}</h4>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function PricingNumberField({ label, unit, value, step = '0.01', testId, className = '', onChange }) {
  return (
    <label className={`pricing-field ${className}`}>
      <span>{label}</span>
      <div className="pricing-unit-input">
        <input
          data-testid={testId ? `selection-${testId}` : undefined}
          type="number"
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <b>{unit}</b>
      </div>
    </label>
  );
}

function CompetitorDetailPage({ entry }) {
  const { item } = entry;
  const dimension = getDimensionSummary(item);
  const metricGroups = [
    {
      title: '销售表现',
      items: [
        ['销售量', formatNumber(item.sales_volume)],
        ['销售金额', `${formatIntegerCurrency(item.sales_amount, 'RUB')} / ${formatIntegerCurrency(item.sales_amount_cny, 'CNY')}`],
        ['均价', `${formatCurrency(item.avg_price_rub, 'RUB')} / ${formatCurrency(item.avg_price_cny, 'CNY')}`],
        ['潜力指数', formatNumber(item.potential_index, 0)],
      ],
    },
    {
      title: '流量与转化',
      items: [
        ['曝光 / 点击', `${formatNumber(item.impressions)} / ${formatNumber(item.clicks)}`],
        ['点击率', formatPercent(item.view_rate)],
        ['转化率', formatPercent(item.order_conversion_rate)],
        ['毛利率', formatPercent(item.estimated_gross_margin)],
      ],
    },
    {
      title: '广告与物流',
      items: [
        ['广告费用', `${formatIntegerCurrency(item.ad_cost, 'RUB')} / ${formatIntegerCurrency(item.ad_cost_cny, 'CNY')}`],
        ['广告占比', formatIntegerPercent(item.ad_cost_rate)],
        ['物流方式', formatText(item.shipping_mode)],
        ['配送时效', formatDeliveryDays(item.delivery_time)],
      ],
    },
    {
      title: '尺寸与来源',
      items: [
        ['尺寸', dimension.sizeText],
        ['重量', dimension.weightText],
        ['来源批次', `#${formatText(entry.sourceJobId)} / ${formatJobType(entry.sourcePageType)}`],
        ['采集时间', formatDate(entry.sourceFinishedAt)],
      ],
    },
  ];

  return (
    <div className="competitor-detail-page">
      <div className="competitor-detail-media">
          <div className="competitor-detail-image-frame">
            {item.product_image_url ? (
              <img src={item.product_image_url} alt="" loading="lazy" />
            ) : (
              <span className="product-image-placeholder" />
            )}
          </div>
      </div>

      <div className="competitor-detail-content">
          <header className="selection-dialog-head competitor-detail-head">
            <div className="competitor-detail-identity">
              <p className="wb-kicker">Competitor Snapshot</p>
              <h3>{formatText(item.title)}</h3>
              <div className="competitor-detail-sub">
                <span>{formatText(item.brand)}</span>
                <span>{formatText(item.shop_name)}</span>
                <span className="mono">{formatText(item.platform_product_id)}</span>
              </div>
            </div>
          </header>

          <div className="competitor-detail-meta">
            <span>{formatText(item.product_type)}</span>
            <span>{formatText(item.category_level_1)} / {formatText(item.category_level_2)} / {formatText(item.category_level_3)}</span>
            <span>创建 {formatText(item.product_created_date)}</span>
            {item.product_url ? <a className="competitor-detail-origin-link" href={item.product_url} target="_blank" rel="noreferrer">打开原商品</a> : null}
          </div>

          <div className="competitor-detail-grid">
            {metricGroups.map((group) => (
              <article className="competitor-detail-section" key={group.title}>
                <h4>{group.title}</h4>
                <dl>
                  {group.items.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, compact = false }) {
  return (
    <article className={`result-metric-card ${compact ? 'is-compact' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
