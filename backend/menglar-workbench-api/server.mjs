import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import {
  buildTemplate,
  loadItemsPayload,
  OzonSellerClient,
  OZON_DEFAULT_LANGUAGE,
  validatePriceItems,
  validateProductItems,
  validateStockItems,
} from '../../scripts/lib/ozon-seller-client.mjs';
import {
  calculateShipping,
  calculateShippingBatch,
  compareShipping,
  getShippingRuleInfo,
  listShippingMethods,
} from './lib/shipping-engine.mjs';
import {
  handleProductDataPrepRoute,
  isProductDataPrepRoute,
} from './modules/product-data-prep/route.mjs';
import { checkMenglarLoginHealth } from '../../scripts/menglar-capture/lib/login-health.mjs';
import { compressImageDirectoriesToJpg } from '../../scripts/图片压缩工具/compress-images-to-jpg.mjs';

const ROOT = import.meta.dirname;
const PORT = Number(process.env.PORT || 4186);
const DB_PATH = process.env.ECOMMERCE_WORKBENCH_DB_PATH ||
  path.resolve(ROOT, '..', '..', 'db', 'ecommerce-workbench.sqlite');
const WORKBENCH_DIST = path.resolve(ROOT, '..', '..', 'frontend', 'menglar-workbench', 'dist');
const PRODUCT_SELECTION_STAGE_VALUES = new Set([
  'pool_pending',
  'screening_rejected',
  'pricing_pending',
  'pricing_rejected',
  'source_pending',
  'competitor_pending',
  'prep_ready',
]);
const PRODUCT_SELECTION_PRICING_DECISION_VALUES = new Set(['pending', 'continue', 'reject']);
const PRODUCT_SELECTION_SUPPLY_STATUS_VALUES = new Set(['pending', 'matched']);
const PRODUCT_SELECTION_COMPETITOR_STATUS_VALUES = new Set(['pending', 'ready']);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendError(res, statusCode, message, details = null) {
  sendJson(res, statusCode, {
    error: message,
    details,
  });
}

function nowIso() {
  return new Date().toISOString();
}

function toIsoDate(value) {
  if (!value) return nowIso().slice(0, 10);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return nowIso().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function safePath(urlPath) {
  const cleanPath = decodeURIComponent((urlPath || '/').split('?')[0]);
  const resolved = path.resolve(WORKBENCH_DIST, cleanPath === '/' ? 'index.html' : `.${cleanPath}`);
  if (!resolved.startsWith(WORKBENCH_DIST)) {
    return null;
  }
  return resolved;
}

function withDb(run) {
  const db = new DatabaseSync(DB_PATH, { open: true });
  try {
    return run(db);
  } finally {
    db.close();
  }
}

function ensureSourceJobsMetricsColumns(db) {
  const table = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = 'source_jobs'
  `).get();
  if (!table) return;

  const columns = db.prepare('PRAGMA table_info(source_jobs)').all();
  const names = new Set(columns.map((column) => column.name));
  const additions = [
    ['request_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['success_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['record_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['error_type', 'TEXT'],
  ];

  for (const [name, definition] of additions) {
    if (!names.has(name)) {
      db.exec(`ALTER TABLE source_jobs ADD COLUMN ${name} ${definition}`);
    }
  }
}

function ensureProductBusinessSnapshotColumns(db) {
  const table = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = 'product_business_snapshots'
  `).get();
  if (!table) return;

  const columns = db.prepare('PRAGMA table_info(product_business_snapshots)').all();
  const names = new Set(columns.map((column) => column.name));
  const additions = [
    ['product_image_url', 'TEXT'],
    ['shop_id', 'TEXT'],
    ['shop_name', 'TEXT'],
    ['product_created_date', 'TEXT'],
    ['sales_amount_cny', 'REAL'],
    ['avg_price_rub', 'REAL'],
    ['avg_price_cny', 'REAL'],
    ['ad_cost_cny', 'REAL'],
  ];

  for (const [name, definition] of additions) {
    if (!names.has(name)) {
      db.exec(`ALTER TABLE product_business_snapshots ADD COLUMN ${name} ${definition}`);
    }
  }
}

function ensureProductSelectionItemsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_selection_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_job_id INTEGER NOT NULL,
      source_snapshot_id INTEGER NOT NULL,
      source_platform TEXT NOT NULL DEFAULT 'ozon',
      source_platform_product_id TEXT NOT NULL,
      selection_stage TEXT NOT NULL DEFAULT 'pool_pending',
      selection_result TEXT,
      selection_note TEXT,
      initial_cost_price REAL,
      initial_delivery_cost REAL,
      initial_target_price REAL,
      initial_profit_rate REAL,
      pricing_decision TEXT NOT NULL DEFAULT 'pending',
      supply_match_status TEXT NOT NULL DEFAULT 'pending',
      supply_reference_url TEXT,
      supply_vendor_name TEXT,
      competitor_packet_status TEXT NOT NULL DEFAULT 'pending',
      transfer_to_prep_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(source_job_id, source_platform, source_platform_product_id)
    );

    CREATE INDEX IF NOT EXISTS idx_product_selection_items_job
    ON product_selection_items(source_job_id);

    CREATE INDEX IF NOT EXISTS idx_product_selection_items_snapshot
    ON product_selection_items(source_snapshot_id);

    CREATE INDEX IF NOT EXISTS idx_product_selection_items_stage
    ON product_selection_items(selection_stage);

    CREATE INDEX IF NOT EXISTS idx_product_selection_items_product
    ON product_selection_items(source_platform, source_platform_product_id);
  `);
}

function ensureProductContentTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_content_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_job_id INTEGER,
      platform TEXT NOT NULL DEFAULT 'ozon',
      platform_product_id TEXT NOT NULL,
      product_url TEXT,
      title TEXT,
      description TEXT,
      tags_json TEXT,
      main_image_url TEXT,
      image_urls_json TEXT,
      content_hash TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(platform, platform_product_id, content_hash)
    );

    CREATE INDEX IF NOT EXISTS idx_product_content_assets_product
    ON product_content_assets(platform, platform_product_id);

    CREATE INDEX IF NOT EXISTS idx_product_content_assets_source_job
    ON product_content_assets(source_job_id);

    CREATE INDEX IF NOT EXISTS idx_product_content_assets_captured_at
    ON product_content_assets(captured_at);

    CREATE TABLE IF NOT EXISTS product_content_skus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_asset_id INTEGER NOT NULL,
      source_job_id INTEGER,
      platform TEXT NOT NULL DEFAULT 'ozon',
      platform_product_id TEXT NOT NULL,
      platform_sku_id TEXT NOT NULL,
      sku_name TEXT,
      price REAL,
      currency_code TEXT,
      images_json TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      captured_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(content_asset_id, platform_sku_id)
    );

    CREATE INDEX IF NOT EXISTS idx_product_content_skus_content_asset
    ON product_content_skus(content_asset_id);

    CREATE INDEX IF NOT EXISTS idx_product_content_skus_product
    ON product_content_skus(platform, platform_product_id);

    CREATE INDEX IF NOT EXISTS idx_product_content_skus_source_job
    ON product_content_skus(source_job_id);
  `);

  const assetColumns = new Set(db.prepare('PRAGMA table_info(product_content_assets)').all().map((column) => column.name));
  const assetAdditions = [
    ['source_job_id', 'INTEGER'],
    ['platform', "TEXT NOT NULL DEFAULT 'ozon'"],
    ['product_url', 'TEXT'],
    ['title', 'TEXT'],
    ['description', 'TEXT'],
    ['tags_json', 'TEXT'],
    ['main_image_url', 'TEXT'],
    ['image_urls_json', 'TEXT'],
    ['content_hash', "TEXT NOT NULL DEFAULT ''"],
    ['captured_at', "TEXT NOT NULL DEFAULT ''"],
    ['created_at', "TEXT NOT NULL DEFAULT ''"],
    ['updated_at', "TEXT NOT NULL DEFAULT ''"],
  ];
  for (const [name, definition] of assetAdditions) {
    if (!assetColumns.has(name)) {
      db.exec(`ALTER TABLE product_content_assets ADD COLUMN ${name} ${definition}`);
    }
  }

  const skuColumns = new Set(db.prepare('PRAGMA table_info(product_content_skus)').all().map((column) => column.name));
  const skuAdditions = [
    ['source_job_id', 'INTEGER'],
    ['platform', "TEXT NOT NULL DEFAULT 'ozon'"],
    ['platform_product_id', "TEXT NOT NULL DEFAULT ''"],
    ['sku_name', 'TEXT'],
    ['price', 'REAL'],
    ['currency_code', 'TEXT'],
    ['images_json', 'TEXT'],
    ['sort_order', 'INTEGER NOT NULL DEFAULT 0'],
    ['captured_at', "TEXT NOT NULL DEFAULT ''"],
    ['created_at', "TEXT NOT NULL DEFAULT ''"],
    ['updated_at', "TEXT NOT NULL DEFAULT ''"],
  ];
  for (const [name, definition] of skuAdditions) {
    if (!skuColumns.has(name)) {
      db.exec(`ALTER TABLE product_content_skus ADD COLUMN ${name} ${definition}`);
    }
  }
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function toNullableText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function toNullableNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJsonText(value, fallback) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function expectEnumValue(value, enumSet, fieldName) {
  if (value == null) return null;
  const text = String(value);
  if (!enumSet.has(text)) {
    throw new Error(`${fieldName} 非法`);
  }
  return text;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('请求体不是合法 JSON');
  }
}

