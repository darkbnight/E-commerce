import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';

const root = process.cwd();
const screenshotDir = path.join(root, 'docs', '测试文档', '商品筛选测价环节快速定价联动', 'UI');
const sourceDbPath = path.join(root, 'db', 'ecommerce-workbench.sqlite');
const tempRoot = path.join(root, '.cache', 'test-temp');
await mkdir(tempRoot, { recursive: true });
await mkdir(screenshotDir, { recursive: true });

const tempDir = await mkdtemp(path.join(tempRoot, 'selection-quick-pricing-'));
const tempDbPath = path.join(tempDir, 'ecommerce-workbench.sqlite');
await copyFile(sourceDbPath, tempDbPath);
process.env.ECOMMERCE_WORKBENCH_DB_PATH = tempDbPath;

let latestJobId = null;
let latestSnapshotId = null;
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
    latestJobId = latestJob.id;
    const latestSnapshot = db.prepare(`
      SELECT id
      FROM product_business_snapshots
      WHERE job_id = ?
      ORDER BY id ASC
      LIMIT 1
    `).get(latestJob.id);
    latestSnapshotId = latestSnapshot?.id || null;
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

const { startWorkbenchServer } = await import('../../backend/menglar-workbench-api/server.mjs');

const port = Number(process.env.TEST_PORT || 4202);
const server = await startWorkbenchServer({ port });
let browser;

try {
  if (!latestSnapshotId) {
    throw new Error('No product snapshot available for screenshot test');
  }
  const createResponse = await fetch(`http://127.0.0.1:${port}/api/product-selection/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ sourceSnapshotId: latestSnapshotId }] }),
  });
  assert.equal(createResponse.status, 200);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const jobQuery = latestJobId ? `&jobId=${latestJobId}` : '';
  await page.goto(`http://127.0.0.1:${port}/results?mode=screening${jobQuery}`, { waitUntil: 'domcontentloaded' });

  const row = page.locator('.selection-decision-card').first();
  await row.waitFor({ timeout: 10000 });
  assert.equal(await row.locator('.selection-pricing-line').count(), 3);
  await page.screenshot({
    path: path.join(screenshotDir, 'selection-quick-pricing-default.png'),
    fullPage: true,
  });

  const rowActions = row.locator('.selection-action-block .screening-row-actions button');
  await rowActions.first().click();
  await page.locator('.pricing-dialog').waitFor({ timeout: 10000 });
  await page.getByTestId('selection-pricing-purchase-cost').fill('2');
  await page.screenshot({
    path: path.join(screenshotDir, 'selection-quick-pricing-pricing.png'),
    fullPage: true,
  });

  await page.getByRole('button', { name: '通过，进入找货' }).click();
  await page.locator('.pricing-dialog').waitFor({ state: 'detached', timeout: 10000 });
  await page.locator('.screening-state-pill', { hasText: '待找供应链' }).first().waitFor({ timeout: 10000 });
  await page.screenshot({
    path: path.join(screenshotDir, 'selection-quick-pricing-result.png'),
    fullPage: true,
  });

  console.log(JSON.stringify({
    ok: true,
    screenshotDir,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}
