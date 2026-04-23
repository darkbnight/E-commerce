import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startWorkbenchServer } from '../backend/menglar-workbench-api/server.mjs';

const port = Number(process.env.TEST_PORT || 4201);
const server = await startWorkbenchServer({ port });
let browser;

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`http://127.0.0.1:${port}/results`, { waitUntil: 'networkidle' });

  await expectText(page, '商品结果');
  await expectText(page, '平台商品ID');
  await expectText(page, '销售量');
  await expectText(page, '销售金额');
  await expectText(page, 'ozon');
  await expectText(page, '将当前页加入筛选池');

  await page.getByRole('button', { name: '将当前页加入筛选池' }).click();
  await page.getByRole('button', { name: '商品筛选' }).click();
  await expectText(page, '标为候选');

  console.log(JSON.stringify({
    ok: true,
    url: page.url(),
    firstProductVisible: true,
    screeningPoolVisible: true,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

async function expectText(page, text) {
  const locator = page.getByText(text).first();
  await locator.waitFor({ timeout: 10000 });
  assert.ok(await locator.isVisible(), `${text} should be visible`);
}
