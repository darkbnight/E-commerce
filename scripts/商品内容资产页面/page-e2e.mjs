import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';

const screenshotDir = path.resolve('docs', '测试文档', '商品内容资产页面', 'UI');
await mkdir(screenshotDir, { recursive: true });

const tempDir = path.join(os.tmpdir(), 'ecommerce-product-content-tests');
await mkdir(tempDir, { recursive: true });
const dbPath = path.join(tempDir, 'product-content-page.sqlite');
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
  401,
  'ozon',
  'demo-content-ornament-001',
  'https://ozon.example/product/demo-content-ornament-001',
  '复古金属挂饰套装 100 枚',
  '旧版内容描述，用于历史版本切换。',
  JSON.stringify(['旧版', '挂饰']),
  'https://placehold.co/720x720/f2e5d5/1b2a2f?text=Ornament+V1',
  JSON.stringify(['https://placehold.co/720x720/f2e5d5/1b2a2f?text=Ornament+V1-1']),
  'page-hash-old',
  '2026-04-22T09:00:00.000Z',
  '2026-04-22T09:00:00.000Z',
  '2026-04-22T09:00:00.000Z',
);

const latestAsset = insertAsset.run(
  402,
  'ozon',
  'demo-content-ornament-001',
  'https://ozon.example/product/demo-content-ornament-001',
  '复古金属挂饰套装 100 枚 升级版',
  '新版内容描述，用于页面 E2E 检查。',
  JSON.stringify(['最新版', '手作', '挂饰']),
  'https://placehold.co/720x720/efe2cf/12363c?text=Ornament+V2',
  JSON.stringify([
    'https://placehold.co/720x720/efe2cf/12363c?text=Ornament+V2-1',
    'https://placehold.co/720x720/e2d1bb/12363c?text=Ornament+V2-2',
  ]),
  'page-hash-latest',
  '2026-04-25T13:30:00.000Z',
  '2026-04-25T13:30:00.000Z',
  '2026-04-25T13:30:00.000Z',
);

insertSku.run(
  oldAsset.lastInsertRowid,
  401,
  'ozon',
  'demo-content-ornament-001',
  'page-sku-old-1',
  '100 枚装',
  18.8,
  'CNY',
  JSON.stringify(['https://placehold.co/600x600/f3eadf/12363c?text=100pcs+V1']),
  0,
  '2026-04-22T09:00:00.000Z',
  '2026-04-22T09:00:00.000Z',
  '2026-04-22T09:00:00.000Z',
);

insertSku.run(
  latestAsset.lastInsertRowid,
  402,
  'ozon',
  'demo-content-ornament-001',
  'page-sku-latest-1',
  '100 枚装',
  19.92,
  'CNY',
  JSON.stringify(['https://placehold.co/600x600/f3eadf/12363c?text=100pcs+V2']),
  0,
  '2026-04-25T13:30:00.000Z',
  '2026-04-25T13:30:00.000Z',
  '2026-04-25T13:30:00.000Z',
);

insertBusiness.run(
  801,
  'ozon',
  'demo-content-ornament-001',
  'https://ozon.example/product/demo-content-ornament-001',
  'https://placehold.co/720x720/efe2cf/12363c?text=Ornament+V2',
  'Craft Home',
  'MoriCraft',
  '复古金属挂饰套装 100 枚 升级版',
  286,
  5697.12,
  19.92,
  18240,
  1378,
  9.85,
  23.4,
  'FBO',
  '6-10天',
  '2026-04-25T13:35:00.000Z',
  '2026-04-25T13:35:00.000Z',
  '2026-04-25T13:35:00.000Z',
);

insertSku.run(
  latestAsset.lastInsertRowid,
  402,
  'ozon',
  'demo-content-ornament-001',
  'page-sku-latest-2',
  '150 枚装',
  22.5,
  'CNY',
  JSON.stringify(['https://placehold.co/600x600/eadccc/12363c?text=150pcs+V2']),
  1,
  '2026-04-25T13:30:00.000Z',
  '2026-04-25T13:30:00.000Z',
  '2026-04-25T13:30:00.000Z',
);

db.close();

process.env.ECOMMERCE_WORKBENCH_DB_PATH = dbPath;
const { startWorkbenchServer } = await import('../../backend/menglar-workbench-api/server.mjs');

const server = await startWorkbenchServer({ port: 0, host: '127.0.0.1' });
const address = server.address();
const baseUrl = `http://${address.address}:${address.port}`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

try {
  await page.route('**/api/product-content**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.continue();
  });
  await page.route('**/api/product-content/*/skus', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.continue();
  });

  await page.goto(`${baseUrl}/product-content`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(screenshotDir, 'product-content-input.png'), fullPage: true });

  const responsePromise = page.waitForResponse((response) =>
    response.url().includes('/api/product-content?') &&
    response.request().method() === 'GET' &&
    response.status() === 200,
  );
  await page.locator('.product-content-demo-strip button').first().click();
  await page.waitForSelector('text=正在读取商品内容资产和版本历史');
  await page.screenshot({ path: path.join(screenshotDir, 'product-content-loading.png'), fullPage: true });
  await responsePromise;
  await page.waitForSelector('text=复古金属挂饰套装 100 枚 升级版');
  await page.waitForSelector('text=150 枚装');
  await page.waitForSelector('text=经营快照');
  await page.waitForSelector('text=Craft Home');

  await page.locator('.product-content-version-card').nth(1).click();
  await page.waitForSelector('text=复古金属挂饰套装 100 枚');
  await page.waitForSelector('text=100 枚装');
  await page.screenshot({ path: path.join(screenshotDir, 'product-content-result.png'), fullPage: true });

  const detailText = await page.locator('.product-content-detail').textContent();
  assert.match(detailText || '', /复古金属挂饰套装 100 枚/);
  const skuText = await page.locator('.product-content-sku-list').textContent();
  assert.match(skuText || '', /100 枚装/);

  await page.getByPlaceholder('例如 demo-content-ornament-001').fill('not-exists-001');
  await page.getByRole('button', { name: '查询内容资产' }).click();
  await page.waitForSelector('text=没有内容资产数据');
  const emptyText = await page.textContent('.product-content-empty');
  assert.match(emptyText || '', /没有内容资产数据/);

  console.log('product-content-page e2e passed');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
