import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  calculatePricing,
  defaultPricingForm,
  normalizeInitialForm,
} from '../../frontend/menglar-workbench/src/modules/ozon-pricing/pricingCalculator.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = path.join(root, 'frontend/menglar-workbench/src/modules/ozon-pricing/data');

const [logisticsData, categoryRatesData, exchangeRatesData] = await Promise.all([
  readJson(path.join(dataDir, 'logistics.json')),
  readJson(path.join(dataDir, 'categoryRates.json')),
  readJson(path.join(dataDir, 'exchangeRates.json')),
]);

const logistics = logisticsData.items || [];
const categoryRates = categoryRatesData.items || [];
const exchangeRates = exchangeRatesData.items || [];
const baseForm = normalizeInitialForm(defaultPricingForm, categoryRates, logistics);

testDefaultPricing();
testShippingCalculatorQuote();
testManualOverrides();
testInvalidRateBoundary();

console.log('Ozon pricing calculator tests passed');

function testDefaultPricing() {
  const result = calculatePricing({ form: baseForm, logistics, categoryRates, exchangeRates });
  assert.equal(result.ok, true);
  assert.ok(Number.isFinite(result.salePriceUsd) && result.salePriceUsd > 0);
  assert.ok(Number.isFinite(result.salePriceRub) && result.salePriceRub > 0);
  assert.ok(Number.isFinite(result.profit));
  assert.ok(Number.isFinite(result.totalCost) && result.totalCost > 0);
  assert.ok(Number.isFinite(result.actualProfitRate));
  assert.equal(result.totalLogisticsShare, result.domesticLogisticsShare + result.crossBorderLogisticsShare);
  assert.ok(result.logistics.charged > 0);
}

function testShippingCalculatorQuote() {
  const shippingQuote = {
    name: 'China Post to PUDO Economy',
    feeRmb: 12.34,
    chargeableWeightG: 500,
    physicalWeightG: 480,
    volumetricWeightG: 120,
    incrementUnitG: 50,
  };
  const result = calculatePricing({ form: baseForm, logistics, categoryRates, exchangeRates, shippingQuote });
  assert.equal(result.ok, true);
  assert.equal(result.logisticsFee, 12.34);
  assert.equal(result.logistics.charged, 500);
  assert.equal(result.shippingQuote.name, 'China Post to PUDO Economy');
}

function testManualOverrides() {
  const form = {
    ...baseForm,
    manualLogisticsFee: '9.99',
    manualCategoryRate: '6.5',
  };
  const result = calculatePricing({ form, logistics, categoryRates, exchangeRates });
  assert.equal(result.ok, true);
  assert.equal(result.logisticsFee, 9.99);
  assert.equal(result.categoryRate, 0.065);
}

function testInvalidRateBoundary() {
  const form = {
    ...baseForm,
    profitType: 'rate',
    profitVal: '98',
    adsRate: '50',
    cashRate: '20',
    refundRate: '20',
  };
  const result = calculatePricing({ form, logistics, categoryRates, exchangeRates });
  assert.equal(result.ok, true);
  assert.equal(result.salePriceRmb, 0);
  assert.ok(result.warnings.length > 0);
  assert.ok(Number.isFinite(result.profit));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}
