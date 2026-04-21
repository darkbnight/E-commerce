import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { startWorkbenchServer } from '../backend/menglar-workbench-api/server.mjs';

const requests = {
  uploadCalls: [],
  priceCalls: [],
  stockCalls: [],
};

async function readJson(response) {
  return response.json();
}

const ozonMock = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const body = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};

  res.setHeader('content-type', 'application/json; charset=utf-8');

  if (req.url === '/v2/product/import') {
    requests.uploadCalls.push(body.items.length);
    res.end(JSON.stringify({ result: { task_id: requests.uploadCalls.length * 1000 } }));
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

  if (req.url === '/v1/product/import/info') {
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

  if (req.url === '/v2/category/tree') {
    res.end(JSON.stringify({ result: [{ description_category_id: 17031663, title: 'Cleaning cloth' }] }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not found' }));
});

await new Promise((resolve) => ozonMock.listen(0, '127.0.0.1', resolve));
const ozonAddress = ozonMock.address();
const ozonBaseUrl = `http://${ozonAddress.address}:${ozonAddress.port}`;

const workbench = await startWorkbenchServer({ port: 0, host: '127.0.0.1' });
const workbenchAddress = workbench.address();
const workbenchBaseUrl = `http://${workbenchAddress.address}:${workbenchAddress.port}`;

const demoCredentials = {
  clientId: 'demo-client',
  apiKey: 'demo-key',
  baseUrl: ozonBaseUrl,
};

const productPayload = {
  items: Array.from({ length: 101 }, (_, index) => ({
    offer_id: `SKU-${String(index + 1).padStart(3, '0')}`,
    name: 'Cleaning Cloth 30x40 2 pcs',
    description: 'Reusable cleaning cloth',
    category_id: 17031663,
    price: '199',
    vat: '0',
    images: ['https://example.com/1.jpg'],
    attributes: [{ id: 85, values: [{ value: 'Generic' }] }],
  })),
};

const pricesPayload = {
  items: [{ offer_id: 'SKU-001', price: '199' }],
};

const stocksPayload = {
  items: [{ offer_id: 'SKU-001', warehouse_id: 1, stock: 12 }],
};

try {
  let response = await fetch(`${workbenchBaseUrl}/api/ozon/template?kind=products`);
  assert.equal(response.status, 200);
  let payload = await readJson(response);
  assert.equal(payload.items[0].offer_id, 'CLOTH-30X40-2PK-GREY');

  response = await fetch(`${workbenchBaseUrl}/api/ozon/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'products', payload: { items: [productPayload.items[0]] } }),
  });
  payload = await readJson(response);
  assert.equal(payload.ok, true);

  response = await fetch(`${workbenchBaseUrl}/api/ozon/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'upload', payload: productPayload, dryRun: true }),
  });
  payload = await readJson(response);
  assert.equal(payload.result.batchCount, 2);
  assert.deepEqual(requests.uploadCalls, []);

  response = await fetch(`${workbenchBaseUrl}/api/ozon/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'upload', payload: productPayload, dryRun: false, ...demoCredentials }),
  });
  payload = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(payload.result.batchCount, 2);
  assert.deepEqual(requests.uploadCalls, [100, 1]);

  response = await fetch(`${workbenchBaseUrl}/api/ozon/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'prices', payload: pricesPayload, ...demoCredentials }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(requests.priceCalls, [1]);

  response = await fetch(`${workbenchBaseUrl}/api/ozon/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'stocks', payload: stocksPayload, ...demoCredentials }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(requests.stockCalls, [1]);

  response = await fetch(`${workbenchBaseUrl}/api/ozon/import-info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 1000, ...demoCredentials }),
  });
  payload = await readJson(response);
  assert.equal(payload.result.status, 'imported');

  response = await fetch(`${workbenchBaseUrl}/api/ozon/category-attributes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categoryId: 17031663, ...demoCredentials }),
  });
  payload = await readJson(response);
  assert.equal(payload.result[0].attributes[0].id, 85);

  response = await fetch(`${workbenchBaseUrl}/api/ozon/attribute-values`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categoryId: 17031663, attributeId: 85, ...demoCredentials }),
  });
  payload = await readJson(response);
  assert.equal(payload.result[0].value, 'Generic');

  console.log('ozon-workbench-api 测试通过');
} finally {
  await new Promise((resolve) => workbench.close(resolve));
  await new Promise((resolve) => ozonMock.close(resolve));
}
