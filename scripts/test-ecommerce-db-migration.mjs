import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startWorkbenchServer } from '../backend/menglar-workbench-api/server.mjs';

const ROOT = process.cwd();
const DB_PATH = process.env.ECOMMERCE_WORKBENCH_DB_PATH ||
  path.join(ROOT, 'db', 'ecommerce-workbench.sqlite');

function tableColumns(db, tableName) {
  return new Set(db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name));
}

function assertColumns(db, tableName, expectedColumns) {
  const columns = tableColumns(db, tableName);
  for (const column of expectedColumns) {
    assert.ok(columns.has(column), `${tableName}.${column} should exist`);
  }
}

const db = new DatabaseSync(DB_PATH, { readOnly: true });
try {
  assertColumns(db, 'product_business_snapshots', [
    'job_id',
    'platform',
    'platform_product_id',
    'sales_volume',
    'sales_amount',
    'captured_at',
  ]);
  assertColumns(db, 'product_content_assets', [
    'platform',
    'platform_product_id',
    'title',
    'description',
    'image_urls_json',
    'content_status',
  ]);
  assertColumns(db, 'product_content_result', [
    'result_key',
    'source_job_id',
    'source_snapshot_id',
    'description_category_id',
    'type_id',
    'attributes_json',
    'ozon_import_item_json',
  ]);

  const oldTableCount = db.prepare(`
    SELECT COUNT(*) AS total
    FROM sqlite_master
    WHERE type = 'table' AND name = 'products_normalized'
  `).get().total;
  assert.equal(oldTableCount, 0, 'products_normalized should be dropped after migration');

  const newCount = db.prepare('SELECT COUNT(*) AS total FROM product_business_snapshots').get().total;
  assert.ok(newCount > 0, 'product_business_snapshots should contain migrated records');

  const mapped = db.prepare(`
    SELECT
      job_id,
      platform,
      platform_product_id,
      sales_volume,
      sales_amount
    FROM product_business_snapshots
    ORDER BY id
    LIMIT 1
  `).get();
  if (mapped) {
    assert.equal(mapped.platform, 'ozon');
    assert.ok(mapped.job_id != null);
    assert.ok(mapped.platform_product_id);
    assert.ok(mapped.sales_volume != null);
    assert.ok(mapped.sales_amount != null);
  }
} finally {
  db.close();
}

const port = Number(process.env.TEST_PORT || 4199);
const server = await startWorkbenchServer({ port });
try {
  const baseUrl = `http://127.0.0.1:${port}`;
  const resultJobs = await fetch(`${baseUrl}/api/result-jobs`);
  assert.equal(resultJobs.status, 200);
  const resultJobsBody = await resultJobs.json();
  assert.ok(Array.isArray(resultJobsBody.jobs));
  assert.ok(resultJobsBody.jobs.some((job) => Number(job.product_count) > 0));

  const products = await fetch(`${baseUrl}/api/products?pageSize=5`);
  assert.equal(products.status, 200);
  const productsBody = await products.json();
  assert.ok(Array.isArray(productsBody.items));
  assert.ok(productsBody.items.length > 0);
  assert.equal(productsBody.items[0].platform, 'ozon');
  assert.ok(productsBody.items[0].platform_product_id);
  assert.ok(productsBody.items[0].sales_volume != null);
  assert.ok(productsBody.items[0].sales_amount != null);
  assert.equal(productsBody.items[0].ozon_product_id, undefined);
  assert.equal(productsBody.items[0].sales, undefined);
  assert.equal(productsBody.items[0].revenue, undefined);

  console.log(JSON.stringify({
    ok: true,
    database: DB_PATH,
    productCount: productsBody.actualProductCount,
    resultJobCount: resultJobsBody.jobs.length,
  }, null, 2));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
