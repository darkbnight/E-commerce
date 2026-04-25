import assert from 'node:assert/strict';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';

const root = process.cwd();
const sourceDbPath = path.join(root, 'db', 'ecommerce-workbench.sqlite');
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ecommerce-db-ui-'));
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
  await page.goto(`http://127.0.0.1:${port}/results`, { waitUntil: 'networkidle' });

  await expectText(page, '商品结果');
  await expectText(page, '商品信息');
  await expectText(page, '销售量');
  await expectText(page, '销售金额');
  await expectText(page, '广告');
  await expectText(page, '当前页加入筛选池');

  await page.getByRole('button', { name: '商品筛选' }).click();
  await expectText(page, '筛选池还没有商品');
  await page.getByRole('button', { name: '回到结果展示' }).click();

  const addButtons = page.locator('tbody button', { hasText: '加入筛选池' });
  const initialButtonCount = await addButtons.count();
  assert.ok(initialButtonCount > 0, 'should have at least one single-add button');
  await addButtons.first().click();

  await page.getByRole('button', { name: '商品筛选' }).click();
  await expectText(page, '商品筛选工作台');
  await expectText(page, '全部');
  await expectText(page, '待初筛');
  await expectText(page, '进入测价');

  const selectionRows = page.locator('.selection-table tbody tr');
  await selectionRows.first().waitFor({ timeout: 10000 });
  assert.equal(await selectionRows.count(), 1, 'single add should only create one selection row');
  const firstSelectionRow = selectionRows.first();

  await expectButton(firstSelectionRow, '进入测价');
  await firstSelectionRow.getByRole('button', { name: '进入测价' }).click();
  await expectButton(firstSelectionRow, '测价通过');
  await firstSelectionRow.getByRole('button', { name: '测价通过' }).click();
  await expectButton(firstSelectionRow, '已找到货源');
  await firstSelectionRow.getByRole('button', { name: '已找到货源' }).click();
  await expectButton(firstSelectionRow, '竞品已整理');
  await firstSelectionRow.getByRole('button', { name: '竞品已整理' }).click();
  await expectText(firstSelectionRow, '可流转');
  await expectButton(firstSelectionRow, '进入商品数据整理');
  await firstSelectionRow.getByRole('button', { name: '进入商品数据整理' }).click();
  await expectButton(firstSelectionRow, '已流转商品数据整理');

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '商品筛选' }).click();
  const reloadedRow = page.locator('.selection-table tbody tr').first();
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

async function expectText(page, text) {
  const locator = page.getByText(text).first();
  await locator.waitFor({ timeout: 10000 });
  assert.ok(await locator.isVisible(), `${text} should be visible`);
}

async function expectButton(scope, text) {
  const locator = scope.getByRole('button', { name: text });
  await locator.waitFor({ timeout: 10000 });
  assert.ok(await locator.isVisible(), `${text} button should be visible`);
}
