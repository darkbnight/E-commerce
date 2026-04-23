import { existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_DB_PATH = path.resolve(import.meta.dirname, '..', '..', '..', '..', 'db', 'ecommerce-workbench.sqlite');
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
    sourceSnapshotId: Number(row.id),
    platform: row.platform || 'ozon',
    platformProductId: row.platform_product_id || row.ozon_product_id || '',
    pageName: row.page_name || '',
    pageType: row.page_type || '',
    finishedAt: row.finished_at || '',
    productNormalizedId: Number(row.id),
    ozonProductId: row.ozon_product_id || '',
    productType: row.product_type || '',
    brand: row.brand || '',
    title: row.title || '',
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

function toJson(value, fallbackValue) {
  return JSON.stringify(value ?? fallbackValue);
}

function ensureProductContentResultTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_content_result (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      result_key TEXT NOT NULL UNIQUE,
      draft_id INTEGER,
      source_job_id INTEGER,
      source_snapshot_id INTEGER,
      product_normalized_id INTEGER,
      platform TEXT NOT NULL DEFAULT 'ozon',
      platform_product_id TEXT,
      offer_id TEXT,
      name TEXT,
      description TEXT,
      description_category_id INTEGER,
      type_id INTEGER,
      vendor TEXT,
      model_name TEXT,
      barcode TEXT,
      price TEXT,
      old_price TEXT,
      premium_price TEXT,
      min_price TEXT,
      currency_code TEXT,
      vat TEXT,
      warehouse_id TEXT,
      stock REAL,
      package_depth_mm REAL,
      package_width_mm REAL,
      package_height_mm REAL,
      package_weight_g REAL,
      images_json TEXT NOT NULL DEFAULT '[]',
      attributes_json TEXT NOT NULL DEFAULT '[]',
      ozon_import_item_json TEXT NOT NULL,
      raw_draft_json TEXT NOT NULL,
      result_status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_product_content_result_source
    ON product_content_result(source_job_id, source_snapshot_id);

    CREATE INDEX IF NOT EXISTS idx_product_content_result_product
    ON product_content_result(platform, platform_product_id);

    CREATE INDEX IF NOT EXISTS idx_product_content_result_status
    ON product_content_result(result_status);
  `);
}

function buildContentResultKey(draft) {
  const sourceJobId = draft.sourceJobId ?? 'no-job';
  const sourceProductId = draft.sourceSnapshotId
    ?? draft.productNormalizedId
    ?? draft.platformProductId
    ?? draft.ozonProductId
    ?? draft.id
    ?? 'no-product';
  return `${sourceJobId}:${sourceProductId}`;
}

function mapContentResultRow(row) {
  return {
    id: Number(row.id),
    resultKey: row.result_key,
    draftId: row.draft_id == null ? null : Number(row.draft_id),
    sourceJobId: row.source_job_id == null ? null : Number(row.source_job_id),
    sourceSnapshotId: row.source_snapshot_id == null ? null : Number(row.source_snapshot_id),
    productNormalizedId: row.product_normalized_id == null ? null : Number(row.product_normalized_id),
    platform: row.platform,
    platformProductId: row.platform_product_id || '',
    offerId: row.offer_id || '',
    name: row.name || '',
    description: row.description || '',
    descriptionCategoryId: row.description_category_id == null ? null : Number(row.description_category_id),
    typeId: row.type_id == null ? null : Number(row.type_id),
    vendor: row.vendor || '',
    modelName: row.model_name || '',
    barcode: row.barcode || '',
    price: row.price || '',
    oldPrice: row.old_price || '',
    premiumPrice: row.premium_price || '',
    minPrice: row.min_price || '',
    currencyCode: row.currency_code || '',
    vat: row.vat || '',
    warehouseId: row.warehouse_id || '',
    stock: row.stock == null ? null : Number(row.stock),
    packageDepthMm: row.package_depth_mm == null ? null : Number(row.package_depth_mm),
    packageWidthMm: row.package_width_mm == null ? null : Number(row.package_width_mm),
    packageHeightMm: row.package_height_mm == null ? null : Number(row.package_height_mm),
    packageWeightG: row.package_weight_g == null ? null : Number(row.package_weight_g),
    resultStatus: row.result_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getLatestCandidateJobId(db) {
  const row = db.prepare(`
    SELECT source_jobs.id
    FROM source_jobs
    WHERE source_jobs.job_status = 'success'
      AND EXISTS (
        SELECT 1
        FROM product_business_snapshots
        WHERE product_business_snapshots.job_id = source_jobs.id
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
      if (!tableExists(db, 'source_jobs') || !tableExists(db, 'product_business_snapshots')) {
        return null;
      }

      const resolvedJobId = parsePositiveInteger(sourceJobId) || getLatestCandidateJobId(db);
      if (!resolvedJobId) return [];

      const safeLimit = Math.min(Math.max(parsePositiveInteger(limit, DEFAULT_CANDIDATE_LIMIT), 1), 100);
      const rows = db.prepare(`
        SELECT product_business_snapshots.id,
               product_business_snapshots.job_id,
               product_business_snapshots.platform,
               product_business_snapshots.platform_product_id,
               product_business_snapshots.platform_product_id AS ozon_product_id,
               product_business_snapshots.product_type,
               product_business_snapshots.brand,
               product_business_snapshots.title,
               product_business_snapshots.category_level_1,
               product_business_snapshots.category_level_2,
               product_business_snapshots.category_level_3,
               product_business_snapshots.sales_volume AS sales,
               product_business_snapshots.sales_growth,
               product_business_snapshots.potential_index,
               product_business_snapshots.sales_amount AS revenue,
               product_business_snapshots.add_to_cart_rate,
               product_business_snapshots.impressions,
               product_business_snapshots.clicks,
               product_business_snapshots.view_rate,
               product_business_snapshots.ad_cost,
               product_business_snapshots.ad_cost_rate,
               product_business_snapshots.order_conversion_rate,
               product_business_snapshots.estimated_gross_margin,
               product_business_snapshots.shipping_mode,
               product_business_snapshots.delivery_time,
               product_business_snapshots.average_sales_amount,
               product_business_snapshots.length_cm,
               product_business_snapshots.width_cm,
               product_business_snapshots.height_cm,
               product_business_snapshots.weight_g,
               product_business_snapshots.created_at,
               source_jobs.page_name,
               source_jobs.page_type,
               source_jobs.finished_at
        FROM product_business_snapshots
        LEFT JOIN source_jobs ON source_jobs.id = product_business_snapshots.job_id
        WHERE product_business_snapshots.job_id = ?
        ORDER BY COALESCE(product_business_snapshots.sales_volume, 0) DESC,
                 COALESCE(product_business_snapshots.sales_amount, 0) DESC,
                 product_business_snapshots.id ASC
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
    sourceSnapshotId: candidate.sourceSnapshotId ?? candidate.productNormalizedId,
    productNormalizedId: candidate.productNormalizedId,
    platform: candidate.platform || 'ozon',
    platformProductId: candidate.platformProductId || candidate.ozonProductId || '',
    ozonProductId: candidate.ozonProductId || candidate.platformProductId || '',
    offerId: '',
    name: candidate.title || '',
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
    packageDepthMm: candidate.lengthCm == null ? null : Math.round(Number(candidate.lengthCm) * 10),
    packageWidthMm: candidate.widthCm == null ? null : Math.round(Number(candidate.widthCm) * 10),
    packageHeightMm: candidate.heightCm == null ? null : Math.round(Number(candidate.heightCm) * 10),
    packageWeightG: candidate.weightG ?? null,
    images: [],
    attributes: [],
    draftStatus: 'draft',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function saveContentResult({ dbPath, draft, exportItem }) {
  if (!draft || typeof draft !== 'object') {
    throw new Error('draft is required');
  }

  return withDb(dbPath, (db) => {
    ensureProductContentResultTable(db);

    const now = nowIso();
    const resultKey = buildContentResultKey(draft);
    const payload = {
      resultKey,
      draftId: toNumberOrNull(draft.id),
      sourceJobId: toNumberOrNull(draft.sourceJobId),
      sourceSnapshotId: toNumberOrNull(draft.sourceSnapshotId ?? draft.productNormalizedId),
      productNormalizedId: toNumberOrNull(draft.productNormalizedId),
      platform: draft.platform || 'ozon',
      platformProductId: toTextOrNull(draft.platformProductId || draft.ozonProductId),
      offerId: toTextOrNull(draft.offerId),
      name: toTextOrNull(draft.name),
      description: toTextOrNull(draft.description),
      descriptionCategoryId: toNumberOrNull(draft.descriptionCategoryId),
      typeId: toNumberOrNull(draft.typeId),
      vendor: toTextOrNull(draft.vendor),
      modelName: toTextOrNull(draft.modelName),
      barcode: toTextOrNull(draft.barcode),
      price: toTextOrNull(draft.price),
      oldPrice: toTextOrNull(draft.oldPrice),
      premiumPrice: toTextOrNull(draft.premiumPrice),
      minPrice: toTextOrNull(draft.minPrice),
      currencyCode: toTextOrNull(draft.currencyCode),
      vat: toTextOrNull(draft.vat),
      warehouseId: toTextOrNull(draft.warehouseId),
      stock: toNumberOrNull(draft.stock),
      packageDepthMm: toNumberOrNull(draft.packageDepthMm),
      packageWidthMm: toNumberOrNull(draft.packageWidthMm),
      packageHeightMm: toNumberOrNull(draft.packageHeightMm),
      packageWeightG: toNumberOrNull(draft.packageWeightG),
      imagesJson: toJson(draft.images, []),
      attributesJson: toJson(draft.attributes, []),
      ozonImportItemJson: toJson(exportItem, {}),
      rawDraftJson: toJson(draft, {}),
      resultStatus: draft.resultStatus || draft.draftStatus || 'draft',
      now,
    };

    db.prepare(`
      INSERT INTO product_content_result (
        result_key,
        draft_id,
        source_job_id,
        source_snapshot_id,
        product_normalized_id,
        platform,
        platform_product_id,
        offer_id,
        name,
        description,
        description_category_id,
        type_id,
        vendor,
        model_name,
        barcode,
        price,
        old_price,
        premium_price,
        min_price,
        currency_code,
        vat,
        warehouse_id,
        stock,
        package_depth_mm,
        package_width_mm,
        package_height_mm,
        package_weight_g,
        images_json,
        attributes_json,
        ozon_import_item_json,
        raw_draft_json,
        result_status,
        created_at,
        updated_at
      ) VALUES (
        @resultKey,
        @draftId,
        @sourceJobId,
        @sourceSnapshotId,
        @productNormalizedId,
        @platform,
        @platformProductId,
        @offerId,
        @name,
        @description,
        @descriptionCategoryId,
        @typeId,
        @vendor,
        @modelName,
        @barcode,
        @price,
        @oldPrice,
        @premiumPrice,
        @minPrice,
        @currencyCode,
        @vat,
        @warehouseId,
        @stock,
        @packageDepthMm,
        @packageWidthMm,
        @packageHeightMm,
        @packageWeightG,
        @imagesJson,
        @attributesJson,
        @ozonImportItemJson,
        @rawDraftJson,
        @resultStatus,
        @now,
        @now
      )
      ON CONFLICT(result_key) DO UPDATE SET
        draft_id = excluded.draft_id,
        source_job_id = excluded.source_job_id,
        source_snapshot_id = excluded.source_snapshot_id,
        product_normalized_id = excluded.product_normalized_id,
        platform = excluded.platform,
        platform_product_id = excluded.platform_product_id,
        offer_id = excluded.offer_id,
        name = excluded.name,
        description = excluded.description,
        description_category_id = excluded.description_category_id,
        type_id = excluded.type_id,
        vendor = excluded.vendor,
        model_name = excluded.model_name,
        barcode = excluded.barcode,
        price = excluded.price,
        old_price = excluded.old_price,
        premium_price = excluded.premium_price,
        min_price = excluded.min_price,
        currency_code = excluded.currency_code,
        vat = excluded.vat,
        warehouse_id = excluded.warehouse_id,
        stock = excluded.stock,
        package_depth_mm = excluded.package_depth_mm,
        package_width_mm = excluded.package_width_mm,
        package_height_mm = excluded.package_height_mm,
        package_weight_g = excluded.package_weight_g,
        images_json = excluded.images_json,
        attributes_json = excluded.attributes_json,
        ozon_import_item_json = excluded.ozon_import_item_json,
        raw_draft_json = excluded.raw_draft_json,
        result_status = excluded.result_status,
        updated_at = excluded.updated_at
    `).run(payload);

    const row = db.prepare(`
      SELECT *
      FROM product_content_result
      WHERE result_key = ?
      LIMIT 1
    `).get(resultKey);

    return mapContentResultRow(row);
  });
}

function listContentResults({ dbPath, limit }) {
  if (!existsSync(dbPath)) return [];

  return withDb(dbPath, (db) => {
    if (!tableExists(db, 'product_content_result')) return [];

    const safeLimit = Math.min(Math.max(parsePositiveInteger(limit, DEFAULT_CANDIDATE_LIMIT), 1), 100);
    const rows = db.prepare(`
      SELECT *
      FROM product_content_result
      ORDER BY updated_at DESC, id DESC
      LIMIT ?
    `).all(safeLimit);

    return rows.map(mapContentResultRow);
  });
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

    saveContentResult({ draft, exportItem }) {
      return saveContentResult({ dbPath, draft, exportItem });
    },

    listContentResults({ limit = DEFAULT_CANDIDATE_LIMIT } = {}) {
      return listContentResults({ dbPath, limit });
    },
  };
}
