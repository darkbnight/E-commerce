import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const rulesPath = path.resolve(root, process.argv[2] || path.join('config', 'shipping', 'rules.json'));
const fxPath = path.join(root, 'config', 'shipping', 'fx.json');

const rules = JSON.parse(readFileSync(rulesPath, 'utf8'));
const fx = JSON.parse(readFileSync(fxPath, 'utf8'));

assert.ok(rules.meta, 'rules.meta 缺失');
assert.ok(Array.isArray(rules.methods) && rules.methods.length > 0, 'rules.methods 不能为空');
assert.ok(fx.rates && typeof fx.rates === 'object', 'fx.rates 缺失');

const seenCodes = new Set();
for (const method of rules.methods) {
  assert.ok(method.carrierCode, 'method.carrierCode 缺失');
  assert.ok(method.deliveryMethodCode, 'method.deliveryMethodCode 缺失');
  assert.ok(!seenCodes.has(method.deliveryMethodCode), `${method.deliveryMethodCode} 重复`);
  seenCodes.add(method.deliveryMethodCode);
  assert.ok(method.originCountry, `${method.deliveryMethodCode} originCountry 缺失`);
  assert.ok(method.warehouseType, `${method.deliveryMethodCode} warehouseType 缺失`);
  assert.ok(method.salesScheme, `${method.deliveryMethodCode} salesScheme 缺失`);
  assert.ok(Number.isFinite(Number(method.fixedFee)), `${method.deliveryMethodCode} fixedFee 非法`);
  assert.ok(Number.isFinite(Number(method.incrementUnitG)), `${method.deliveryMethodCode} incrementUnitG 非法`);
  assert.ok(Number.isFinite(Number(method.incrementFee)), `${method.deliveryMethodCode} incrementFee 非法`);
  assert.ok(Number.isFinite(Number(method.includedWeightG)), `${method.deliveryMethodCode} includedWeightG 非法`);
  assert.ok(method.constraints && typeof method.constraints === 'object', `${method.deliveryMethodCode} constraints 缺失`);
  if (method.variants != null) {
    assert.ok(Array.isArray(method.variants), `${method.deliveryMethodCode} variants 必须是数组`);
    for (const variant of method.variants) {
      assert.ok(variant.variantCode, `${method.deliveryMethodCode} variantCode 缺失`);
      assert.ok(variant.officialName, `${method.deliveryMethodCode} variant officialName 缺失`);
      assert.ok(variant.deliveryTarget, `${method.deliveryMethodCode} variant deliveryTarget 缺失`);
      assert.ok(variant.deliveryDays && Number.isFinite(Number(variant.deliveryDays.min)), `${method.deliveryMethodCode} variant deliveryDays.min 非法`);
      assert.ok(Number.isFinite(Number(variant.deliveryDays.max)), `${method.deliveryMethodCode} variant deliveryDays.max 非法`);
    }
  }
}

console.log(`shipping-config 校验通过: ${path.relative(root, rulesPath)}`);
