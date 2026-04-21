import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startWorkbenchServer } from '../backend/menglar-workbench-api/server.mjs';

const screenshotDir = path.resolve('docs', '测试文档', 'Ozon官方物流费用规则引擎', 'UI');
await mkdir(screenshotDir, { recursive: true });

const server = await startWorkbenchServer({ port: 0, host: '127.0.0.1' });
const address = server.address();
const baseUrl = `http://${address.address}:${address.port}`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

try {
  await page.goto(`${baseUrl}/shipping-calculator`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(screenshotDir, 'shipping-calculator-input.png'), fullPage: true });

  await page.route('**/api/shipping/compare', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });

  const successResponse = page.waitForResponse((response) =>
    response.url().includes('/api/shipping/compare') && response.request().method() === 'POST' && response.status() === 200,
  );
  await page.getByRole('button', { name: '计算' }).click();
  await page.waitForSelector('[data-testid="shipping-loading"]');
  await page.screenshot({ path: path.join(screenshotDir, 'shipping-calculator-loading.png'), fullPage: true });
  await successResponse;
  await page.waitForSelector('[data-testid="shipping-result"]');
  await page.screenshot({ path: path.join(screenshotDir, 'shipping-calculator-result.png'), fullPage: true });

  const resultText = await page.locator('[data-testid="shipping-result"]').textContent();
  assert.match(resultText || '', /China Post to PUDO Economy/);
  assert.match(resultText || '', /CEL Economy Extra Small/);
  assert.match(resultText || '', /13-20 天/);
  assert.match(resultText || '', /4.42/);

  await page.getByRole('button', { name: '价格从高到低' }).click();
  await page.waitForTimeout(200);
  const sortedText = await page.locator('[data-testid="shipping-result"]').textContent();
  assert.ok((sortedText || '').indexOf('CEL Standard Small') < (sortedText || '').indexOf('China Post to PUDO Economy'));

  const numberInputs = page.locator('input[type="number"]');
  await numberInputs.nth(1).fill('100');
  await page.getByRole('button', { name: '计算' }).click();
  await page.waitForSelector('text=当前输入没有匹配到可用服务。');
  await page.screenshot({ path: path.join(screenshotDir, 'shipping-calculator-error.png'), fullPage: true });
  const emptyText = await page.locator('[data-testid="shipping-result"]').textContent();
  assert.match(emptyText || '', /当前输入没有匹配到可用服务/);

  console.log('shipping-page 测试通过');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
