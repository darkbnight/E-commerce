import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

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

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getLatestJobId(db) {
  const row = db.prepare(`
    SELECT id
    FROM source_jobs
    WHERE job_status = 'success'
    ORDER BY id DESC
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
    const jobs = db.prepare(`
      SELECT id, page_name, page_url, page_type, pagination_mode, job_status,
             started_at, finished_at, raw_count, normalized_count, warning_count, error_message
      FROM source_jobs
      ORDER BY id DESC
      LIMIT 20
    `).all();
    return { jobs };
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
    };
  });

  sendJson(res, 200, payload);
}

const server = createServer(async (req, res) => {
  if ((req.url || '').startsWith('/api/jobs')) {
    handleApiJobs(res);
    return;
  }

  if ((req.url || '').startsWith('/api/products')) {
    handleApiProducts(req, res);
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

await mkdir(WORKBENCH_DIST, { recursive: true }).catch(() => {});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Menglar workbench api: http://127.0.0.1:${PORT}/`);
});
