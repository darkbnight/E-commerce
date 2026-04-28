import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';

const root = process.cwd();
const sourceDbPath = path.join(root, 'db', 'ecommerce-workbench.sqlite');
const screenshotDir = path.join(root, 'docs', '测试文档', '萌拉结果工作台与商品筛选页优化', 'UI');
const tempRoot = path.join(root, '.cache', 'test-temp');
await mkdir(tempRoot, { recursive: true });
const tempDir = await mkdtemp(path.join(tempRoot, 'menglar-results-ui-'));
const tempDbPath = path.join(tempDir, 'ecommerce-workbench.sqlite');

await mkdir(screenshotDir, { recursive: true });
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
} finally {
  db.close();
}

const { startWorkbenchServer } = await import('../../backend/menglar-workbench-api/server.mjs');
const port = Number(process.env.TEST_PORT || 4202);
const server = await startWorkbenchServer({ port });
let browser;

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });

  await page.goto(`http://127.0.0.1:${port}/results`, { waitUntil: 'domcontentloaded' });
  await page.screenshot({
    path: path.join(screenshotDir, 'results-default.png'),
    fullPage: true,
  });

  const addButtons = page.locator('tbody button', { hasText: '加入筛选池' });
  assert.ok((await addButtons.count()) > 0, '需要至少一个单品加入筛选池按钮');
  await addButtons.first().click();
  await page.locator('select').filter({ has: page.locator('option[value="selected"]') }).first().selectOption('selected');
  await page.locator('.raw-product-status.is-selected').first().waitFor({ timeout: 10000 });
  await page.screenshot({
    path: path.join(screenshotDir, 'results-single-add.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: '商品筛选' }).click();

  const selectionRow = page.locator('.selection-decision-card').first();
  await selectionRow.waitFor({ timeout: 10000 });
  await selectionRow.getByRole('button', { name: '进入测价' }).waitFor({ timeout: 10000 });

  let delayedOnce = false;
  await page.route('**/api/product-selection/items/*', async (route) => {
    const request = route.request();
    if (!delayedOnce && request.method() === 'PATCH') {
      delayedOnce = true;
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
      return;
    }
    await route.continue();
  });

  await selectionRow.getByRole('button', { name: '进入测价' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(screenshotDir, 'selection-processing.png'),
    fullPage: true,
  });
  await selectionRow.getByRole('button', { name: '测价通过' }).waitFor({ timeout: 10000 });

  await selectionRow.getByRole('button', { name: '测价通过' }).click();
  await selectionRow.getByRole('button', { name: '已找到货源' }).waitFor({ timeout: 10000 });
  await selectionRow.getByRole('button', { name: '已找到货源' }).click();
  await selectionRow.getByRole('button', { name: '竞品已整理' }).waitFor({ timeout: 10000 });
  await selectionRow.getByRole('button', { name: '竞品已整理' }).click();
  await selectionRow.getByRole('button', { name: '进入商品数据整理' }).waitFor({ timeout: 10000 });

  await page.screenshot({
    path: path.join(screenshotDir, 'selection-ready.png'),
    fullPage: true,
  });

  console.log(JSON.stringify({
    ok: true,
    screenshotDir,
    files: [
      'results-default.png',
      'results-single-add.png',
      'selection-processing.png',
      'selection-ready.png',
    ],
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}
