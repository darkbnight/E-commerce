import { existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_DB_PATH = path.resolve(import.meta.dirname, '..', '..', '..', '..', 'db', 'menglar-mvp.sqlite');
const DEFAULT_CANDIDATE_LIMIT = 20;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

const state = {
  candidates: [
    {
      id: 501,
      sourceJobId: 32,
      pageName: '住宅和花园热销商品',
      pageType: 'hot_products',
      finishedAt: '2026-04-23 10:28',
      productNormalizedId: 2081,
      ozonProductId: '1676022059',
      productType: 'cross_border',
      brand: 'Generic',
      categoryLevels: ['Дом и сад', 'Уборка', 'Салфетки'],
      screeningStatus: 'candidate',
      sales: 1850,
      revenue: 356000,
      estimatedGrossMargin: 26.5,
      impressions: 152000,
      clicks: 12400,
      shippingMode: 'FBO',
      deliveryTime: '2-4 days',
      lengthCm: 30,
      widthCm: 40,
      heightCm: 2,
      weightG: 180,
      createdAt: '2026-04-22T12:00:00.000Z',
    },
    {
      id: 502,
      sourceJobId: 32,
      pageName: '住宅和花园热销商品',
      pageType: 'hot_products',
      finishedAt: '2026-04-23 10:28',
      productNormalizedId: 2084,
      ozonProductId: '1792831404',
      productType: 'cross_border',
      brand: 'No Brand',
      categoryLevels: ['Дом и сад', 'Кухня', 'Тряпки'],
      screeningStatus: 'candidate',
      sales: 920,
      revenue: 182400,
      estimatedGrossMargin: 19.2,
      impressions: 83000,
      clicks: 7300,
      shippingMode: 'FBS',
      deliveryTime: '3-5 days',
      lengthCm: 25,
      widthCm: 25,
      heightCm: 3,
      weightG: 220,
      createdAt: '2026-04-22T12:02:00.000Z',
    },
  ],
  drafts: [
    {
      id: 9001,
      sourceJobId: 32,
      productNormalizedId: 2081,
      offerId: 'CLOTH-30X40-2PK-GREY',
      name: 'Cleaning Cloth Microfiber 30x40 cm 2 pcs Grey',
      description: 'Reusable cleaning cloth for kitchen and household use.',
      descriptionCategoryId: 17031663,
      typeId: 100001234,
      vendor: 'Generic',
      barcode: '2000000000011',
      price: '199',
      oldPrice: '259',
      premiumPrice: '189',
      minPrice: '179',
      currencyCode: 'CNY',
      vat: '0',
      warehouseId: 123456789,
      stock: 50,
      packageDepthMm: 30,
      packageWidthMm: 200,
      packageHeightMm: 300,
      packageWeightG: 120,
      images: [
        { url: 'https://example.com/cloth-main.jpg', sortOrder: 1, isMain: true },
        { url: 'https://example.com/cloth-detail.jpg', sortOrder: 2, isMain: false },
      ],
      attributes: [
        {
          attributeId: 85,
          name: 'Brand',
          isRequired: true,
          dictionaryId: 0,
          complexId: 0,
          values: [{ value: 'Generic' }],
        },
        {
          attributeId: 8229,
          name: 'Pieces',
          isRequired: true,
          dictionaryId: 0,
          complexId: 0,
          values: [{ value: '2' }],
        },
      ],
      draftStatus: 'ready',
      createdAt: '2026-04-22T12:05:00.000Z',
      updatedAt: '2026-04-22T12:05:00.000Z',
    },
    {
      id: 9002,
      sourceJobId: 32,
      productNormalizedId: 2084,
      offerId: '',
      name: '',
      description: '',
      descriptionCategoryId: null,
      typeId: null,
      vendor: '',
      barcode: '',
      price: '',
      oldPrice: '',
      premiumPrice: '',
      minPrice: '',
      currencyCode: '',
      vat: '',
      warehouseId: null,
      stock: 0,
      packageDepthMm: null,
      packageWidthMm: null,
      packageHeightMm: null,
      packageWeightG: null,
      images: [],
      attributes: [],
      draftStatus: 'draft',
      createdAt: '2026-04-22T12:06:00.000Z',
      updatedAt: '2026-04-22T12:06:00.000Z',
    },
  ],
};

let nextDraftId = 9003;

function parsePositiveInteger(value, fallbackValue = null) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallbackValue;
  }
  return parsed;
}

