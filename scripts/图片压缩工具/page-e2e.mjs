import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

process.env.ECOMMERCE_WORKBENCH_DB_PATH = path.join(import.meta.dirname, '..', '..', 'temp', 'image-compression-e2e.sqlite');

const { startWorkbenchServer } = await import('../../backend/menglar-workbench-api/server.mjs');

const root = path.resolve(import.meta.dirname, '..', '..');
const fixtureDir = path.join(root, 'temp', 'image-compression-page-test');
const screenshotDir = path.join(root, 'docs', '测试文档', '图片压缩工具', 'UI');
const childDir = path.join(fixtureDir, 'product-a');

await rm(fixtureDir, { recursive: true, force: true });
await mkdir(childDir, { recursive: true });
await mkdir(screenshotDir, { recursive: true });
await writeFile(path.join(childDir, 'sample.bmp'), createFixtureBmp());

const server = await startWorkbenchServer({ port: 0 });
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  await page.goto(`${baseUrl}/image-compression`);
  await page.getByText('图片压缩成 JPG').waitFor();
  await page.getByText('PNG / JPG / JPEG / WEBP / BMP').waitFor();
  await page.getByText('默认质量：4').waitFor();
  await page.screenshot({ path: path.join(screenshotDir, 'image-compression-input.png'), fullPage: true });

  await page.getByLabel('图片目录（每行一个）').fill(childDir);
  await page.getByRole('button', { name: '开始压缩' }).click();
  await page.getByText('输出目录').waitFor();
  await page.getByText('目录数量', { exact: true }).waitFor();
  await page.getByText('sample.bmp').waitFor();
  await page.screenshot({ path: path.join(screenshotDir, 'image-compression-result.png'), fullPage: true });

  await page.getByLabel('图片目录（每行一个）').fill(path.join(fixtureDir, 'missing'));
  await page.getByRole('button', { name: '开始压缩' }).click();
  await page.getByText('目录不存在或不是文件夹').waitFor();
  await page.screenshot({ path: path.join(screenshotDir, 'image-compression-error.png'), fullPage: true });

  console.log(JSON.stringify({
    ok: true,
    url: `${baseUrl}/image-compression`,
    screenshotDir,
    screenshots: [
      'image-compression-input.png',
      'image-compression-result.png',
      'image-compression-error.png',
    ],
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(fixtureDir, { recursive: true, force: true });
  await rm(process.env.ECOMMERCE_WORKBENCH_DB_PATH, { force: true });
}

function createFixtureBmp() {
  const buffer = Buffer.alloc(70);
  buffer.write('BM', 0);
  buffer.writeUInt32LE(70, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(2, 18);
  buffer.writeInt32LE(2, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(16, 34);

  const pixels = [
    255, 0, 0, 0, 255, 0, 0, 0,
    0, 0, 255, 255, 255, 255, 0, 0,
  ];
  Buffer.from(pixels).copy(buffer, 54);
  return buffer;
}
