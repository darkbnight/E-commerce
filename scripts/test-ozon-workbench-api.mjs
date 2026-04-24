import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ozon-workbench-api-'));
const tempDbPath = path.join(tempDir, 'ecommerce-workbench.sqlite');
process.env.ECOMMERCE_WORKBENCH_DB_PATH = tempDbPath;

const { startWorkbenchServer } = await import('../backend/menglar-workbench-api/server.mjs');
const { OzonSellerClient } = await import('./lib/ozon-seller-client.mjs');

const requests = {
  uploadCalls: [],
  priceCalls: [],
  stockCalls: [],
  categoryTreeLanguages: [],
  categoryAttributeLanguages: [],
  attributeValueLanguages: [],
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

  if (req.url === '/v1/description-category/attribute') {
    requests.categoryAttributeLanguages.push(body.language);
    res.end(JSON.stringify({
      result: [
        {
          description_category_id: body.description_category_id,
          type_id: body.type_id,
          attributes: [{ id: 85, name: 'Brand', is_required: true, dictionary_id: 0 }],
        },
      ],
    }));
    return;
  }

  if (req.url === '/v1/description-category/attribute/values') {
    requests.attributeValueLanguages.push(body.language);
    res.end(JSON.stringify({ result: [{ id: 1, value: 'Generic' }], has_next: false }));
    return;
  }

  if (req.url === '/v1/description-category/tree') {
    requests.categoryTreeLanguages.push(body.language);
    res.end(JSON.stringify({ result: [{ description_category_id: 17031663, type_id: 100001234, title: 'Cleaning cloth' }] }));
    return;
  }

  if (req.url === '/v4/product/info/attributes') {
    res.end(JSON.stringify({
      result: {
        items: [
          {
            id: 10001,
            offer_id: 'SKU-001',
            name: 'Cleaning Cloth 30x40 2 pcs',
            description_category_id: 17031663,
            type_id: 100001234,
            attributes: [
              {
                id: 85,
                complex_id: 0,
                values: [{ dictionary_value_id: 1, value: 'Generic' }],
              },
            ],
          },
        ],
        last_id: '',
        total: 1,
      },
    }));
    return;
  }

  if (req.url === '/v3/product/info/list') {
    res.end(JSON.stringify({
      result: {
        items: [
          {
            id: 10001,
            offer_id: 'SKU-001',
            price: '199',
            currency_code: 'CNY',
            vat: '0',
          },
        ],
      },
    }));
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
    attributes: [{ id: 85, complex_id: 0, values: [{ value: 'Generic' }] }],
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

  response = await fetch(`${workbenchBaseUrl}/api/ozon/category-tree`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(demoCredentials),
  });
  payload = await readJson(response);
  assert.equal(payload.result[0].description_category_id, 17031663);
  assert.equal(payload.result[0].type_id, 100001234);
  assert.equal(requests.categoryTreeLanguages.at(-1), 'ZH_HANS');

  response = await fetch(`${workbenchBaseUrl}/api/ozon/category-attributes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ descriptionCategoryId: 17031663, typeId: 100001234, ...demoCredentials }),
  });
  payload = await readJson(response);
  assert.equal(payload.result[0].attributes[0].id, 85);
  assert.equal(requests.categoryAttributeLanguages.at(-1), 'ZH_HANS');

  response = await fetch(`${workbenchBaseUrl}/api/ozon/attribute-values`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ descriptionCategoryId: 17031663, typeId: 100001234, attributeId: 85, ...demoCredentials }),
  });
  payload = await readJson(response);
  assert.equal(payload.result[0].value, 'Generic');
  assert.equal(requests.attributeValueLanguages.at(-1), 'ZH_HANS');

  response = await fetch(`${workbenchBaseUrl}/api/product-data-prep/candidates?limit=1`);
  payload = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(Array.isArray(payload.items), true);
  assert.equal(payload.items.length <= 1, true);
  assert.equal(['db/ecommerce-workbench.sqlite', 'module-mock-fallback'].includes(payload.meta.source), true);
  assert.equal(payload.items.length, 1);

  const candidate = payload.items[0];

  response = await fetch(`${workbenchBaseUrl}/api/product-data-prep/drafts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidateId: candidate.id }),
  });
  payload = await readJson(response);
  assert.equal(response.status, 201);
  assert.ok(payload.item.id);
  assert.equal(payload.item.sourceJobId, candidate.sourceJobId);
  const draftId = payload.item.id;

  response = await fetch(`${workbenchBaseUrl}/api/product-data-prep/drafts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidateId: candidate.id }),
  });
  payload = await readJson(response);
  assert.equal(response.status, 201);
  assert.equal(payload.item.id, draftId);

  response = await fetch(`${workbenchBaseUrl}/api/product-data-prep/drafts/${draftId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      offerId: '',
      name: 'Incomplete draft',
      price: '',
      images: [],
      attributes: [],
      draftStatus: 'ready',
      resultStatus: 'ready',
    }),
  });
  payload = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(payload.item.resultStatus, 'invalid');
  assert.equal(payload.issues.some((issue) => issue.field === 'images' && issue.level === 'error'), true);
  assert.equal(payload.issues.some((issue) => issue.field === 'attributes' && issue.level === 'error'), true);

  const readyDraftPatch = {
    offerId: 'SKU-TEST-READY',
    name: 'Ready Draft Test',
    description: 'Reusable cleaning cloth for validation coverage.',
    descriptionCategoryId: 17031663,
    typeId: 100001234,
    vendor: 'Generic',
    modelName: 'RD-30X40',
    barcode: '2000000000099',
    price: '199',
    oldPrice: '259',
    premiumPrice: '189',
    minPrice: '179',
    currencyCode: 'CNY',
    vat: '0',
    packageDepthMm: 30,
    packageWidthMm: 200,
    packageHeightMm: 300,
    packageWeightG: 120,
    warehouseId: '123456789',
    stock: 12,
    images: [{ url: 'https://cdn.ozon.test/cloth-main.jpg', sortOrder: 1, isMain: true }],
    attributes: [{ attributeId: 85, complexId: 0, values: [{ value: 'Generic' }] }],
    draftStatus: 'ready',
    resultStatus: 'ready',
  };

  response = await fetch(`${workbenchBaseUrl}/api/product-data-prep/drafts/${draftId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(readyDraftPatch),
  });
  payload = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(payload.item.resultStatus, 'ready');
  assert.equal(payload.issues.some((issue) => issue.level === 'error'), false);
  assert.equal(payload.ozonImportItem.offer_id, 'SKU-TEST-READY');
  assert.equal(payload.ozonImportItem.attributes[0].id, 85);

  const db = new DatabaseSync(tempDbPath, { open: true });
  try {
    const row = db.prepare(`
      SELECT offer_id, result_status, images_json, attributes_json, raw_draft_json, ozon_import_item_json
      FROM product_content_result
      WHERE id = ?
    `).get(draftId);
    assert.equal(row.offer_id, 'SKU-TEST-READY');
    assert.equal(row.result_status, 'ready');
    assert.equal(JSON.parse(row.raw_draft_json).warehouseId, '123456789');
    assert.equal(JSON.parse(row.images_json)[0].url, 'https://cdn.ozon.test/cloth-main.jpg');
    assert.equal(JSON.parse(row.attributes_json)[0].attributeId, 85);
    assert.equal(JSON.parse(row.ozon_import_item_json).offer_id, 'SKU-TEST-READY');
  } finally {
    db.close();
  }

  response = await fetch(`${workbenchBaseUrl}/api/product-data-prep/drafts/${draftId}`);
  payload = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(payload.item.offerId, 'SKU-TEST-READY');

  response = await fetch(`${workbenchBaseUrl}/api/product-data-prep/drafts/${draftId}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  payload = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.suggestedStatus, 'ready');
  assert.equal(payload.item.resultStatus, 'ready');

  response = await fetch(`${workbenchBaseUrl}/api/product-data-prep/drafts?draftStatus=ready&limit=50`);
  payload = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(payload.items.some((item) => item.id === draftId), true);

  console.log('ozon-workbench-api 测试通过');
  const ozonClient = new OzonSellerClient({ ...demoCredentials });
  payload = await ozonClient.getProductInfoAttributes({
    filter: { visibility: 'ALL' },
    limit: 1,
  });
  assert.equal(payload.result.items[0].attributes[0].values[0].dictionary_value_id, 1);

  payload = await ozonClient.getProductInfoList({ productIds: [10001] });
  assert.equal(payload.result.items[0].offer_id, 'SKU-001');

} finally {
  await new Promise((resolve) => workbench.close(resolve));
  await new Promise((resolve) => ozonMock.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}