function deriveSelectionResult(stage, pricingDecision) {
  if (stage === 'screening_rejected' || stage === 'pricing_rejected' || pricingDecision === 'reject') {
    return 'rejected';
  }
  if (stage === 'prep_ready') {
    return 'ready_for_prep';
  }
  if (stage === 'source_pending' || stage === 'competitor_pending' || pricingDecision === 'continue') {
    return 'active';
  }
  return 'pending';
}

function resolveAutoDeliveryCost(snapshot) {
  const price = toNullableNumber(snapshot.avg_price_cny);
  const lengthCm = toNullableNumber(snapshot.length_cm);
  const widthCm = toNullableNumber(snapshot.width_cm);
  const heightCm = toNullableNumber(snapshot.height_cm);
  const weightG = toNullableNumber(snapshot.weight_g);

  if ([price, lengthCm, widthCm, heightCm, weightG].some((value) => value == null || value <= 0)) {
    return null;
  }

  const compareInput = {
    originCountry: 'CN',
    warehouseType: 'seller_warehouse',
    salesScheme: 'realFBS',
    price,
    lengthCm,
    widthCm,
    heightCm,
    weightG,
    orderDate: toIsoDate(snapshot.finished_at || snapshot.captured_at || snapshot.created_at),
    includeXlsxCandidates: false,
  };

  const primaryResult = compareShipping(compareInput);
  if (primaryResult.items.length) {
    return primaryResult.items[0].result.totalLogisticsCost;
  }

  const fallbackResult = compareShipping({
    ...compareInput,
    includeXlsxCandidates: true,
  });
  if (fallbackResult.items.length) {
    return fallbackResult.items[0].result.totalLogisticsCost;
  }

  return null;
}

