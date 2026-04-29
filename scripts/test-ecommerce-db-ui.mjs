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

let latestJobIdForTest = null;
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
    latestJobIdForTest = latestJob.id;
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
  if (latestJobIdForTest) {
    const response = await fetch(`http://127.0.0.1:${port}/api/products?jobId=${latestJobIdForTest}&minGrowth=30&pageSize=5`);
    assert.equal(response.status, 200, 'minGrowth API request should succeed');
    const payload = await response.json();
    assert.equal(payload.filters.minGrowth, '30', 'minGrowth should be echoed by product filters');
    assert.ok(payload.items.every((item) => Number(item.sales_growth) >= 30), 'minGrowth should filter by sales_growth');
  }

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`http://127.0.0.1:${port}/results?mode=result`, { waitUntil: 'domcontentloaded' });
  await page.locator('.result-mode-tabs button').first().click();

  await page.locator('.raw-product-status.is-pending').first().waitFor({ timeout: 10000 });
  await page.locator('.product-image-trigger').first().click();
  await page.locator('.image-preview-close').click();

  await page.locator('.result-mode-tabs button').nth(1).click();
  await page.locator('.result-empty-batch').waitFor({ timeout: 10000 });
  await page.locator('.result-empty-batch .wb-button').first().click();

  const addButton = page.locator('tbody .screening-row-actions button').first();
  await addButton.waitFor({ timeout: 10000 });
  await addButton.click();

  await page.locator('.result-mode-tabs button').nth(1).click();
  await page.locator('.selection-filter-bar').waitFor({ timeout: 10000 });
  await page.locator('.screening-status-strip').waitFor({ timeout: 10000 });

  const row = page.locator('.selection-decision-card').first();
  await row.waitFor({ timeout: 10000 });
  assert.equal(await page.locator('.selection-decision-card').count(), 1, 'single add should create one selection row');
  assert.equal(await row.locator('.selection-logistics-block').count(), 1, 'logistics column should be visible');
  assert.equal(await row.locator('.selection-pricing-block').count(), 1, 'pricing column should be visible');
  assert.equal(await row.locator('.selection-supply-block').count(), 1, 'supply column should be visible');

  const autoDeliveryText = (await row.locator('.selection-logistics-block .selection-data-card strong').nth(1).textContent())?.trim() || '';
  assert.notEqual(autoDeliveryText, '-', 'delivery cost should be auto calculated after adding to selection pool');

  await row.locator('.selection-primary-action').click();
  await page.locator('.competitor-detail-dialog').waitFor({ timeout: 10000 });
  const competitorDialogText = await page.locator('.competitor-detail-dialog').innerText();
  assert.match(competitorDialogText, /\d{1,3}(,\d{3})+/, 'large numbers should use comma thousands separators');
  assert.doesNotMatch(competitorDialogText, /\d{1,3}(?:\.\d{3}){2,}/, 'large numbers should not use dot thousands separators');
  await page.locator('.competitor-detail-close').click();

  const rowActions = row.locator('.selection-action-block .screening-row-actions button');
  await rowActions.first().click();
  await rowActions.first().click();
  const deliveryAfterPricing = (await row.locator('.selection-logistics-block .selection-data-card strong').nth(1).textContent())?.trim() || '';
  assert.equal(deliveryAfterPricing, autoDeliveryText, 'pricing pass should keep the auto calculated delivery cost');

  await rowActions.first().click();
  await rowActions.first().click();
  await rowActions.first().click();
  await rowActions.first().waitFor({ timeout: 10000 });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.result-mode-tabs button').nth(1).click();
  const reloadedRow = page.locator('.selection-decision-card').first();
  await reloadedRow.waitFor({ timeout: 10000 });
  assert.equal(await reloadedRow.locator('.selection-logistics-block').count(), 1, 'logistics column should persist after reload');

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
