import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startWorkbenchServer } from '../backend/menglar-workbench-api/server.mjs';
await import('./migrate-ecommerce-workbench-db.mjs');

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

const db = new DatabaseSync(DB_PATH);
try {
  assertColumns(db, 'product_business_snapshots', [
    'job_id',
    'platform',
    'platform_product_id',
    'product_image_url',
    'shop_name',
    'product_created_date',
    'sales_volume',
    'sales_amount',
    'sales_amount_cny',
    'avg_price_rub',
    'avg_price_cny',
    'ad_cost_cny',
    'captured_at',
  ]);
  assertColumns(db, 'product_content_assets', [
    'source_job_id',
    'platform',
    'platform_product_id',
    'title',
    'description',
    'tags_json',
    'main_image_url',
    'image_urls_json',
    'content_hash',
    'captured_at',
  ]);
  assertColumns(db, 'product_content_skus', [
    'content_asset_id',
    'source_job_id',
    'platform_product_id',
    'platform_sku_id',
    'price',
    'images_json',
    'captured_at',
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
  assertColumns(db, 'product_selection_items', [
    'source_job_id',
    'source_snapshot_id',
    'source_platform',
    'source_platform_product_id',
    'selection_stage',
    'pricing_decision',
    'supply_match_status',
    'competitor_packet_status',
    'transfer_to_prep_at',
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

  const now = new Date();
  const earlier = new Date(now.getTime() - 60_000).toISOString();
  const later = now.toISOString();
  const productId = 'test-product-content-001';

  db.prepare('DELETE FROM product_content_skus WHERE platform_product_id = ?').run(productId);
  db.prepare('DELETE FROM product_content_assets WHERE platform_product_id = ?').run(productId);

  const assetInsert = db.prepare(`
    INSERT INTO product_content_assets (
      source_job_id, platform, platform_product_id, product_url,
      title, description, tags_json, main_image_url, image_urls_json,
      content_hash, captured_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const firstAsset = assetInsert.run(
    1,
    'ozon',
    productId,
    'https://example.com/product/1',
    '旧标题',
    '旧描述',
    JSON.stringify(['old-tag']),
    'https://example.com/old-main.png',
    JSON.stringify(['https://example.com/old-1.png']),
    'hash-old',
    earlier,
    earlier,
    earlier,
  );
  const secondAsset = assetInsert.run(
    1,
    'ozon',
    productId,
    'https://example.com/product/1',
    '新标题',
    '新描述',
    JSON.stringify(['new-tag']),
    'https://example.com/new-main.png',
    JSON.stringify(['https://example.com/new-1.png', 'https://example.com/new-2.png']),
    'hash-new',
    later,
    later,
    later,
  );

  const firstAssetId = Number(firstAsset.lastInsertRowid);
  const secondAssetId = Number(secondAsset.lastInsertRowid);

  const skuInsert = db.prepare(`
    INSERT INTO product_content_skus (
      content_asset_id, source_job_id, platform, platform_product_id, platform_sku_id,
      sku_name, price, currency_code, images_json, sort_order,
      captured_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  skuInsert.run(
    firstAssetId,
    1,
    'ozon',
    productId,
    'sku-old-1',
    '旧SKU',
    10.5,
    'CNY',
    JSON.stringify(['https://example.com/sku-old-1.png']),
    0,
    earlier,
    earlier,
    earlier,
  );
  skuInsert.run(
    secondAssetId,
    1,
    'ozon',
    productId,
    'sku-new-1',
    '新SKU一',
    19.92,
    'CNY',
    JSON.stringify(['https://example.com/sku-new-1.png']),
    0,
    later,
    later,
    later,
  );
  skuInsert.run(
    secondAssetId,
    1,
    'ozon',
    productId,
    'sku-new-2',
    '新SKU二',
    29.92,
    'CNY',
    JSON.stringify(['https://example.com/sku-new-2.png', 'https://example.com/sku-new-2-b.png']),
    1,
    later,
    later,
    later,
  );
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
  assert.ok('product_image_url' in productsBody.items[0]);
  assert.ok('shop_name' in productsBody.items[0]);
  assert.ok('avg_price_rub' in productsBody.items[0]);
  assert.ok('avg_price_cny' in productsBody.items[0]);
  assert.ok('ad_cost_cny' in productsBody.items[0]);
  assert.ok('product_created_date' in productsBody.items[0]);
  assert.equal(productsBody.items[0].ozon_product_id, undefined);
  assert.equal(productsBody.items[0].sales, undefined);
  assert.equal(productsBody.items[0].revenue, undefined);

  const latestContent = await fetch(`${baseUrl}/api/product-content?platform=ozon&productId=test-product-content-001`);
  assert.equal(latestContent.status, 200);
  const latestContentBody = await latestContent.json();
  assert.equal(latestContentBody.item.platform_product_id, 'test-product-content-001');
  assert.equal(latestContentBody.item.title, '新标题');
  assert.deepEqual(latestContentBody.item.tags, ['new-tag']);
  assert.equal(latestContentBody.skus.length, 2);
  assert.equal(latestContentBody.skus[0].platform_sku_id, 'sku-new-1');
  assert.deepEqual(latestContentBody.skus[1].images, ['https://example.com/sku-new-2.png', 'https://example.com/sku-new-2-b.png']);

  const historyContent = await fetch(`${baseUrl}/api/product-content?platform=ozon&productId=test-product-content-001&latest=false`);
  assert.equal(historyContent.status, 200);
  const historyContentBody = await historyContent.json();
  assert.equal(historyContentBody.total, 2);
  assert.equal(historyContentBody.items[0].title, '新标题');
  assert.equal(historyContentBody.items[0].sku_count, 2);
  assert.equal(historyContentBody.items[1].title, '旧标题');
  assert.equal(historyContentBody.items[1].sku_count, 1);

  const versionSkus = await fetch(`${baseUrl}/api/product-content/${latestContentBody.item.id}/skus`);
  assert.equal(versionSkus.status, 200);
  const versionSkusBody = await versionSkus.json();
  assert.equal(versionSkusBody.item.id, latestContentBody.item.id);
  assert.equal(versionSkusBody.skus.length, 2);
  assert.equal(versionSkusBody.skus[0].sort_order, 0);
  assert.equal(versionSkusBody.skus[1].sort_order, 1);

  console.log(JSON.stringify({
    ok: true,
    database: DB_PATH,
    productCount: productsBody.actualProductCount,
    resultJobCount: resultJobsBody.jobs.length,
    latestContentId: latestContentBody.item.id,
    contentHistoryCount: historyContentBody.total,
  }, null, 2));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