function mapSelectionItemRow(row) {
  return {
    id: Number(row.id),
    item: {
      id: Number(row.source_snapshot_id),
      job_id: Number(row.source_job_id),
      platform: row.platform,
      platform_product_id: row.platform_product_id,
      product_url: row.product_url,
      product_image_url: row.product_image_url,
      shop_id: row.shop_id,
      shop_name: row.shop_name,
      product_type: row.product_type,
      brand: row.brand,
      title: row.title,
      product_created_date: row.product_created_date,
      category_level_1: row.category_level_1,
      category_level_2: row.category_level_2,
      category_level_3: row.category_level_3,
      sales_volume: row.sales_volume,
      sales_growth: row.sales_growth,
      potential_index: row.potential_index,
      sales_amount: row.sales_amount,
      sales_amount_cny: row.sales_amount_cny,
      avg_price_rub: row.avg_price_rub,
      avg_price_cny: row.avg_price_cny,
      add_to_cart_rate: row.add_to_cart_rate,
      impressions: row.impressions,
      clicks: row.clicks,
      view_rate: row.view_rate,
      ad_cost: row.ad_cost,
      ad_cost_cny: row.ad_cost_cny,
      ad_cost_rate: row.ad_cost_rate,
      order_conversion_rate: row.order_conversion_rate,
      estimated_gross_margin: row.estimated_gross_margin,
      shipping_mode: row.shipping_mode,
      delivery_time: row.delivery_time,
      average_sales_amount: row.average_sales_amount,
      length_cm: row.length_cm,
      width_cm: row.width_cm,
      height_cm: row.height_cm,
      weight_g: row.weight_g,
    },
    stage: row.selection_stage,
    sourceJobId: Number(row.source_job_id),
    sourcePageType: row.page_type || '',
    sourceFinishedAt: row.finished_at || '',
    selectionNote: row.selection_note || '',
    initialCostPrice: row.initial_cost_price,
    initialDeliveryCost: row.initial_delivery_cost,
    initialTargetPrice: row.initial_target_price,
    initialProfitRate: row.initial_profit_rate,
    pricingDecision: row.pricing_decision,
    supplyMatchStatus: row.supply_match_status,
    supplyReferenceUrl: row.supply_reference_url || '',
    supplyVendorName: row.supply_vendor_name || '',
    competitorPacketStatus: row.competitor_packet_status,
    transferToPrepAt: row.transfer_to_prep_at || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listProductSelectionItems(db) {
  ensureProductSelectionItemsTable(db);
  if (!db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = 'product_business_snapshots'
    LIMIT 1
  `).get()) {
    return [];
  }
  ensureProductBusinessSnapshotColumns(db);

  const rows = db.prepare(`
    SELECT product_selection_items.*,
           source_jobs.page_type,
           source_jobs.finished_at,
           product_business_snapshots.platform,
           product_business_snapshots.platform_product_id,
           product_business_snapshots.product_url,
           product_business_snapshots.product_image_url,
           product_business_snapshots.shop_id,
           product_business_snapshots.shop_name,
           product_business_snapshots.product_type,
           product_business_snapshots.brand,
           product_business_snapshots.title,
           product_business_snapshots.product_created_date,
           product_business_snapshots.category_level_1,
           product_business_snapshots.category_level_2,
           product_business_snapshots.category_level_3,
           product_business_snapshots.sales_volume,
           product_business_snapshots.sales_growth,
           product_business_snapshots.potential_index,
           product_business_snapshots.sales_amount,
           product_business_snapshots.sales_amount_cny,
           product_business_snapshots.avg_price_rub,
           product_business_snapshots.avg_price_cny,
           product_business_snapshots.add_to_cart_rate,
           product_business_snapshots.impressions,
           product_business_snapshots.clicks,
           product_business_snapshots.view_rate,
           product_business_snapshots.ad_cost,
           product_business_snapshots.ad_cost_cny,
           product_business_snapshots.ad_cost_rate,
           product_business_snapshots.order_conversion_rate,
           product_business_snapshots.estimated_gross_margin,
           product_business_snapshots.shipping_mode,
           product_business_snapshots.delivery_time,
           product_business_snapshots.average_sales_amount,
           product_business_snapshots.length_cm,
           product_business_snapshots.width_cm,
           product_business_snapshots.height_cm,
           product_business_snapshots.weight_g
    FROM product_selection_items
    JOIN product_business_snapshots
      ON product_business_snapshots.id = product_selection_items.source_snapshot_id
    LEFT JOIN source_jobs
      ON source_jobs.id = product_selection_items.source_job_id
    ORDER BY product_selection_items.updated_at DESC, product_selection_items.id DESC
  `).all();

  return rows.map(mapSelectionItemRow);
}

function getOzonValidation(mode, items) {
  if (mode === 'prices') {
    return validatePriceItems(items);
  }
  if (mode === 'stocks') {
    return validateStockItems(items);
  }
  return validateProductItems(items);
}

function createOzonClient(body) {
  return new OzonSellerClient({
    clientId: body.clientId,
    apiKey: body.apiKey,
    baseUrl: body.baseUrl,
  });
}

function getOzonLanguage(body) {
  return typeof body.language === 'string' && body.language.trim()
    ? body.language.trim()
    : OZON_DEFAULT_LANGUAGE;
}

function getLatestJobId(db) {
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

function buildProductsQuery(searchParams, resolvedJobId) {
  const conditions = ['product_business_snapshots.job_id = ?'];
  const values = [resolvedJobId];
  const fromClause = `
      product_business_snapshots
      LEFT JOIN product_selection_items
        ON product_selection_items.source_job_id = product_business_snapshots.job_id
       AND product_selection_items.source_platform = COALESCE(product_business_snapshots.platform, 'ozon')
       AND product_selection_items.source_platform_product_id = product_business_snapshots.platform_product_id
    `;

  const keyword = searchParams.get('keyword')?.trim();
  if (keyword) {
    conditions.push(`(
      product_business_snapshots.platform_product_id LIKE ?
      OR product_business_snapshots.title LIKE ?
      OR product_business_snapshots.brand LIKE ?
      OR product_business_snapshots.shop_name LIKE ?
      OR product_business_snapshots.category_level_1 LIKE ?
      OR product_business_snapshots.category_level_2 LIKE ?
      OR product_business_snapshots.category_level_3 LIKE ?
    )`);
    const likeKeyword = `%${keyword}%`;
    values.push(likeKeyword, likeKeyword, likeKeyword, likeKeyword, likeKeyword, likeKeyword, likeKeyword);
  }

  const productType = searchParams.get('productType')?.trim();
  if (productType) {
    conditions.push('product_business_snapshots.product_type = ?');
    values.push(productType);
  }

  const categoryLevel1 = searchParams.get('categoryLevel1')?.trim();
  if (categoryLevel1) {
    conditions.push('product_business_snapshots.category_level_1 = ?');
    values.push(categoryLevel1);
  }

  const minSales = searchParams.get('minSales');
  if (minSales) {
    conditions.push('product_business_snapshots.sales_volume >= ?');
    values.push(Number(minSales));
  }

  const minRevenue = searchParams.get('minRevenue');
  if (minRevenue) {
    conditions.push('product_business_snapshots.sales_amount >= ?');
    values.push(Number(minRevenue));
  }

  const minAvgPrice = searchParams.get('minAvgPrice');
  if (minAvgPrice) {
    conditions.push('product_business_snapshots.avg_price_cny >= ?');
    values.push(Number(minAvgPrice));
  }

  const maxAvgPrice = searchParams.get('maxAvgPrice');
  if (maxAvgPrice) {
    conditions.push('product_business_snapshots.avg_price_cny <= ?');
    values.push(Number(maxAvgPrice));
  }

  const minWeight = searchParams.get('minWeight');
  if (minWeight) {
    conditions.push('product_business_snapshots.weight_g >= ?');
    values.push(Number(minWeight));
  }

  const maxWeight = searchParams.get('maxWeight');
  if (maxWeight) {
    conditions.push('product_business_snapshots.weight_g <= ?');
    values.push(Number(maxWeight));
  }

  const productStatus = searchParams.get('productStatus')?.trim();
  if (productStatus === 'pending') {
    conditions.push('product_selection_items.id IS NULL');
  } else if (productStatus === 'selected') {
    conditions.push(`product_selection_items.id IS NOT NULL
      AND product_selection_items.selection_stage NOT IN ('screening_rejected', 'pricing_rejected')`);
  } else if (productStatus === 'rejected') {
    conditions.push(`product_selection_items.selection_stage IN ('screening_rejected', 'pricing_rejected')`);
  }

  const sort = searchParams.get('sort') || 'sales_desc';
  const orderByMap = {
    sales_desc: 'product_business_snapshots.sales_volume DESC, product_business_snapshots.sales_amount DESC',
    sales_growth_desc: 'product_business_snapshots.sales_growth DESC, product_business_snapshots.sales_volume DESC',
    revenue_desc: 'product_business_snapshots.sales_amount DESC, product_business_snapshots.sales_volume DESC',
    margin_desc: 'product_business_snapshots.estimated_gross_margin DESC, product_business_snapshots.sales_volume DESC',
    impressions_desc: 'product_business_snapshots.impressions DESC, product_business_snapshots.sales_volume DESC',
  };

  return {
    fromClause,
    whereClause: conditions.join(' AND '),
    values,
    orderBy: orderByMap[sort] || orderByMap.sales_desc,
  };
}

function handleApiJobs(res) {
  if (!existsSync(DB_PATH)) {
    sendJson(res, 200, { jobs: [] });
    return;
  }

  const payload = withDb((db) => {
    ensureSourceJobsMetricsColumns(db);
    const jobs = db.prepare(`
      SELECT id, page_name, page_url, page_type, pagination_mode, job_status,
             started_at, finished_at, raw_count, normalized_count, warning_count,
             request_count, success_count, record_count,
             COALESCE(
               error_type,
               CASE
                 WHEN error_message LIKE '%游客%' THEN 'guest_blocked'
                 WHEN error_message LIKE '%登录%' THEN 'login_required'
                 WHEN error_message LIKE '%Profile%' OR error_message LIKE '%EBUSY%' THEN 'profile_locked'
                 WHEN error_message LIKE '%浏览器%' OR error_message LIKE '%Chrome%' OR error_message LIKE '%EPERM%' OR error_message LIKE '%new tab%' THEN 'browser_blocked'
                 WHEN error_message LIKE '%sqlite%' OR error_message LIKE '%database%' THEN 'db_error'
                 WHEN error_message IS NOT NULL AND error_message != '' THEN 'unknown'
                 ELSE NULL
               END
             ) AS error_type,
             error_message
      FROM source_jobs
      ORDER BY id DESC
      LIMIT 20
    `).all();
    return { jobs };
  });

  sendJson(res, 200, payload);
}

function handleApiResultJobs(req, res) {
  if (!existsSync(DB_PATH)) {
    sendJson(res, 200, { jobs: [] });
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const includeEmpty = parseBoolean(url.searchParams.get('includeEmpty'));
  const includeFailed = parseBoolean(url.searchParams.get('includeFailed'));
  const limit = Math.min(Math.max(parseInteger(url.searchParams.get('limit'), 50), 1), 100);

  const payload = withDb((db) => {
    const conditions = [];
    if (!includeFailed) {
      conditions.push(`job_status = 'success'`);
    }
    if (!includeEmpty) {
      conditions.push(includeFailed ? `(product_count > 0 OR job_status != 'success')` : `product_count > 0`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const jobs = db.prepare(`
      SELECT *
      FROM (
        SELECT source_jobs.id,
               source_jobs.page_name,
               source_jobs.page_type,
               source_jobs.job_status,
               source_jobs.raw_count,
               source_jobs.normalized_count,
               source_jobs.finished_at,
               COUNT(product_business_snapshots.id) AS product_count
        FROM source_jobs
        LEFT JOIN product_business_snapshots ON product_business_snapshots.job_id = source_jobs.id
        GROUP BY source_jobs.id
      )
      ${whereClause}
      ORDER BY id DESC
      LIMIT ?
    `).all(limit);

    return {
      filters: {
        includeEmpty,
        includeFailed,
        limit,
      },
      jobs,
    };
  });

  sendJson(res, 200, payload);
}

function handleApiProducts(req, res) {
  if (!existsSync(DB_PATH)) {
    sendJson(res, 200, {
      latestJob: null,
      filters: {},
      summary: null,
      items: [],
      total: 0,
      actualProductCount: 0,
    });
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const page = Math.max(parseInteger(url.searchParams.get('page'), 1), 1);
  const pageSize = Math.min(Math.max(parseInteger(url.searchParams.get('pageSize'), 20), 1), 100);

  const payload = withDb((db) => {
    ensureProductBusinessSnapshotColumns(db);
    ensureProductSelectionItemsTable(db);
    const latestJobId = getLatestJobId(db);
    if (!latestJobId) {
      return {
        latestJob: null,
        filters: {},
        summary: null,
        items: [],
        total: 0,
        actualProductCount: 0,
      };
    }

    const requestedJobId = parseInteger(url.searchParams.get('jobId'), latestJobId);
    const resolvedJobId = requestedJobId || latestJobId;
    const { fromClause, whereClause, values, orderBy } = buildProductsQuery(url.searchParams, resolvedJobId);
    const offset = (page - 1) * pageSize;

    const totalRow = db.prepare(`
      SELECT COUNT(*) AS total
      FROM ${fromClause}
      WHERE ${whereClause}
    `).get(...values);

    const items = db.prepare(`
      SELECT product_business_snapshots.id,
             product_business_snapshots.job_id,
             product_business_snapshots.platform,
             product_business_snapshots.platform_product_id,
             product_business_snapshots.product_url,
             product_business_snapshots.product_image_url,
             product_business_snapshots.shop_id,
             product_business_snapshots.shop_name,
             product_business_snapshots.product_type,
             product_business_snapshots.brand,
             product_business_snapshots.title,
             product_business_snapshots.product_created_date,
             product_business_snapshots.category_level_1,
             product_business_snapshots.category_level_2,
             product_business_snapshots.category_level_3,
             product_business_snapshots.sales_volume,
             product_business_snapshots.sales_growth,
             product_business_snapshots.potential_index,
             product_business_snapshots.sales_amount,
             product_business_snapshots.sales_amount_cny,
             product_business_snapshots.avg_price_rub,
             product_business_snapshots.avg_price_cny,
             product_business_snapshots.add_to_cart_rate,
             product_business_snapshots.impressions,
             product_business_snapshots.clicks,
             product_business_snapshots.view_rate,
             product_business_snapshots.ad_cost,
             product_business_snapshots.ad_cost_cny,
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
             product_business_snapshots.captured_at,
             product_business_snapshots.created_at,
             product_business_snapshots.updated_at,
             product_selection_items.selection_stage AS selection_stage
      FROM ${fromClause}
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...values, pageSize, offset);

    const summary = db.prepare(`
      SELECT
        COUNT(*) AS total_products,
        MAX(sales_volume) AS max_sales,
        MAX(sales_amount) AS max_revenue,
        MAX(sales_amount_cny) AS max_revenue_cny,
        AVG(sales_volume) AS avg_sales,
        AVG(sales_amount) AS avg_revenue,
        AVG(sales_amount_cny) AS avg_revenue_cny,
        AVG(estimated_gross_margin) AS avg_margin
      FROM product_business_snapshots
      WHERE job_id = ?
    `).get(resolvedJobId);

    const latestJob = db.prepare(`
      SELECT id, page_name, job_status, started_at, finished_at, raw_count, normalized_count
      FROM source_jobs
      WHERE id = ?
      LIMIT 1
    `).get(resolvedJobId);

    const actualProductCount = db.prepare(`
      SELECT COUNT(*) AS total
      FROM product_business_snapshots
      WHERE job_id = ?
    `).get(resolvedJobId);

    const categoryOptions = db.prepare(`
      SELECT DISTINCT category_level_1 AS value
      FROM product_business_snapshots
      WHERE job_id = ? AND category_level_1 IS NOT NULL AND category_level_1 != ''
      ORDER BY category_level_1
    `).all(resolvedJobId).map((row) => row.value);

    const productTypeOptions = db.prepare(`
      SELECT DISTINCT product_type AS value
      FROM product_business_snapshots
      WHERE job_id = ? AND product_type IS NOT NULL AND product_type != ''
      ORDER BY product_type
    `).all(resolvedJobId).map((row) => row.value);

    return {
      latestJob,
      filters: {
        page,
        pageSize,
        keyword: url.searchParams.get('keyword') || '',
        productType: url.searchParams.get('productType') || '',
        categoryLevel1: url.searchParams.get('categoryLevel1') || '',
        minSales: url.searchParams.get('minSales') || '',
        minRevenue: url.searchParams.get('minRevenue') || '',
        minAvgPrice: url.searchParams.get('minAvgPrice') || '',
        maxAvgPrice: url.searchParams.get('maxAvgPrice') || '',
        minWeight: url.searchParams.get('minWeight') || '',
        maxWeight: url.searchParams.get('maxWeight') || '',
        productStatus: url.searchParams.get('productStatus') || '',
        sort: url.searchParams.get('sort') || 'sales_desc',
      },
      options: {
        categoryLevel1: categoryOptions,
        productType: productTypeOptions,
      },
      summary,
      items,
      total: Number(totalRow.total || 0),
      actualProductCount: Number(actualProductCount.total || 0),
    };
  });

  sendJson(res, 200, payload);
}

function mapProductContentAssetRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    source_job_id: row.source_job_id == null ? null : Number(row.source_job_id),
    platform: row.platform,
    platform_product_id: row.platform_product_id,
    product_url: row.product_url,
    title: row.title,
    description: row.description,
    tags: parseJsonText(row.tags_json, []),
    main_image_url: row.main_image_url,
    image_urls: parseJsonText(row.image_urls_json, []),
    content_hash: row.content_hash,
    captured_at: row.captured_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    sku_count: row.sku_count == null ? undefined : Number(row.sku_count),
    version_count: row.version_count == null ? undefined : Number(row.version_count),
  };
}

function mapProductContentSkuRow(row) {
  return {
    id: Number(row.id),
    content_asset_id: Number(row.content_asset_id),
    source_job_id: row.source_job_id == null ? null : Number(row.source_job_id),
    platform: row.platform,
    platform_product_id: row.platform_product_id,
    platform_sku_id: row.platform_sku_id,
    sku_name: row.sku_name,
    price: row.price == null ? null : Number(row.price),
    currency_code: row.currency_code,
    images: parseJsonText(row.images_json, []),
    sort_order: Number(row.sort_order || 0),
    captured_at: row.captured_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapProductBusinessSnapshotRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    job_id: Number(row.job_id),
    platform: row.platform,
    platform_product_id: row.platform_product_id,
    product_url: row.product_url,
    product_image_url: row.product_image_url,
    shop_name: row.shop_name,
    brand: row.brand,
    title: row.title,
    sales_volume: row.sales_volume == null ? null : Number(row.sales_volume),
    sales_amount: row.sales_amount == null ? null : Number(row.sales_amount),
    sales_amount_cny: row.sales_amount_cny == null ? null : Number(row.sales_amount_cny),
    avg_price_rub: row.avg_price_rub == null ? null : Number(row.avg_price_rub),
    avg_price_cny: row.avg_price_cny == null ? null : Number(row.avg_price_cny),
    impressions: row.impressions == null ? null : Number(row.impressions),
    clicks: row.clicks == null ? null : Number(row.clicks),
    order_conversion_rate: row.order_conversion_rate == null ? null : Number(row.order_conversion_rate),
    estimated_gross_margin: row.estimated_gross_margin == null ? null : Number(row.estimated_gross_margin),
    shipping_mode: row.shipping_mode,
    delivery_time: row.delivery_time,
    captured_at: row.captured_at,
    source_finished_at: row.source_finished_at || null,
  };
}

