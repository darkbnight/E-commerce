import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const tempDir = path.join(os.tmpdir(), 'ecommerce-product-content-tests');
await mkdir(tempDir, { recursive: true });
const dbPath = path.join(tempDir, 'product-content-api.sqlite');
if (existsSync(dbPath)) {
  await rm(dbPath, { force: true });
}

const db = new DatabaseSync(dbPath, { open: true });
db.exec(`
  CREATE TABLE product_business_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    raw_record_id INTEGER,
    platform TEXT NOT NULL DEFAULT 'ozon',
    platform_product_id TEXT NOT NULL,
    product_url TEXT,
    product_image_url TEXT,
    shop_id TEXT,
    shop_name TEXT,
    product_type TEXT,
    brand TEXT,
    title TEXT,
    product_created_date TEXT,
    category_level_1 TEXT,
    category_level_2 TEXT,
    category_level_3 TEXT,
    sales_volume REAL,
    sales_growth REAL,
    potential_index REAL,
    sales_amount REAL,
    sales_amount_cny REAL,
    avg_price_rub REAL,
    avg_price_cny REAL,
    add_to_cart_rate REAL,
    impressions REAL,
    clicks REAL,
    view_rate REAL,
    ad_cost REAL,
    ad_cost_cny REAL,
    ad_cost_rate REAL,
    order_conversion_rate REAL,
    estimated_gross_margin REAL,
    shipping_mode TEXT,
    delivery_time TEXT,
    average_sales_amount REAL,
    length_cm REAL,
    width_cm REAL,
    height_cm REAL,
    weight_g REAL,
    parse_status TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE product_content_assets (
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
    updated_at TEXT NOT NULL
  );

  CREATE TABLE product_content_skus (
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
    updated_at TEXT NOT NULL
  );
`);

