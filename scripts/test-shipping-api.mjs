import assert from 'node:assert/strict';
import { copyFile, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startWorkbenchServer } from '../backend/menglar-workbench-api/server.mjs';

const root = path.resolve(import.meta.dirname, '..');
const rulesPath = path.join(root, 'config', 'shipping', 'rules.json');
const rulesBackupPath = path.join(root, 'config', 'shipping', 'rules.test-backup.json');

async function readJson(response) {
  return response.json();
}

const server = await startWorkbenchServer({ port: 0, host: '127.0.0.1' });
const address = server.address();
const baseUrl = `http://${address.address}:${address.port}`;

const validPayload = {
  originCountry: 'CN',
  warehouseType: 'seller_warehouse',
  salesScheme: 'realFBS',
  carrierCode: 'CHINA_POST',
  deliveryMethodCode: 'CHINA_POST_TO_PUDO_ECONOMY',
  price: 1,
  lengthCm: 1,
  widthCm: 1,
  heightCm: 1,
  weightG: 50,
  orderDate: '2026-04-21',
};

try {
  let response = await fetch(`${baseUrl}/api/shipping/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validPayload),
  });
  let payload = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(payload.physicalWeightG, 50);
  assert.equal(payload.volumetricWeightG, 1);
  assert.equal(payload.chargeableWeightG, 50);
  assert.equal(payload.calculationMeta.exchangeRate.value, 11.08);
  assert.equal(payload.ruleMeta.displayName, 'China Post to PUDO Economy');
  assert.equal(payload.ruleMeta.deliveryDays.min, 13);
  assert.equal(payload.ruleMeta.deliveryDays.max, 20);
  assert.equal(payload.totalLogisticsCost, 3.2);

  response = await fetch(`${baseUrl}/api/shipping/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...validPayload,
      lengthCm: 100,
    }),
  });
  payload = await readJson(response);
  assert.equal(response.status, 400);
  assert.match(payload.error, /超出物流方法限制/);
  assert.match(payload.details.violations.join(','), /三边和超限|最长边超限/);

  response = await fetch(`${baseUrl}/api/shipping/calculate-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        validPayload,
        { ...validPayload, carrierCode: 'CEL', deliveryMethodCode: 'CEL_ECONOMY_EXTRA_SMALL_PUDO' },
        { ...validPayload, weightG: 40000 },
      ],
    }),
  });
  payload = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(payload.successCount, 2);
  assert.equal(payload.failedCount, 1);
  assert.equal(payload.items[0].result.totalLogisticsCost, 3.2);
  assert.equal(payload.items[1].result.totalLogisticsCost, 4.42);

  await copyFile(rulesPath, rulesBackupPath);
  const originalRules = JSON.parse(await readFile(rulesPath, 'utf8'));
  originalRules.methods[0].fixedFee = 4;
  await writeFile(rulesPath, JSON.stringify(originalRules, null, 2));

  response = await fetch(`${baseUrl}/api/shipping/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validPayload),
  });
  payload = await readJson(response);
  assert.equal(payload.carrierDeliveryCost, 4);
  assert.equal(payload.totalLogisticsCost, 4);

  await copyFile(rulesBackupPath, rulesPath);
  await rm(rulesBackupPath, { force: true });

  response = await fetch(`${baseUrl}/api/shipping/rule-info`);
  payload = await readJson(response);
  assert.equal(response.status, 200);
  assert.ok(payload.methodCount >= 2);

  response = await fetch(`${baseUrl}/api/shipping/methods`);
  payload = await readJson(response);
  assert.equal(response.status, 200);
  assert.ok(payload.methods.some((item) => item.deliveryMethodCode === 'CHINA_POST_TO_PUDO_ECONOMY'));

  response = await fetch(`${baseUrl}/api/shipping/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      originCountry: validPayload.originCountry,
      warehouseType: validPayload.warehouseType,
      salesScheme: validPayload.salesScheme,
      price: validPayload.price,
      lengthCm: validPayload.lengthCm,
      widthCm: validPayload.widthCm,
      heightCm: validPayload.heightCm,
      weightG: validPayload.weightG,
      orderDate: validPayload.orderDate,
    }),
  });
  payload = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(payload.items[0].service.displayName, 'China Post to PUDO Economy');
  assert.equal(payload.items[0].result.totalLogisticsCost, 3.2);
  assert.ok(payload.items.some((item) => item.service.displayName === 'CEL Economy Extra Small'));
  assert.ok(payload.items.some((item) => item.service.officialSubtitle === 'CEL Extra Small Economy PUDO'));

  console.log('shipping-api 测试通过');
} finally {
  try {
    const backup = await readFile(rulesBackupPath, 'utf8');
    await writeFile(rulesPath, backup);
    await rm(rulesBackupPath, { force: true });
  } catch {}
  await new Promise((resolve) => server.close(resolve));
}
