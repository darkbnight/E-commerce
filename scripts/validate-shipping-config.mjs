import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const rulesPath = path.join(root, 'config', 'shipping', 'rules.json');
const fxPath = path.join(root, 'config', 'shipping', 'fx.json');

const rules = JSON.parse(readFileSync(rulesPath, 'utf8'));
const fx = JSON.parse(readFileSync(fxPath, 'utf8'));

assert.ok(rules.meta, 'rules.meta 缺失');
assert.ok(Array.isArray(rules.methods) && rules.methods.length > 0, 'rules.methods 不能为空');
assert.ok(fx.rates && typeof fx.rates === 'object', 'fx.rates 缺失');

for (const method of rules.methods) {
  assert.ok(method.carrierCode, 'method.carrierCode 缺失');
  assert.ok(method.deliveryMethodCode, 'method.deliveryMethodCode 缺失');
  assert.ok(method.originCountry, 'method.originCountry 缺失');
  assert.ok(method.warehouseType, 'method.warehouseType 缺失');
  assert.ok(method.salesScheme, 'method.salesScheme 缺失');
  assert.ok(Number.isFinite(Number(method.fixedFee)), `${method.deliveryMethodCode} fixedFee 非法`);
  assert.ok(Number.isFinite(Number(method.incrementUnitG)), `${method.deliveryMethodCode} incrementUnitG 非法`);
  assert.ok(Number.isFinite(Number(method.incrementFee)), `${method.deliveryMethodCode} incrementFee 非法`);
  assert.ok(Number.isFinite(Number(method.includedWeightG)), `${method.deliveryMethodCode} includedWeightG 非法`);
  assert.ok(method.constraints && typeof method.constraints === 'object', `${method.deliveryMethodCode} constraints 缺失`);
}

console.log('shipping-config 校验通过');
