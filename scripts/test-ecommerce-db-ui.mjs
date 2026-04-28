import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';

const root = process.cwd();
const sourceDbPath = path.join(root, 'db', 'ecommerce-workbench.sqlite');
const tempRoot = path.join(root, '.cache', 'test-temp');
await mkdir(tempRoot, { recursive: true });
const tempDir = await mkdtemp(path.join(tempRoot, 'ecommerce-db-ui-'));
const tempDbPath = path.join(tempDir, 'ecommerce-workbench.sqlite');
await copyFile(sourceDbPath, tempDbPath);
process.env.ECOMMERCE_WORKBENCH_DB_PATH = tempDbPath;

const db = new DatabaseSync(tempDbPath);
try {
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
  `);
  db.exec('DELETE FROM product_selection_items;');
  const latestJob = db.prepare(`
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
  if (latestJob?.id) {
    db.prepare(`
      UPDATE product_business_snapshots
      SET avg_price_cny = COALESCE(avg_price_cny, 15),
          length_cm = COALESCE(length_cm, 45),
          width_cm = COALESCE(width_cm, 30),
          height_cm = COALESCE(height_cm, 0.5),
          weight_g = COALESCE(weight_g, 300)
      WHERE job_id = ?
    `).run(latestJob.id);
  }
} finally {
  db.close();
}

const { startWorkbenchServer } = await import('../backend/menglar-workbench-api/server.mjs');

const port = Number(process.env.TEST_PORT || 4201);
const server = await startWorkbenchServer({ port });
let browser;

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`http://127.0.0.1:${port}/results`, { waitUntil: 'domcontentloaded' });

  await expectText(page, '商品信息');
  await expectText(page, '销售量 / 增长');
  await expectText(page, '销售金额');
  await expectText(page, '广告');
  await expectText(page, '均价区间（CNY）');
  await expectText(page, '重量区间（g）');
  await expectText(page, '当前页加入筛选池');

  const productStatusSelect = page.locator('select').filter({ has: page.locator('option[value="pending"]') }).first();
  await productStatusSelect.waitFor({ timeout: 10000 });
  assert.equal(await productStatusSelect.inputValue(), 'pending', 'product status should default to pending');
  await page.locator('.wb-button.danger').first().waitFor({ timeout: 10000 });

  assert.equal(await page.locator('.result-panel-summary').count(), 0);
  assert.ok(await page.locator('.raw-product-status.is-pending').count() > 0, 'raw results should show pending status before selection action');

  const firstImage = page.locator('.product-image-trigger').first();
  await firstImage.waitFor({ timeout: 10000 });
  await firstImage.click();
  await expectText(page, '关闭');
  await page.getByRole('button', { name: '关闭' }).click();

  const rejectButtons = page.locator('.screening-row-actions button.is-reject');
  await rejectButtons.first().waitFor({ timeout: 10000 });
  await rejectButtons.first().click();
  await productStatusSelect.selectOption('rejected');
  await page.locator('.raw-product-status.is-rejected').first().waitFor({ timeout: 10000 });
  await productStatusSelect.selectOption('pending');
  await page.locator('.raw-product-status.is-pending').first().waitFor({ timeout: 10000 });

  await page.getByRole('button', { name: '商品筛选' }).click();
  await expectText(page, '筛选池还没有商品');
  await page.getByRole('button', { name: '回到结果展示' }).click();

  const addButtons = page.locator('tbody button', { hasText: '加入筛选池' });
  const initialButtonCount = await addButtons.count();
  assert.ok(initialButtonCount > 0, 'should have at least one single-add button');
  await addButtons.first().click();
  await productStatusSelect.selectOption('selected');
  await page.locator('.raw-product-status.is-selected').first().waitFor({ timeout: 10000 });
  assert.equal(await page.locator('.screening-row-actions button.is-selected').count(), 0, 'selected action button should not be shown');
  assert.equal(await page.locator('.screening-row-actions button', { hasText: '已在筛选池' }).count(), 0, 'selected state should only be shown in the status column');

  await page.getByRole('button', { name: '商品筛选' }).click();
  await page.locator('.selection-filter-bar').waitFor({ timeout: 10000 });
  await page.locator('.selection-filter-bar select').first().waitFor({ timeout: 10000 });
  await page.locator('.screening-status-strip').waitFor({ timeout: 10000 });
  await expectText(page, '进入测价');

  const selectionRows = page.locator('.selection-decision-card');
  await selectionRows.first().waitFor({ timeout: 10000 });
  assert.equal(await selectionRows.count(), 1, 'single add should only create one selection row');
  const firstSelectionRow = selectionRows.first();
  const autoDeliveryCost = firstSelectionRow.locator('.selection-data-card strong').nth(1);
  const autoDeliveryText = (await autoDeliveryCost.textContent())?.trim() || '';
  assert.notEqual(autoDeliveryText, '-', 'delivery cost should be auto calculated after adding to selection pool');
  await expectButton(firstSelectionRow, '查看竞品详情');
  await firstSelectionRow.getByRole('button', { name: '查看竞品详情' }).click();
  await expectText(page, '销售表现');
  await expectText(page, '流量与转化');
  await expectText(page, '广告与物流');
  await expectText(page, '尺寸与来源');
  const competitorDialogText = await page.getByRole('dialog', { name: '竞品详情' }).innerText();
  assert.match(competitorDialogText, /\d{1,3}(,\d{3})+/, 'large numbers should use comma thousands separators');
  assert.doesNotMatch(competitorDialogText, /\d{1,3}(?:\.\d{3}){2,}/, 'large numbers should not use dot thousands separators');
  await page.getByRole('dialog', { name: '竞品详情' }).getByRole('button', { name: '关闭' }).click();

  await expectButton(firstSelectionRow, '进入测价');
  await firstSelectionRow.getByRole('button', { name: '进入测价' }).click();
  await expectButton(firstSelectionRow, '测价通过');
  await firstSelectionRow.getByRole('button', { name: '测价通过' }).click();
  const deliveryAfterPricing = (await firstSelectionRow.locator('.selection-data-card strong').nth(1).textContent())?.trim() || '';
  assert.equal(deliveryAfterPricing, autoDeliveryText, 'pricing pass should keep the auto calculated delivery cost');
  await expectButton(firstSelectionRow, '已找到货源');
  await firstSelectionRow.getByRole('button', { name: '已找到货源' }).click();
  await expectButton(firstSelectionRow, '竞品已整理');
  await firstSelectionRow.getByRole('button', { name: '竞品已整理' }).click();
  await expectText(firstSelectionRow, '可流转');
  await expectButton(firstSelectionRow, '进入商品数据整理');
  await firstSelectionRow.getByRole('button', { name: '进入商品数据整理' }).click();
  await expectButton(firstSelectionRow, '已流转商品数据整理');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '商品筛选' }).click();
  const reloadedRow = page.locator('.selection-decision-card').first();
  await reloadedRow.waitFor({ timeout: 10000 });
  await expectButton(reloadedRow, '已流转商品数据整理');

  console.log(JSON.stringify({
    ok: true,
    url: page.url(),
    firstProductVisible: true,
    screeningPoolVisible: true,
    persistedAfterReload: true,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}

async function expectText(scope, text) {
  const locator = scope.getByText(text).first();
  await locator.waitFor({ timeout: 10000 });
  assert.ok(await locator.isVisible(), `${text} should be visible`);
}

async function expectButton(scope, text) {
  const locator = scope.getByRole('button', { name: text });
  await locator.waitFor({ timeout: 10000 });
  assert.ok(await locator.isVisible(), `${text} button should be visible`);
}