function toNumberOrNull(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toTextOrNull(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function buildCategoryLevels(row) {
  return [
    row.category_level_1,
    row.category_level_2,
    row.category_level_3,
  ].map(toTextOrNull).filter(Boolean);
}

function mapCandidateRow(row) {
  return {
    id: Number(row.id),
    sourceJobId: Number(row.job_id),
    pageName: row.page_name || '',
    pageType: row.page_type || '',
    finishedAt: row.finished_at || '',
    productNormalizedId: Number(row.id),
    ozonProductId: row.ozon_product_id || '',
    productType: row.product_type || '',
    brand: row.brand || '',
    categoryLevels: buildCategoryLevels(row),
    screeningStatus: 'candidate',
    sales: toNumberOrNull(row.sales),
    salesGrowth: toNumberOrNull(row.sales_growth),
    potentialIndex: toNumberOrNull(row.potential_index),
    revenue: toNumberOrNull(row.revenue),
    addToCartRate: toNumberOrNull(row.add_to_cart_rate),
    impressions: toNumberOrNull(row.impressions),
    clicks: toNumberOrNull(row.clicks),
    viewRate: toNumberOrNull(row.view_rate),
    adCost: toNumberOrNull(row.ad_cost),
    adCostRate: toNumberOrNull(row.ad_cost_rate),
    orderConversionRate: toNumberOrNull(row.order_conversion_rate),
    estimatedGrossMargin: toNumberOrNull(row.estimated_gross_margin),
    shippingMode: row.shipping_mode || '',
    deliveryTime: row.delivery_time || '',
    averageSalesAmount: toNumberOrNull(row.average_sales_amount),
    lengthCm: toNumberOrNull(row.length_cm),
    widthCm: toNumberOrNull(row.width_cm),
    heightCm: toNumberOrNull(row.height_cm),
    weightG: toNumberOrNull(row.weight_g),
    createdAt: row.created_at || '',
  };
}

function withDb(dbPath, run) {
  const db = new DatabaseSync(dbPath, { open: true });
  try {
    return run(db);
  } finally {
    db.close();
  }
}

function tableExists(db, tableName) {
  return Boolean(db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
    LIMIT 1
  `).get(tableName));
}

function getLatestCandidateJobId(db) {
  const row = db.prepare(`
    SELECT source_jobs.id
    FROM source_jobs
    WHERE source_jobs.job_status = 'success'
      AND EXISTS (
        SELECT 1
        FROM products_normalized
        WHERE products_normalized.job_id = source_jobs.id
        LIMIT 1
      )
    ORDER BY source_jobs.id DESC
    LIMIT 1
  `).get();

  return row ? Number(row.id) : null;
}

function readDbCandidates({ dbPath, sourceJobId, limit }) {
  if (!existsSync(dbPath)) return null;

  try {
    return withDb(dbPath, (db) => {
      if (!tableExists(db, 'source_jobs') || !tableExists(db, 'products_normalized')) {
        return null;
      }

      const resolvedJobId = parsePositiveInteger(sourceJobId) || getLatestCandidateJobId(db);
      if (!resolvedJobId) return [];

      const safeLimit = Math.min(Math.max(parsePositiveInteger(limit, DEFAULT_CANDIDATE_LIMIT), 1), 100);
      const rows = db.prepare(`
        SELECT products_normalized.id,
               products_normalized.job_id,
               products_normalized.ozon_product_id,
               products_normalized.product_type,
               products_normalized.brand,
               products_normalized.category_level_1,
               products_normalized.category_level_2,
               products_normalized.category_level_3,
               products_normalized.sales,
               products_normalized.sales_growth,
               products_normalized.potential_index,
               products_normalized.revenue,
               products_normalized.add_to_cart_rate,
               products_normalized.impressions,
               products_normalized.clicks,
               products_normalized.view_rate,
               products_normalized.ad_cost,
               products_normalized.ad_cost_rate,
               products_normalized.order_conversion_rate,
               products_normalized.estimated_gross_margin,
               products_normalized.shipping_mode,
               products_normalized.delivery_time,
               products_normalized.average_sales_amount,
               products_normalized.length_cm,
               products_normalized.width_cm,
               products_normalized.height_cm,
               products_normalized.weight_g,
               products_normalized.created_at,
               source_jobs.page_name,
               source_jobs.page_type,
               source_jobs.finished_at
        FROM products_normalized
        LEFT JOIN source_jobs ON source_jobs.id = products_normalized.job_id
        WHERE products_normalized.job_id = ?
        ORDER BY COALESCE(products_normalized.sales, 0) DESC,
                 COALESCE(products_normalized.revenue, 0) DESC,
                 products_normalized.id ASC
        LIMIT ?
      `).all(resolvedJobId, safeLimit);

      return rows.map(mapCandidateRow);
    });
  } catch (error) {
    console.warn(`[product-data-prep] Failed to read DB candidates: ${error.message}`);
    return null;
  }
}

function buildDraftFromCandidate(candidate) {
  return {
    id: nextDraftId++,
    sourceJobId: candidate.sourceJobId,
    productNormalizedId: candidate.productNormalizedId,
    offerId: '',
    name: '',
    description: '',
    descriptionCategoryId: null,
    typeId: null,
    vendor: candidate.brand || '',
    barcode: '',
    price: '',
    oldPrice: '',
    premiumPrice: '',
    minPrice: '',
    currencyCode: '',
    vat: '',
    warehouseId: null,
    stock: 0,
    packageDepthMm: candidate.heightCm == null ? null : Math.round(Number(candidate.heightCm) * 10),
    packageWidthMm: candidate.widthCm == null ? null : Math.round(Number(candidate.widthCm) * 10),
    packageHeightMm: candidate.lengthCm == null ? null : Math.round(Number(candidate.lengthCm) * 10),
    packageWeightG: candidate.weightG ?? null,
    images: [],
    attributes: [],
    draftStatus: 'draft',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export function createProductDataPrepRepository({ dbPath = DEFAULT_DB_PATH } = {}) {
  let lastCandidateSource = 'module-mock';

  return {
    listCandidates({ sourceJobId = null, limit = DEFAULT_CANDIDATE_LIMIT } = {}) {
      const dbItems = readDbCandidates({ dbPath, sourceJobId, limit });
      if (dbItems !== null) {
        lastCandidateSource = 'sqlite-db';
        return clone(dbItems);
      }

      lastCandidateSource = 'module-mock';
      const safeLimit = Math.min(Math.max(parsePositiveInteger(limit, DEFAULT_CANDIDATE_LIMIT), 1), 100);
      const items = state.candidates.filter((candidate) => (
        sourceJobId == null || Number(candidate.sourceJobId) === Number(sourceJobId)
      ));
      return clone(items).slice(0, safeLimit);
    },

    getLastCandidateSource() {
      return lastCandidateSource;
    },

    listDrafts({ draftStatus = '' } = {}) {
      const items = state.drafts.filter((draft) => (
        !draftStatus || draft.draftStatus === draftStatus
      ));
      return clone(items);
    },

    getDraftById(draftId) {
      const draft = state.drafts.find((item) => Number(item.id) === Number(draftId));
      return draft ? clone(draft) : null;
    },

    createDraftFromCandidate(candidateId) {
      const mockCandidate = state.candidates.find((item) => Number(item.id) === Number(candidateId));
      const dbCandidate = mockCandidate ? null : readDbCandidates({ dbPath, limit: 100 })
        ?.find((item) => Number(item.id) === Number(candidateId));
      const candidate = mockCandidate || dbCandidate;
      if (!candidate) return null;

      const existing = state.drafts.find((item) => Number(item.productNormalizedId) === Number(candidate.productNormalizedId));
      if (existing) return clone(existing);

      const draft = buildDraftFromCandidate(candidate);
      state.drafts.unshift(draft);
      return clone(draft);
    },

    updateDraft(draftId, patch) {
      const draft = state.drafts.find((item) => Number(item.id) === Number(draftId));
      if (!draft) return null;

      const normalizedPatch = clone(patch);
      Object.assign(draft, normalizedPatch, {
        updatedAt: nowIso(),
      });
      return clone(draft);
    },
  };
}
