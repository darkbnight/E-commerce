import assert from 'node:assert/strict';
import { startWorkbenchServer } from '../backend/menglar-workbench-api/server.mjs';

async function readJson(response) {
  return response.json();
}

function baseComparePayload(overrides = {}) {
  return {
    originCountry: 'CN',
    warehouseType: 'seller_warehouse',
    salesScheme: 'realFBS',
    price: 1,
    lengthCm: 1,
    widthCm: 1,
    heightCm: 1,
    weightG: 50,
    orderDate: '2026-04-21',
    ...overrides,
  };
}

function findService(payload, displayName) {
  const item = payload.items.find((entry) => entry.service.displayName === displayName);
  assert.ok(item, `expected service: ${displayName}`);
  return item;
}

function hasService(payload, displayName) {
  return payload.items.some((entry) => entry.service.displayName === displayName);
}

const server = await startWorkbenchServer({ port: 0, host: '127.0.0.1' });
const address = server.address();
const baseUrl = `http://${address.address}:${address.port}`;

try {
  let response = await fetch(`${baseUrl}/api/shipping/rule-info`);
  let payload = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(payload.methodCount, 149);

  response = await fetch(`${baseUrl}/api/shipping/methods`);
  payload = await readJson(response);
  assert.equal(response.status, 200);
  assert.ok(payload.methods.some((item) => item.displayName === 'China Post to PUDO Economy'));
  assert.ok(payload.methods.some((item) => item.displayName === 'CEL Economy Extra Small'));
  assert.ok(payload.methods.some((item) => item.displayName === 'China Post eParcel Economy'));

  response = await fetch(`${baseUrl}/api/shipping/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(baseComparePayload()),
  });
  payload = await readJson(response);
  assert.equal(response.status, 200);
  assert.ok(payload.total > 0);
  assert.equal(payload.items[0].service.displayName, 'China Post to PUDO Economy');
  assert.equal(hasService(payload, 'GUOO Express Extra Small'), false);

  const chinaPostPudo = findService(payload, 'China Post to PUDO Economy');
  assert.equal(chinaPostPudo.result.totalLogisticsCost, 3.2);
  assert.equal(chinaPostPudo.service.variants[0].deliveryDays.min, 13);
  assert.equal(chinaPostPudo.service.variants[0].deliveryDays.max, 20);

  const guooExtraSmall = findService(payload, 'GUOO Economy Extra Small');
  assert.equal(guooExtraSmall.result.totalLogisticsCost, 4.3);
  assert.equal(guooExtraSmall.service.variants.length, 2);
  assert.ok(guooExtraSmall.service.variants.some((variant) => variant.officialName.includes('Courier')));
  assert.ok(guooExtraSmall.service.variants.some((variant) => variant.officialName.includes('PUDO')));

  const celExtraSmall = findService(payload, 'CEL Economy Extra Small');
  assert.equal(celExtraSmall.result.totalLogisticsCost, 4.42);
  assert.ok(celExtraSmall.service.variants.every((variant) => variant.deliveryDays.min === 20 && variant.deliveryDays.max === 25));

  response = await fetch(`${baseUrl}/api/shipping/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...baseComparePayload(),
      carrierCode: chinaPostPudo.service.carrierCode,
      deliveryMethodCode: chinaPostPudo.service.deliveryMethodCode,
    }),
  });
  payload = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(payload.physicalWeightG, 50);
  assert.equal(payload.volumetricWeightG, 1);
  assert.equal(payload.chargeableWeightG, 50);
  assert.equal(payload.calculationMeta.exchangeRate.value, 11.08);
  assert.equal(payload.ruleMeta.displayName, 'China Post to PUDO Economy');
  assert.equal(payload.totalLogisticsCost, 3.2);

  response = await fetch(`${baseUrl}/api/shipping/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...baseComparePayload({ lengthCm: 100 }),
      carrierCode: chinaPostPudo.service.carrierCode,
      deliveryMethodCode: chinaPostPudo.service.deliveryMethodCode,
    }),
  });
  payload = await readJson(response);
  assert.equal(response.status, 400);
  assert.match(payload.error, /限制|瓒呭嚭/);
  assert.ok(payload.details.violations.length > 0);

  response = await fetch(`${baseUrl}/api/shipping/calculate-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        {
          ...baseComparePayload(),
          carrierCode: chinaPostPudo.service.carrierCode,
          deliveryMethodCode: chinaPostPudo.service.deliveryMethodCode,
        },
        {
          ...baseComparePayload(),
          carrierCode: celExtraSmall.service.carrierCode,
          deliveryMethodCode: celExtraSmall.service.deliveryMethodCode,
        },
        {
          ...baseComparePayload({ weightG: 40000 }),
          carrierCode: celExtraSmall.service.carrierCode,
          deliveryMethodCode: celExtraSmall.service.deliveryMethodCode,
        },
      ],
    }),
  });
  payload = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(payload.successCount, 2);
  assert.equal(payload.failedCount, 1);
  assert.equal(payload.items[0].result.totalLogisticsCost, 3.2);
  assert.equal(payload.items[1].result.totalLogisticsCost, 4.42);

  response = await fetch(`${baseUrl}/api/shipping/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(baseComparePayload({ weightG: 500 })),
  });
  payload = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(payload.items[0].service.displayName, 'ATC Economy Extra Small');
  assert.equal(payload.items[0].result.totalLogisticsCost, 14.6);
  assert.equal(hasService(payload, 'GUOO Express Extra Small'), false);

  response = await fetch(`${baseUrl}/api/shipping/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(baseComparePayload({ weightG: 500, includeXlsxCandidates: true })),
  });
  payload = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(hasService(payload, 'GUOO Express Extra Small'), true);

  for (const [weightG, expectedService] of [
    [2000, 'China Post eParcel Economy'],
    [5000, 'GBS Economy Budget'],
  ]) {
    response = await fetch(`${baseUrl}/api/shipping/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseComparePayload({ weightG })),
    });
    payload = await readJson(response);
    assert.equal(response.status, 200);
    assert.ok(payload.total > 0, `expected available services for ${weightG}g`);
    findService(payload, expectedService);
  }

  response = await fetch(`${baseUrl}/api/shipping/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(baseComparePayload({ weightG: 5000 })),
  });
  payload = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(payload.items[0].service.displayName, 'GBS Economy Budget');
  assert.equal(payload.items[0].result.totalLogisticsCost, 107.4);
  assert.equal(hasService(payload, 'China Post eParcel Economy'), false);

  console.log('shipping-api 测试通过');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