function handleApiProductBusinessLatest(req, res) {
  if (!existsSync(DB_PATH)) {
    sendJson(res, 200, { query: {}, item: null });
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const platform = toNullableText(url.searchParams.get('platform')) || 'ozon';
  const productId = toNullableText(url.searchParams.get('productId'));

  if (!productId) {
    sendError(res, 400, 'productId 不能为空');
    return;
  }

  const payload = withDb((db) => {
    if (!db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'product_business_snapshots'
      LIMIT 1
    `).get()) {
      return {
        query: { platform, productId },
        item: null,
      };
    }

    ensureProductBusinessSnapshotColumns(db);
    const hasSourceJobs = Boolean(db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'source_jobs'
      LIMIT 1
    `).get());

    const row = hasSourceJobs
      ? db.prepare(`
        SELECT
          product_business_snapshots.*,
          source_jobs.finished_at AS source_finished_at
        FROM product_business_snapshots
        LEFT JOIN source_jobs
          ON source_jobs.id = product_business_snapshots.job_id
        WHERE product_business_snapshots.platform = ?
          AND product_business_snapshots.platform_product_id = ?
        ORDER BY product_business_snapshots.captured_at DESC, product_business_snapshots.id DESC
        LIMIT 1
      `).get(platform, productId)
      : db.prepare(`
        SELECT product_business_snapshots.*
        FROM product_business_snapshots
        WHERE product_business_snapshots.platform = ?
          AND product_business_snapshots.platform_product_id = ?
        ORDER BY product_business_snapshots.captured_at DESC, product_business_snapshots.id DESC
        LIMIT 1
      `).get(platform, productId);

    return {
      query: { platform, productId },
      item: mapProductBusinessSnapshotRow(row),
    };
  });

  sendJson(res, 200, payload);
}

