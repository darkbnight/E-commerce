import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { main } from './ozon-batch-tool.mjs';

async function captureRun(args, env) {
  const originalLog = console.log;
  const originalError = console.error;
  const originalEnv = {
    OZON_CLIENT_ID: process.env.OZON_CLIENT_ID,
    OZON_API_KEY: process.env.OZON_API_KEY,
    OZON_BASE_URL: process.env.OZON_BASE_URL,
  };

  let stdout = '';
  let stderr = '';

  console.log = (...values) => {
    stdout += `${values.join(' ')}\n`;
  };
  console.error = (...values) => {
    stderr += `${values.join(' ')}\n`;
  };

  Object.assign(process.env, env);

  try {
    const code = await main(args);
    return { code, stdout, stderr };
  } finally {
    console.log = originalLog;
    console.error = originalError;

    process.env.OZON_CLIENT_ID = originalEnv.OZON_CLIENT_ID;
    process.env.OZON_API_KEY = originalEnv.OZON_API_KEY;
    process.env.OZON_BASE_URL = originalEnv.OZON_BASE_URL;
  }
}

const requests = {
  uploadCalls: [],
  priceCalls: [],
  stockCalls: [],
};

const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const body = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};

  res.setHeader('content-type', 'application/json; charset=utf-8');

  if (req.url === '/v2/product/import') {
    requests.uploadCalls.push(body.items.length);
    res.end(JSON.stringify({
      result: {
        task_id: requests.uploadCalls.length * 1000,
        accepted: body.items.length,
      }
    }));
    return;
  }

  if (req.url === '/v1/product/import/info') {
    res.end(JSON.stringify({
      result: {
        task_id: body.task_id,
        status: 'imported',
      }
    }));
    return;
  }

  if (req.url === '/v1/description-category/attribute') {
    res.end(JSON.stringify({
      result: [
        {
          description_category_id: body.description_category_id,
          type_id: body.type_id,
          attributes: [
            { id: 85, name: 'Brand', is_required: true, dictionary_id: 0 }
          ]
        }
      ]
    }));
    return;
  }

  if (req.url === '/v1/description-category/attribute/values') {
    res.end(JSON.stringify({
      result: [
        { id: 1, value: 'Generic' }
      ],
      has_next: false
    }));
    return;
  }

  if (req.url === '/v1/description-category/tree') {
    res.end(JSON.stringify({
      result: [{ description_category_id: 17031663, type_id: 100001234, title: 'Cleaning cloth' }]
    }));
    return;
  }

  if (req.url === '/v1/product/import/prices') {
    requests.priceCalls.push(body.prices.length);
    res.end(JSON.stringify({ result: { updated: body.prices.length } }));
    return;
  }

  if (req.url === '/v2/products/stocks') {
    requests.stockCalls.push(body.stocks.length);
    res.end(JSON.stringify({ result: { updated: body.stocks.length } }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ message: 'not found' }));
});

await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', resolve);
});

const address = server.address();
const baseUrl = `http://${address.address}:${address.port}`;
const tempDir = await mkdtemp(path.join(tmpdir(), 'ozon-batch-tool-'));

try {
  const templatePath = path.join(tempDir, 'products.example.json');
  const reportPath = path.join(tempDir, 'upload-report.json');
  const productsPath = path.join(tempDir, 'products.101.json');
  const pricesPath = path.join(tempDir, 'prices.json');
  const stocksPath = path.join(tempDir, 'stocks.json');

  const env = {
    OZON_CLIENT_ID: 'demo-client',
    OZON_API_KEY: 'demo-key',
    OZON_BASE_URL: baseUrl,
  };

  let result = await captureRun(['template', '--output', templatePath], env);
  assert.equal(result.code, 0, result.stderr);

  result = await captureRun(['validate', '--input', templatePath], env);
  assert.equal(result.code, 0, result.stderr);
  const validatePayload = JSON.parse(result.stdout);
  assert.equal(validatePayload.ok, true);

  const validProduct = {
    offer_id: 'SKU-001',
    name: 'Cleaning Cloth 30x40 2 pcs',
    description: 'Reusable cleaning cloth',
    description_category_id: 17031663,
    type_id: 100001234,
    price: '199',
    vat: '0',
    depth: 30,
    width: 200,
    height: 300,
    dimension_unit: 'mm',
    weight: 120,
    weight_unit: 'g',
    images: ['https://example.com/1.jpg'],
    attributes: [
      {
        id: 85,
        complex_id: 0,
        values: [{ value: 'Generic' }]
      }
    ]
  };

  const productItems = Array.from({ length: 101 }, (_, index) => ({
    ...validProduct,
    offer_id: `SKU-${String(index + 1).padStart(3, '0')}`,
  }));

  await writeFile(productsPath, `${JSON.stringify({ items: productItems }, null, 2)}\n`, 'utf8');
  await writeFile(pricesPath, `${JSON.stringify({ items: [{ offer_id: 'SKU-001', price: '199' }] }, null, 2)}\n`, 'utf8');
  await writeFile(stocksPath, `${JSON.stringify({ items: [{ offer_id: 'SKU-001', warehouse_id: 1, stock: 10 }] }, null, 2)}\n`, 'utf8');

  result = await captureRun([
    'upload',
    '--input',
    productsPath,
    '--report',
    reportPath,
  ], env);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(requests.uploadCalls, [100, 1]);
  const reportPayload = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(reportPayload.result.batchCount, 2);

  result = await captureRun([
    'import-info',
    '--task-id',
    '1000',
  ], env);
  assert.equal(result.code, 0, result.stderr);
  const importInfoPayload = JSON.parse(result.stdout);
  assert.equal(importInfoPayload.result.status, 'imported');

  result = await captureRun([
    'category-attributes',
    '--description-category-id',
    '17031663',
    '--type-id',
    '100001234',
  ], env);
  assert.equal(result.code, 0, result.stderr);

  result = await captureRun([
    'prices',
    '--input',
    pricesPath,
  ], env);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(requests.priceCalls, [1]);

  result = await captureRun([
    'stocks',
    '--input',
    stocksPath,
  ], env);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(requests.stockCalls, [1]);

  console.log('ozon-batch-tool 测试通过');
} finally {
  server.close();
  await rm(tempDir, { recursive: true, force: true });
}
