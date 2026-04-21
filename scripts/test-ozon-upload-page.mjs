import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startWorkbenchServer } from '../backend/menglar-workbench-api/server.mjs';

const screenshotDir = path.resolve('docs', '测试文档', 'Ozon批量上货工作台', 'UI');
await mkdir(screenshotDir, { recursive: true });

const ozonMock = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const body = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};

  res.setHeader('content-type', 'application/json; charset=utf-8');

  if (req.url === '/v1/product/import/info') {
    await new Promise((resolve) => setTimeout(resolve, 700));
    res.end(JSON.stringify({ result: { task_id: body.task_id, status: 'imported' } }));
    return;
  }

  if (req.url === '/v3/category/attribute') {
    res.end(JSON.stringify({
      result: [
        {
          category_id: body.category_id[0],
          attributes: [{ id: 85, name: 'Brand', is_required: true, dictionary_id: 0 }],
        },
      ],
    }));
    return;
  }

  if (req.url === '/v2/category/attribute/values') {
    res.end(JSON.stringify({ result: [{ id: 1, value: 'Generic' }], has_next: false }));
    return;
  }

  res.end(JSON.stringify({ result: {} }));
});

await new Promise((resolve) => ozonMock.listen(0, '127.0.0.1', resolve));
const ozonAddress = ozonMock.address();
const ozonBaseUrl = `http://${ozonAddress.address}:${ozonAddress.port}`;

const workbench = await startWorkbenchServer({ port: 0, host: '127.0.0.1' });
const workbenchAddress = workbench.address();
const workbenchBaseUrl = `http://${workbenchAddress.address}:${workbenchAddress.port}`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

try {
  await page.goto(`${workbenchBaseUrl}/ozon-upload`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '打开连接配置' }).first().click();
  await page.locator('aside[aria-label="Ozon 连接配置"] input[placeholder="例如 123456"]').fill('demo-client');
  await page.locator('aside[aria-label="Ozon 连接配置"] input[placeholder="输入 Ozon Api Key"]').fill('demo-key');
  await page.locator('aside[aria-label="Ozon 连接配置"] input[placeholder="留空则使用 https://api-seller.ozon.ru"]').fill(ozonBaseUrl);
  await page.getByRole('button', { name: '保存到本机' }).click();
  await page.waitForSelector('text=连接配置已保存到本机浏览器');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=连接配置已就绪');
  await page.screenshot({ path: path.join(screenshotDir, 'ozon-upload-input.png'), fullPage: true });

  await page.getByRole('button', { name: '载入当前模板' }).click();
  await page.waitForSelector('textarea');
  await page.getByRole('button', { name: '本地校验' }).click();
  await page.waitForSelector('text=本地校验通过，可以继续 dry-run');

  await page.getByRole('button', { name: '仅模拟分片' }).click();
  await page.waitForSelector('text=模拟执行完成，未请求 Ozon');

  await page.fill('input[placeholder="例如 123456789"]', '1000');
  const taskPromise = page.waitForResponse((response) => response.url().includes('/api/ozon/import-info') && response.status() === 200);
  await page.getByRole('button', { name: '查询任务' }).click();
  await page.screenshot({ path: path.join(screenshotDir, 'ozon-upload-loading.png'), fullPage: true });
  await taskPromise;
  await page.waitForSelector('text=任务状态已更新');

  await page.fill('input[placeholder="例如 17031663"]', '17031663');
  await page.getByRole('button', { name: '查询类目属性' }).click();
  await page.waitForSelector('text=类目属性已返回，优先关注必填属性和字典属性');
  await page.screenshot({ path: path.join(screenshotDir, 'ozon-upload-result.png'), fullPage: true });

  await page.getByRole('button', { name: '展开原始返回' }).click();
  const resultText = await page.locator('.wb-pre').textContent();
  assert.match(resultText || '', /category_id|task_id|status|attributes/);

  console.log('ozon-upload-page 测试通过');
} finally {
  await browser.close();
  await new Promise((resolve) => workbench.close(resolve));
  await new Promise((resolve) => ozonMock.close(resolve));
}
