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

const ROOT = import.meta.dirname;
const PORT = Number(process.env.PORT || 4186);
const DB_PATH = path.resolve(ROOT, '..', '..', 'db', 'menglar-mvp.sqlite');
const WORKBENCH_DIST = path.resolve(ROOT, '..', '..', 'frontend', 'menglar-workbench', 'dist');

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

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
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

function getLatestJobId(db) {
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

function buildProductsQuery(searchParams, resolvedJobId) {
  const conditions = ['job_id = ?'];
  const values = [resolvedJobId];

  const keyword = searchParams.get('keyword')?.trim();
  if (keyword) {
    conditions.push(`(
      ozon_product_id LIKE ?
      OR brand LIKE ?
      OR category_level_1 LIKE ?
      OR category_level_2 LIKE ?
      OR category_level_3 LIKE ?
    )`);
    const likeKeyword = `%${keyword}%`;
    values.push(likeKeyword, likeKeyword, likeKeyword, likeKeyword, likeKeyword);
  }

  const productType = searchParams.get('productType')?.trim();
  if (productType) {
    conditions.push('product_type = ?');
    values.push(productType);
  }

  const categoryLevel1 = searchParams.get('categoryLevel1')?.trim();
  if (categoryLevel1) {
    conditions.push('category_level_1 = ?');
    values.push(categoryLevel1);
  }

  const minSales = searchParams.get('minSales');
  if (minSales) {
    conditions.push('sales >= ?');
    values.push(Number(minSales));
  }

  const minRevenue = searchParams.get('minRevenue');
  if (minRevenue) {
    conditions.push('revenue >= ?');
    values.push(Number(minRevenue));
  }

  const sort = searchParams.get('sort') || 'sales_desc';
  const orderByMap = {
    sales_desc: 'sales DESC, revenue DESC',
    sales_growth_desc: 'sales_growth DESC, sales DESC',
    revenue_desc: 'revenue DESC, sales DESC',
    margin_desc: 'estimated_gross_margin DESC, sales DESC',
    impressions_desc: 'impressions DESC, sales DESC',
  };

  return {
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
               COUNT(products_normalized.id) AS product_count
        FROM source_jobs
        LEFT JOIN products_normalized ON products_normalized.job_id = source_jobs.id
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
    const { whereClause, values, orderBy } = buildProductsQuery(url.searchParams, resolvedJobId);
    const offset = (page - 1) * pageSize;

    const totalRow = db.prepare(`
      SELECT COUNT(*) AS total
      FROM products_normalized
      WHERE ${whereClause}
    `).get(...values);

    const items = db.prepare(`
      SELECT id, job_id, ozon_product_id, product_type, brand,
             category_level_1, category_level_2, category_level_3,
             sales, sales_growth, potential_index, revenue,
             add_to_cart_rate, impressions, clicks, view_rate,
             ad_cost, ad_cost_rate, order_conversion_rate, estimated_gross_margin,
             shipping_mode, delivery_time, average_sales_amount,
             length_cm, width_cm, height_cm, weight_g, created_at
      FROM products_normalized
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...values, pageSize, offset);

    const summary = db.prepare(`
      SELECT
        COUNT(*) AS total_products,
        MAX(sales) AS max_sales,
        MAX(revenue) AS max_revenue,
        AVG(sales) AS avg_sales,
        AVG(revenue) AS avg_revenue,
        AVG(estimated_gross_margin) AS avg_margin
      FROM products_normalized
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
      FROM products_normalized
      WHERE job_id = ?
    `).get(resolvedJobId);

    const categoryOptions = db.prepare(`
      SELECT DISTINCT category_level_1 AS value
      FROM products_normalized
      WHERE job_id = ? AND category_level_1 IS NOT NULL AND category_level_1 != ''
      ORDER BY category_level_1
    `).all(resolvedJobId).map((row) => row.value);

    const productTypeOptions = db.prepare(`
      SELECT DISTINCT product_type AS value
      FROM products_normalized
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

async function handleApiOzonCategoryAttributes(req, res) {
  try {
    const body = await readJsonBody(req);
    const categoryId = parseInteger(body.categoryId, null);
    if (!categoryId) {
      sendError(res, 400, 'categoryId 必须是正整数');
      return;
    }

    const client = createOzonClient(body);
    const result = await client.getCategoryAttributes({ categoryIds: [categoryId] });
    sendJson(res, 200, result);
  } catch (error) {
    sendError(res, error.status || 500, error.message, error.body || null);
  }
}

async function handleApiOzonAttributeValues(req, res) {
  try {
    const body = await readJsonBody(req);
    const categoryId = parseInteger(body.categoryId, null);
    const attributeId = parseInteger(body.attributeId, null);
    if (!categoryId || !attributeId) {
      sendError(res, 400, 'categoryId 和 attributeId 必须是正整数');
      return;
    }

    const client = createOzonClient(body);
    const result = await client.getCategoryAttributeValues({ categoryId, attributeId });
    sendJson(res, 200, result);
  } catch (error) {
    sendError(res, error.status || 500, error.message, error.body || null);
  }
}

export function createWorkbenchServer() {
  return createServer(async (req, res) => {
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

    if ((req.url || '').startsWith('/api/ozon/category-attributes')) {
      await handleApiOzonCategoryAttributes(req, res);
      return;
    }

    if ((req.url || '').startsWith('/api/ozon/attribute-values')) {
      await handleApiOzonAttributeValues(req, res);
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