function handleApiProductContent(req, res) {
  if (!existsSync(DB_PATH)) {
    sendJson(res, 200, { query: {}, item: null, skus: [], items: [], total: 0 });
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const platform = toNullableText(url.searchParams.get('platform')) || 'ozon';
  const productId = toNullableText(url.searchParams.get('productId'));
  const latest = parseBoolean(url.searchParams.get('latest'), true);

  if (!productId) {
    const payload = withDb((db) => {
      ensureProductContentTables(db);

      const rows = db.prepare(`
        SELECT
          product_content_assets.*,
          COUNT(DISTINCT product_content_skus.id) AS sku_count,
          (
            SELECT COUNT(*)
            FROM product_content_assets AS history_assets
            WHERE history_assets.platform = product_content_assets.platform
              AND history_assets.platform_product_id = product_content_assets.platform_product_id
          ) AS version_count
        FROM product_content_assets
        LEFT JOIN product_content_skus
          ON product_content_skus.content_asset_id = product_content_assets.id
        WHERE product_content_assets.platform = ?
          AND NOT EXISTS (
            SELECT 1
            FROM product_content_assets AS newer_assets
            WHERE newer_assets.platform = product_content_assets.platform
              AND newer_assets.platform_product_id = product_content_assets.platform_product_id
              AND (
                newer_assets.captured_at > product_content_assets.captured_at
                OR (
                  newer_assets.captured_at = product_content_assets.captured_at
                  AND newer_assets.id > product_content_assets.id
                )
              )
          )
        GROUP BY product_content_assets.id
        ORDER BY product_content_assets.captured_at DESC, product_content_assets.id DESC
        LIMIT 200
      `).all(platform);

      return {
        query: { platform, latest: true },
        items: rows.map(mapProductContentAssetRow),
        total: rows.length,
      };
    });

    sendJson(res, 200, payload);
    return;
  }

  const payload = withDb((db) => {
    ensureProductContentTables(db);

    if (latest) {
      const row = db.prepare(`
        SELECT *
        FROM product_content_assets
        WHERE platform = ? AND platform_product_id = ?
        ORDER BY captured_at DESC, id DESC
        LIMIT 1
      `).get(platform, productId);

      if (!row) {
        return {
          query: { platform, productId, latest: true },
          item: null,
          skus: [],
        };
      }

      const skuRows = db.prepare(`
        SELECT *
        FROM product_content_skus
        WHERE content_asset_id = ?
        ORDER BY sort_order ASC, id ASC
      `).all(row.id);

      return {
        query: { platform, productId, latest: true },
        item: mapProductContentAssetRow(row),
        skus: skuRows.map(mapProductContentSkuRow),
      };
    }

    const rows = db.prepare(`
      SELECT
        product_content_assets.*,
        COUNT(product_content_skus.id) AS sku_count
      FROM product_content_assets
      LEFT JOIN product_content_skus
        ON product_content_skus.content_asset_id = product_content_assets.id
      WHERE product_content_assets.platform = ?
        AND product_content_assets.platform_product_id = ?
      GROUP BY product_content_assets.id
      ORDER BY product_content_assets.captured_at DESC, product_content_assets.id DESC
    `).all(platform, productId);

    return {
      query: { platform, productId, latest: false },
      items: rows.map(mapProductContentAssetRow),
      total: rows.length,
    };
  });

  sendJson(res, 200, payload);
}

function handleApiProductContentSkus(res, contentAssetId) {
  if (!existsSync(DB_PATH)) {
    sendJson(res, 200, { item: null, skus: [] });
    return;
  }

  const payload = withDb((db) => {
    ensureProductContentTables(db);

    const row = db.prepare(`
      SELECT *
      FROM product_content_assets
      WHERE id = ?
      LIMIT 1
    `).get(contentAssetId);

    if (!row) {
      return { item: null, skus: [] };
    }

    const skuRows = db.prepare(`
      SELECT *
      FROM product_content_skus
      WHERE content_asset_id = ?
      ORDER BY sort_order ASC, id ASC
    `).all(contentAssetId);

    return {
      item: mapProductContentAssetRow(row),
      skus: skuRows.map(mapProductContentSkuRow),
    };
  });

  sendJson(res, 200, payload);
}

function handleApiProductSelectionItems(req, res) {
  if (!existsSync(DB_PATH)) {
    sendJson(res, 200, { items: [], total: 0 });
    return;
  }

  const payload = withDb((db) => ({
    items: listProductSelectionItems(db),
    total: (() => {
      ensureProductSelectionItemsTable(db);
      return db.prepare('SELECT COUNT(*) AS total FROM product_selection_items').get()?.total || 0;
    })(),
  }));

  sendJson(res, 200, payload);
}

async function handleApiProductSelectionItemsCreate(req, res) {
  if (!existsSync(DB_PATH)) {
    sendError(res, 400, '数据库不存在，无法加入商品筛选工作台');
    return;
  }

  try {
    const body = await readJsonBody(req);
    const items = Array.isArray(body.items) ? body.items : [];
    const requestedStage = body.selectionStage === 'screening_rejected' ? 'screening_rejected' : 'pool_pending';
    const requestedResult = requestedStage === 'screening_rejected' ? 'rejected' : 'pending';
    if (!items.length) {
      sendError(res, 400, 'items 不能为空');
      return;
    }

    const payload = withDb((db) => {
      ensureProductSelectionItemsTable(db);
      if (!db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name = 'product_business_snapshots'
        LIMIT 1
      `).get()) {
        throw new Error('product_business_snapshots 不存在，无法加入商品筛选工作台');
      }
      ensureProductBusinessSnapshotColumns(db);

      const selectSnapshot = db.prepare(`
        SELECT product_business_snapshots.id,
               product_business_snapshots.job_id,
               product_business_snapshots.platform,
               product_business_snapshots.platform_product_id,
               product_business_snapshots.avg_price_cny,
               product_business_snapshots.length_cm,
               product_business_snapshots.width_cm,
               product_business_snapshots.height_cm,
               product_business_snapshots.weight_g,
               product_business_snapshots.captured_at,
               product_business_snapshots.created_at,
               source_jobs.finished_at
        FROM product_business_snapshots
        LEFT JOIN source_jobs
          ON source_jobs.id = product_business_snapshots.job_id
        WHERE product_business_snapshots.id = ?
        LIMIT 1
      `);

      const insert = db.prepare(`
        INSERT OR IGNORE INTO product_selection_items (
          source_job_id,
          source_snapshot_id,
          source_platform,
          source_platform_product_id,
          selection_stage,
          selection_result,
          initial_delivery_cost,
          pricing_decision,
          supply_match_status,
          competitor_packet_status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', 'pending', ?, ?)
      `);

      const updateRejected = db.prepare(`
        UPDATE product_selection_items
        SET selection_stage = 'screening_rejected',
            selection_result = 'rejected',
            updated_at = ?
        WHERE source_job_id = ?
          AND source_platform = ?
          AND source_platform_product_id = ?
      `);

      let insertedCount = 0;
      let duplicateCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      for (const item of items) {
        const sourceSnapshotId = parseInteger(item.sourceSnapshotId ?? item.id, null);
        if (!sourceSnapshotId) {
          skippedCount += 1;
          continue;
        }

        const snapshot = selectSnapshot.get(sourceSnapshotId);
        if (!snapshot) {
          skippedCount += 1;
          continue;
        }

        const autoDeliveryCost = resolveAutoDeliveryCost(snapshot);
        const timestamp = nowIso();
        const result = insert.run(
          snapshot.job_id,
          snapshot.id,
          snapshot.platform || 'ozon',
          snapshot.platform_product_id,
          requestedStage,
          requestedResult,
          autoDeliveryCost,
          timestamp,
          timestamp,
        );

        if (result.changes > 0) {
          insertedCount += 1;
        } else {
          duplicateCount += 1;
          if (requestedStage === 'screening_rejected') {
            updatedCount += updateRejected.run(
              timestamp,
              snapshot.job_id,
              snapshot.platform || 'ozon',
              snapshot.platform_product_id,
            ).changes;
          }
        }
      }

      return {
        insertedCount,
        duplicateCount,
        updatedCount,
        skippedCount,
        items: listProductSelectionItems(db),
      };
    });

    sendJson(res, 200, payload);
  } catch (error) {
    sendError(res, 400, error.message);
  }
}

async function handleApiProductSelectionItemPatch(req, res, selectionItemId) {
  if (!existsSync(DB_PATH)) {
    sendError(res, 400, '数据库不存在，无法更新商品筛选工作台');
    return;
  }

  try {
    const body = await readJsonBody(req);
    const payload = withDb((db) => {
      ensureProductSelectionItemsTable(db);

      const existing = db.prepare(`
        SELECT *
        FROM product_selection_items
        WHERE id = ?
        LIMIT 1
      `).get(selectionItemId);

      if (!existing) {
        return null;
      }

      const stage = expectEnumValue(body.stage, PRODUCT_SELECTION_STAGE_VALUES, 'stage') || existing.selection_stage;
      const pricingDecision =
        expectEnumValue(body.pricingDecision, PRODUCT_SELECTION_PRICING_DECISION_VALUES, 'pricingDecision') ||
        existing.pricing_decision;
      const supplyMatchStatus =
        expectEnumValue(body.supplyMatchStatus, PRODUCT_SELECTION_SUPPLY_STATUS_VALUES, 'supplyMatchStatus') ||
        existing.supply_match_status;
      const competitorPacketStatus =
        expectEnumValue(body.competitorPacketStatus, PRODUCT_SELECTION_COMPETITOR_STATUS_VALUES, 'competitorPacketStatus') ||
        existing.competitor_packet_status;

      const selectionResult = body.selectionResult
        ? toNullableText(body.selectionResult)
        : deriveSelectionResult(stage, pricingDecision);

      const transferToPrepAt = body.transferToPrepAt !== undefined
        ? toNullableText(body.transferToPrepAt)
        : existing.transfer_to_prep_at;

      db.prepare(`
        UPDATE product_selection_items
        SET selection_stage = ?,
            selection_result = ?,
            selection_note = ?,
            initial_cost_price = ?,
            initial_delivery_cost = ?,
            initial_target_price = ?,
            initial_profit_rate = ?,
            pricing_decision = ?,
            supply_match_status = ?,
            supply_reference_url = ?,
            supply_vendor_name = ?,
            competitor_packet_status = ?,
            transfer_to_prep_at = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        stage,
        selectionResult,
        body.selectionNote !== undefined ? toNullableText(body.selectionNote) : existing.selection_note,
        body.initialCostPrice !== undefined ? toNullableNumber(body.initialCostPrice) : existing.initial_cost_price,
        body.initialDeliveryCost !== undefined ? toNullableNumber(body.initialDeliveryCost) : existing.initial_delivery_cost,
        body.initialTargetPrice !== undefined ? toNullableNumber(body.initialTargetPrice) : existing.initial_target_price,
        body.initialProfitRate !== undefined ? toNullableNumber(body.initialProfitRate) : existing.initial_profit_rate,
        pricingDecision,
        supplyMatchStatus,
        body.supplyReferenceUrl !== undefined ? toNullableText(body.supplyReferenceUrl) : existing.supply_reference_url,
        body.supplyVendorName !== undefined ? toNullableText(body.supplyVendorName) : existing.supply_vendor_name,
        competitorPacketStatus,
        transferToPrepAt,
        nowIso(),
        selectionItemId,
      );

      return db.prepare(`
        SELECT id
        FROM product_selection_items
        WHERE id = ?
        LIMIT 1
      `).get(selectionItemId);
    });

    if (!payload) {
      sendError(res, 404, '未找到商品筛选条目');
      return;
    }

    const response = withDb((db) => ({
      item: listProductSelectionItems(db).find((item) => Number(item.id) === Number(selectionItemId)) || null,
    }));
    sendJson(res, 200, response);
  } catch (error) {
    sendError(res, 400, error.message);
  }
}

function handleApiProductSelectionItemTransfer(res, selectionItemId) {
  if (!existsSync(DB_PATH)) {
    sendError(res, 400, '数据库不存在，无法流转商品数据整理');
    return;
  }

  const payload = withDb((db) => {
    ensureProductSelectionItemsTable(db);
    const existing = db.prepare(`
      SELECT id
      FROM product_selection_items
      WHERE id = ?
      LIMIT 1
    `).get(selectionItemId);

    if (!existing) {
      return null;
    }

    db.prepare(`
      UPDATE product_selection_items
      SET selection_stage = 'prep_ready',
          selection_result = 'ready_for_prep',
          transfer_to_prep_at = COALESCE(transfer_to_prep_at, ?),
          updated_at = ?
      WHERE id = ?
    `).run(nowIso(), nowIso(), selectionItemId);

    return {
      item: listProductSelectionItems(db).find((item) => Number(item.id) === Number(selectionItemId)) || null,
    };
  });

  if (!payload) {
    sendError(res, 404, '未找到商品筛选条目');
    return;
  }

  sendJson(res, 200, payload);
}

function handleApiOzonTemplate(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const kind = url.searchParams.get('kind') || 'products';
  sendJson(res, 200, buildTemplate(kind));
}

function handleApiShippingMethods(res) {
  sendJson(res, 200, {
    methods: listShippingMethods(),
  });
}

function handleApiShippingRuleInfo(res) {
  sendJson(res, 200, getShippingRuleInfo());
}

async function handleApiShippingCalculate(req, res) {
  try {
    const body = await readJsonBody(req);
    const result = calculateShipping(body);
    sendJson(res, 200, result);
  } catch (error) {
    sendError(res, error.status || 500, error.message, error.details || null);
  }
}

async function handleApiMenglarLoginHealth(req, res) {
  try {
    const body = req.method === 'POST' ? await readJsonBody(req) : {};
    const result = await checkMenglarLoginHealth({
      target: body.target || 'hot_products',
      refresh: Boolean(body.refresh),
      headless: body.headless !== false,
      writeResult: true,
    });
    sendJson(res, 200, result);
  } catch (error) {
    sendError(res, 500, error.message);
  }
}

async function handleApiShippingCalculateBatch(req, res) {
  try {
    const body = await readJsonBody(req);
    const result = calculateShippingBatch(body.items);
    sendJson(res, 200, result);
  } catch (error) {
    sendError(res, error.status || 500, error.message, error.details || null);
  }
}

async function handleApiShippingCompare(req, res) {
  try {
    const body = await readJsonBody(req);
    const result = compareShipping(body);
    sendJson(res, 200, result);
  } catch (error) {
    sendError(res, error.status || 500, error.message, error.details || null);
  }
}

async function handleApiImageCompressionCompressJpg(req, res) {
  try {
    if (req.method !== 'POST') {
      sendError(res, 405, '只支持 POST');
      return;
    }

    const body = await readJsonBody(req);
    const result = await compressImageDirectoriesToJpg({
      sourceDir: body.sourceDir,
      outputDirName: body.outputDirName || '压缩图',
      quality: body.quality ?? 4,
      overwrite: body.overwrite !== false,
      mode: body.mode || 'singleDirectory',
      includeChildDirs: body.includeChildDirs === true,
    });
    sendJson(res, 200, result);
  } catch (error) {
    sendError(res, 400, error.message);
  }
}

async function handleApiOzonValidate(req, res) {
  try {
    const body = await readJsonBody(req);
    const mode = body.mode || 'products';
    const items = loadItemsPayload(body.payload);
    const result = getOzonValidation(mode, items);

    sendJson(res, 200, {
      mode,
      itemCount: items.length,
      ...result,
    });
  } catch (error) {
    sendError(res, 400, error.message);
  }
}

async function handleApiOzonExecute(req, res) {
  try {
    const body = await readJsonBody(req);
    const action = body.action || 'upload';
    const payload = body.payload || {};
    const items = loadItemsPayload(payload);
    const validationMode = action === 'prices' ? 'prices' : action === 'stocks' ? 'stocks' : 'products';
    const validation = getOzonValidation(validationMode, items);

    if (!validation.ok) {
      sendError(res, 400, '数据校验未通过', validation);
      return;
    }

    if (body.dryRun) {
      sendJson(res, 200, {
        action,
        dryRun: true,
        itemCount: items.length,
        warnings: validation.warnings || [],
        result: action === 'upload'
          ? { batchCount: Math.ceil(items.length / 100), totalItems: items.length }
          : { totalItems: items.length },
      });
      return;
    }

    const client = createOzonClient(body);
    let result;
    if (action === 'prices') {
      result = await client.importPrices(items);
    } else if (action === 'stocks') {
      result = await client.updateStocks(items);
    } else {
      result = await client.uploadProducts(items);
    }

    sendJson(res, 200, {
      action,
      dryRun: false,
      itemCount: items.length,
      warnings: validation.warnings || [],
      result,
    });
  } catch (error) {
    sendError(res, error.status || 500, error.message, error.body || null);
  }
}

async function handleApiOzonImportInfo(req, res) {
  try {
    const body = await readJsonBody(req);
    const taskId = parseInteger(body.taskId, null);
    if (!taskId) {
      sendError(res, 400, 'taskId 必须是正整数');
      return;
    }

    const client = createOzonClient(body);
    const result = await client.getImportInfo(taskId);
    sendJson(res, 200, result);
  } catch (error) {
    sendError(res, error.status || 500, error.message, error.body || null);
  }
}

async function handleApiOzonCategoryTree(req, res) {
  try {
    const body = await readJsonBody(req);
    const client = createOzonClient(body);
    const result = await client.getCategoryTree({ language: getOzonLanguage(body) });
    sendJson(res, 200, result);
  } catch (error) {
    sendError(res, error.status || 500, error.message, error.body || null);
  }
}

async function handleApiOzonCategoryAttributes(req, res) {
  try {
    const body = await readJsonBody(req);
    const descriptionCategoryId = parseInteger(body.descriptionCategoryId, null);
    const typeId = parseInteger(body.typeId, null);
    if (!descriptionCategoryId || !typeId) {
      sendError(res, 400, 'descriptionCategoryId 和 typeId 必须是正整数');
      return;
    }

    const client = createOzonClient(body);
    const result = await client.getCategoryAttributes({
      descriptionCategoryId,
      typeId,
      language: getOzonLanguage(body),
    });
    sendJson(res, 200, result);
  } catch (error) {
    sendError(res, error.status || 500, error.message, error.body || null);
  }
}

async function handleApiOzonAttributeValues(req, res) {
  try {
    const body = await readJsonBody(req);
    const descriptionCategoryId = parseInteger(body.descriptionCategoryId, null);
    const typeId = parseInteger(body.typeId, null);
    const attributeId = parseInteger(body.attributeId, null);
    if (!descriptionCategoryId || !typeId || !attributeId) {
      sendError(res, 400, 'descriptionCategoryId、typeId 和 attributeId 必须是正整数');
      return;
    }

    const client = createOzonClient(body);
    const result = await client.getCategoryAttributeValues({
      descriptionCategoryId,
      typeId,
      attributeId,
      language: getOzonLanguage(body),
    });
    sendJson(res, 200, result);
  } catch (error) {
    sendError(res, error.status || 500, error.message, error.body || null);
  }
}

export function createWorkbenchServer() {
  return createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);

    if (isProductDataPrepRoute(req)) {
      await handleProductDataPrepRoute(req, res);
      return;
    }

    if (url.pathname === '/api/product-selection/items' && req.method === 'GET') {
      handleApiProductSelectionItems(req, res);
      return;
    }

    if (url.pathname === '/api/product-selection/items' && req.method === 'POST') {
      await handleApiProductSelectionItemsCreate(req, res);
      return;
    }

    const productSelectionPatchMatch = url.pathname.match(/^\/api\/product-selection\/items\/(\d+)$/);
    if (productSelectionPatchMatch && req.method === 'PATCH') {
      await handleApiProductSelectionItemPatch(req, res, Number(productSelectionPatchMatch[1]));
      return;
    }

    const productSelectionTransferMatch = url.pathname.match(/^\/api\/product-selection\/items\/(\d+)\/transfer-to-prep$/);
    if (productSelectionTransferMatch && req.method === 'POST') {
      handleApiProductSelectionItemTransfer(res, Number(productSelectionTransferMatch[1]));
      return;
    }

    if ((req.url || '').startsWith('/api/result-jobs')) {
      handleApiResultJobs(req, res);
      return;
    }

    if ((req.url || '').startsWith('/api/jobs')) {
      handleApiJobs(res);
      return;
    }

    if ((req.url || '').startsWith('/api/products')) {
      handleApiProducts(req, res);
      return;
    }

    if ((req.url || '').startsWith('/api/product-business/latest')) {
      if (url.pathname === '/api/product-business/latest' && req.method === 'GET') {
        handleApiProductBusinessLatest(req, res);
        return;
      }
    }

    if ((req.url || '').startsWith('/api/product-content')) {
      const productContentSkusMatch = url.pathname.match(/^\/api\/product-content\/(\d+)\/skus$/);
      if (productContentSkusMatch && req.method === 'GET') {
        handleApiProductContentSkus(res, Number(productContentSkusMatch[1]));
        return;
      }

      if (url.pathname === '/api/product-content' && req.method === 'GET') {
        handleApiProductContent(req, res);
        return;
      }
    }

    if ((req.url || '').startsWith('/api/menglar/login-health')) {
      await handleApiMenglarLoginHealth(req, res);
      return;
    }

    if (url.pathname === '/api/image-compression/compress-jpg') {
      await handleApiImageCompressionCompressJpg(req, res);
      return;
    }

    if ((req.url || '').startsWith('/api/ozon/template')) {
      handleApiOzonTemplate(req, res);
      return;
    }

    if ((req.url || '').startsWith('/api/shipping/methods')) {
      handleApiShippingMethods(res);
      return;
    }

    if ((req.url || '').startsWith('/api/shipping/rule-info')) {
      handleApiShippingRuleInfo(res);
      return;
    }

    if ((req.url || '').startsWith('/api/shipping/calculate-batch')) {
      await handleApiShippingCalculateBatch(req, res);
      return;
    }

    if ((req.url || '').startsWith('/api/shipping/compare')) {
      await handleApiShippingCompare(req, res);
      return;
    }

    if ((req.url || '').startsWith('/api/shipping/calculate')) {
      await handleApiShippingCalculate(req, res);
      return;
    }

    if ((req.url || '').startsWith('/api/ozon/validate')) {
      await handleApiOzonValidate(req, res);
      return;
    }

    if ((req.url || '').startsWith('/api/ozon/execute')) {
      await handleApiOzonExecute(req, res);
      return;
    }

    if ((req.url || '').startsWith('/api/ozon/import-info')) {
      await handleApiOzonImportInfo(req, res);
      return;
    }

    if ((req.url || '').startsWith('/api/ozon/category-tree')) {
      await handleApiOzonCategoryTree(req, res);
      return;
    }

    if ((req.url || '').startsWith('/api/ozon/category-attributes')) {
      await handleApiOzonCategoryAttributes(req, res);
      return;
    }

    if ((req.url || '').startsWith('/api/ozon/attribute-values')) {
      await handleApiOzonAttributeValues(req, res);
      return;
    }

    if ((req.url || '').startsWith('/api/')) {
      sendError(res, 404, '未找到 API 接口');
      return;
    }

    const filePath = safePath(req.url || '/');
    if (!filePath) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    try {
      let targetPath = filePath;
      let fileInfo;
      try {
        fileInfo = await stat(targetPath);
      } catch {
        targetPath = path.join(WORKBENCH_DIST, 'index.html');
        fileInfo = await stat(targetPath);
      }

      if (!fileInfo.isFile()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      res.writeHead(200, {
        'content-type': TYPES[path.extname(targetPath)] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      createReadStream(targetPath).pipe(res);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
}

export async function startWorkbenchServer({ port = PORT, host = '127.0.0.1' } = {}) {
  await mkdir(WORKBENCH_DIST, { recursive: true }).catch(() => {});
  if (existsSync(DB_PATH)) {
    withDb((db) => {
      ensureSourceJobsMetricsColumns(db);
      ensureProductBusinessSnapshotColumns(db);
      ensureProductSelectionItemsTable(db);
      ensureProductContentTables(db);
    });
  }
  const server = createWorkbenchServer();
  await new Promise((resolve) => {
    server.listen(port, host, resolve);
  });
  return server;
}

const isMainModule =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const server = await startWorkbenchServer();
  console.log(`Menglar workbench api: http://127.0.0.1:${PORT}/`);
  process.on('SIGINT', () => server.close());
  process.on('SIGTERM', () => server.close());
}
