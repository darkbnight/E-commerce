import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startWorkbenchServer } from '../../backend/menglar-workbench-api/server.mjs';

const screenshotDir = path.resolve('docs', '测试文档', 'Ozon本地快速定价前端化', 'UI');
await mkdir(screenshotDir, { recursive: true });

const server = await startWorkbenchServer({ port: 0, host: '127.0.0.1' });
const address = server.address();
const baseUrl = `http://${address.address}:${address.port}`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

try {
  await page.goto(`${baseUrl}/ozon-pricing`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Ozon 快速定价');
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('select option')).some((option) =>
      /China Post|CEL|Economy|Standard/.test(option.textContent || ''),
    ),
  );
  await page.screenshot({ path: path.join(screenshotDir, 'ozon-pricing-default.png'), fullPage: true });

  const originalSale = await page.locator('.ozon-pricing-price-grid .ozon-pricing-metric').nth(1).textContent();
  const shippingResponse = page.waitForResponse((response) => response.url().includes('/api/shipping/compare') && response.status() === 200);
  await page.getByTestId('ozon-pricing-purchase-cost').fill('20');
  await page.getByTestId('ozon-pricing-weight').fill('500');
  await page.getByTestId('ozon-pricing-discount').fill('60');
  await shippingResponse;
  const changedSale = await page.locator('.ozon-pricing-price-grid .ozon-pricing-metric').nth(1).textContent();
  assert.notEqual(changedSale, originalSale);
  assert.match(changedSale || '', /₽/);
  assert.match(changedSale || '', /¥/);
  await page.screenshot({ path: path.join(screenshotDir, 'ozon-pricing-result.png'), fullPage: true });

  await page.getByRole('button', { name: '查看物流费用对比' }).click();
  await page.waitForSelector('text=物流费用对比');
  const compareText = await page.locator('.ozon-pricing-dialog').textContent();
  assert.match(compareText || '', /物流计算器结果/);
  assert.match(compareText || '', /计费重/);
  await page.screenshot({ path: path.join(screenshotDir, 'ozon-pricing-compare.png'), fullPage: true });

  console.log('Ozon pricing page e2e passed');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