const insertAsset = db.prepare(`
  INSERT INTO product_content_assets (
    source_job_id, platform, platform_product_id, product_url, title, description,
    tags_json, main_image_url, image_urls_json, content_hash, captured_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertSku = db.prepare(`
  INSERT INTO product_content_skus (
    content_asset_id, source_job_id, platform, platform_product_id, platform_sku_id,
    sku_name, price, currency_code, images_json, sort_order, captured_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertBusiness = db.prepare(`
  INSERT INTO product_business_snapshots (
    job_id, platform, platform_product_id, product_url, product_image_url, shop_name, brand, title,
    sales_volume, sales_amount_cny, avg_price_cny, impressions, clicks,
    order_conversion_rate, estimated_gross_margin, shipping_mode, delivery_time,
    parse_status, captured_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', ?, ?, ?)
`);

const oldAsset = insertAsset.run(
  301,
  'ozon',
  'test-product-content-001',
  'https://ozon.example/product/test-product-content-001',
  '旧版挂饰标题',
  '旧版商品描述',
  JSON.stringify(['复古', '挂饰']),
  'https://img.example/old-main.jpg',
  JSON.stringify(['https://img.example/old-1.jpg']),
  'hash-old-version',
  '2026-04-20T09:10:00.000Z',
  '2026-04-20T09:10:00.000Z',
  '2026-04-20T09:10:00.000Z',
);

const latestAsset = insertAsset.run(
  302,
  'ozon',
  'test-product-content-001',
  'https://ozon.example/product/test-product-content-001',
  '最新版挂饰标题',
  '最新版商品描述，用于页面查看。',
  JSON.stringify(['节庆', '手作', '金属挂饰']),
  'https://img.example/latest-main.jpg',
  JSON.stringify(['https://img.example/latest-1.jpg', 'https://img.example/latest-2.jpg']),
  'hash-latest-version',
  '2026-04-25T13:20:00.000Z',
  '2026-04-25T13:20:00.000Z',
  '2026-04-25T13:20:00.000Z',
);

insertSku.run(
  oldAsset.lastInsertRowid,
  301,
  'ozon',
  'test-product-content-001',
  'sku-old-1',
  '旧版 SKU 1',
  18.5,
  'CNY',
  JSON.stringify(['https://img.example/old-sku-1.jpg']),
  0,
  '2026-04-20T09:10:00.000Z',
  '2026-04-20T09:10:00.000Z',
  '2026-04-20T09:10:00.000Z',
);

insertSku.run(
  latestAsset.lastInsertRowid,
  302,
  'ozon',
  'test-product-content-001',
  'sku-latest-1',
  '最新版 SKU 1',
  19.92,
  'CNY',
  JSON.stringify(['https://img.example/latest-sku-1.jpg']),
  0,
  '2026-04-25T13:20:00.000Z',
  '2026-04-25T13:20:00.000Z',
  '2026-04-25T13:20:00.000Z',
);

insertBusiness.run(
  701,
  'ozon',
  'test-product-content-001',
  'https://ozon.example/product/test-product-content-001',
  'https://img.example/business-main.jpg',
  'Demo Shop',
  'Demo Brand',
  '最新版挂饰标题',
  286,
  5697.12,
  19.92,
  18240,
  1378,
  9.85,
  23.4,
  'FBO',
  '6-10天',
  '2026-04-25T13:25:00.000Z',
  '2026-04-25T13:25:00.000Z',
  '2026-04-25T13:25:00.000Z',
);

insertSku.run(
  latestAsset.lastInsertRowid,
  302,
  'ozon',
  'test-product-content-001',
  'sku-latest-2',
  '最新版 SKU 2',
  21.5,
  'CNY',
  JSON.stringify(['https://img.example/latest-sku-2.jpg', 'https://img.example/latest-sku-2-b.jpg']),
  1,
  '2026-04-25T13:20:00.000Z',
  '2026-04-25T13:20:00.000Z',
  '2026-04-25T13:20:00.000Z',
);

db.close();

process.env.ECOMMERCE_WORKBENCH_DB_PATH = dbPath;
const { startWorkbenchServer } = await import('../../backend/menglar-workbench-api/server.mjs');

const server = await startWorkbenchServer({ port: 0, host: '127.0.0.1' });
const address = server.address();
const baseUrl = `http://${address.address}:${address.port}`;

try {
  const latestResponse = await fetch(`${baseUrl}/api/product-content?productId=test-product-content-001&platform=ozon`);
  assert.equal(latestResponse.status, 200);
  const latestPayload = await latestResponse.json();
  assert.equal(latestPayload.item.platform_product_id, 'test-product-content-001');
  assert.equal(latestPayload.item.title, '最新版挂饰标题');
  assert.equal(latestPayload.skus.length, 2);

  const historyResponse = await fetch(`${baseUrl}/api/product-content?productId=test-product-content-001&platform=ozon&latest=false`);
  assert.equal(historyResponse.status, 200);
  const historyPayload = await historyResponse.json();
  assert.equal(historyPayload.total, 2);
  assert.equal(historyPayload.items[0].content_hash, 'hash-latest-version');

  const selectedId = historyPayload.items[1].id;
  const skuResponse = await fetch(`${baseUrl}/api/product-content/${selectedId}/skus`);
  assert.equal(skuResponse.status, 200);
  const skuPayload = await skuResponse.json();
  assert.equal(skuPayload.item.content_hash, 'hash-old-version');
  assert.equal(skuPayload.skus.length, 1);

  const businessResponse = await fetch(`${baseUrl}/api/product-business/latest?productId=test-product-content-001&platform=ozon`);
  assert.equal(businessResponse.status, 200);
  const businessPayload = await businessResponse.json();
  assert.equal(businessPayload.item.platform_product_id, 'test-product-content-001');
  assert.equal(Number(businessPayload.item.sales_volume), 286);
  assert.equal(Number(businessPayload.item.avg_price_cny), 19.92);

  const verifyDb = new DatabaseSync(dbPath, { open: true });
  const assetRow = verifyDb.prepare(`
    SELECT id, platform, platform_product_id, content_hash, captured_at
    FROM product_content_assets
    WHERE content_hash = 'hash-latest-version'
    LIMIT 1
  `).get();
  assert.equal(assetRow.platform, 'ozon');
  assert.equal(assetRow.platform_product_id, 'test-product-content-001');
  assert.equal(assetRow.content_hash, 'hash-latest-version');
  assert.equal(assetRow.captured_at, '2026-04-25T13:20:00.000Z');

  const skuRows = verifyDb.prepare(`
    SELECT content_asset_id, platform_sku_id, price, images_json
    FROM product_content_skus
    WHERE content_asset_id = ?
    ORDER BY sort_order ASC
  `).all(assetRow.id);
  assert.equal(skuRows.length, 2);
  assert.equal(skuRows[0].platform_sku_id, 'sku-latest-1');
  assert.equal(Number(skuRows[0].price), 19.92);
  assert.match(String(skuRows[1].images_json), /latest-sku-2-b/);
  verifyDb.close();

  console.log(JSON.stringify({
    verified: true,
    latestContentId: assetRow.id,
    historyCount: historyPayload.total,
    latestSkuCount: latestPayload.skus.length,
  }, null, 2));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
