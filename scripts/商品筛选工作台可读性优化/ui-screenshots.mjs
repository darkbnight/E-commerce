import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';

const root = process.cwd();
const sourceDbPath = path.join(root, 'db', 'ecommerce-workbench.sqlite');
const tempRoot = path.join(root, '.cache', 'test-temp');
const screenshotDir = path.join(root, 'docs', '测试文档', '商品筛选工作台可读性优化', 'UI');
await mkdir(tempRoot, { recursive: true });
await mkdir(screenshotDir, { recursive: true });

const tempDir = await mkdtemp(path.join(tempRoot, 'selection-workbench-ui-'));
const tempDbPath = path.join(tempDir, 'ecommerce-workbench.sqlite');
await copyFile(sourceDbPath, tempDbPath);
process.env.ECOMMERCE_WORKBENCH_DB_PATH = tempDbPath;

const db = new DatabaseSync(tempDbPath);
try {
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

const { startWorkbenchServer } = await import('../../backend/menglar-workbench-api/server.mjs');
const server = await startWorkbenchServer({ port: 4212 });
let browser;

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:4212/results', { waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: '结果展示' }).click();
  const addButtons = page.locator('tbody button', { hasText: '加入筛选池' });
  await addButtons.first().waitFor({ timeout: 10000 });
  await addButtons.first().click();

  await page.getByRole('button', { name: '商品筛选' }).click();
  await page.locator('.selection-decision-card').first().waitFor({ timeout: 10000 });
  await page.screenshot({ path: path.join(screenshotDir, 'selection-card-list.png'), fullPage: true });

  await page.getByRole('button', { name: '查看竞品详情' }).first().click();
  await page.getByRole('dialog', { name: '竞品详情' }).waitFor({ timeout: 10000 });
  await page.screenshot({ path: path.join(screenshotDir, 'competitor-detail-open.png'), fullPage: true });

  await page.getByRole('dialog', { name: '竞品详情' }).getByRole('button', { name: '关闭' }).click();
  await page.getByRole('dialog', { name: '竞品详情' }).waitFor({ state: 'detached', timeout: 10000 });
  await page.screenshot({ path: path.join(screenshotDir, 'selection-after-close.png'), fullPage: true });

  console.log(JSON.stringify({
    ok: true,
    screenshotDir,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}
