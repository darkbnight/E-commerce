import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SHIPPING_CONFIG_DIR = path.join(ROOT, 'config', 'shipping');
const RULES_PATH = path.join(SHIPPING_CONFIG_DIR, 'rules.json');
const FX_PATH = path.join(SHIPPING_CONFIG_DIR, 'fx.json');

function readJsonFile(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeString(value) {
  return String(value ?? '').trim();
}

function parsePositiveNumber(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw createInputError(`字段 ${fieldName} 必须是大于等于 0 的数字`);
  }
  return number;
}

function parseRequiredString(value, fieldName) {
  const text = normalizeString(value);
  if (!text) {
    throw createInputError(`字段 ${fieldName} 不能为空`);
  }
  return text;
}

function parseOrderDate(value) {
  const text = parseRequiredString(value, 'orderDate');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw createInputError('字段 orderDate 必须是 YYYY-MM-DD 格式');
  }
  return text;
}

function createInputError(message, details = null) {
  const error = new Error(message);
  error.status = 400;
  error.details = details;
  return error;
}

function getRules() {
  const payload = readJsonFile(RULES_PATH);
  if (!payload || !Array.isArray(payload.methods)) {
    throw new Error('rules.json 结构无效');
  }
  return payload;
}

function getFxConfig() {
  const payload = readJsonFile(FX_PATH);
  if (!payload || typeof payload !== 'object' || !payload.rates || typeof payload.rates !== 'object') {
    throw new Error('fx.json 结构无效');
  }
  return payload;
}

function resolveExchangeRate(orderDate, fxConfig) {
  const candidates = Object.entries(fxConfig.rates)
    .filter(([date]) => date <= orderDate)
    .sort((a, b) => a[0].localeCompare(b[0]));

  if (!candidates.length) {
    throw createInputError(`未找到 ${orderDate} 可用的汇率`);
  }

  const [matchedDate, rate] = candidates[candidates.length - 1];
  return {
    matchedDate,
    value: Number(rate),
    baseCurrency: fxConfig.baseCurrency || 'CNY',
    quoteCurrency: fxConfig.quoteCurrency || 'RUB',
  };
}

function findMethod(methods, input) {
  return methods.find((method) =>
    normalizeString(method.originCountry) === input.originCountry &&
    normalizeString(method.warehouseType) === input.warehouseType &&
    normalizeString(method.salesScheme) === input.salesScheme &&
    normalizeString(method.carrierCode) === input.carrierCode &&
    normalizeString(method.deliveryMethodCode) === input.deliveryMethodCode
  );
}

function findComparableMethods(methods, input) {
  return methods.filter((method) =>
    normalizeString(method.originCountry) === input.originCountry &&
    normalizeString(method.warehouseType) === input.warehouseType &&
    normalizeString(method.salesScheme) === input.salesScheme
  );
}

function validateConstraints(method, input) {
  const constraints = method.constraints || {};
  const policies = method.constraintPolicies || {};
  const violations = [];
  const dimensionSumCm = input.lengthCm + input.widthCm + input.heightCm;
  const longestSideCm = Math.max(input.lengthCm, input.widthCm, input.heightCm);

  if (constraints.maxWeightG != null && policies.maxWeightG !== 'reference' && input.weightG > Number(constraints.maxWeightG)) {
    violations.push(`重量超限，最大 ${constraints.maxWeightG}g`);
  }
  if (constraints.maxDimensionSumCm != null && policies.maxDimensionSumCm !== 'reference' && dimensionSumCm > Number(constraints.maxDimensionSumCm)) {
    violations.push(`三边和超限，最大 ${constraints.maxDimensionSumCm}cm`);
  }
  if (constraints.maxSideCm != null && policies.maxSideCm !== 'reference' && longestSideCm > Number(constraints.maxSideCm)) {
    violations.push(`最长边超限，最大 ${constraints.maxSideCm}cm`);
  }
  if (constraints.minPriceCny != null && policies.minPriceCny !== 'reference' && input.price < Number(constraints.minPriceCny)) {
    violations.push(`商品价格低于限制，最小 ${constraints.minPriceCny} CNY`);
  }
  if (constraints.maxPriceCny != null && policies.maxPriceCny !== 'reference' && input.price > Number(constraints.maxPriceCny)) {
    violations.push(`商品价格超过限制，最大 ${constraints.maxPriceCny} CNY`);
  }
  if (constraints.maxLengthCm != null && input.lengthCm > Number(constraints.maxLengthCm)) {
    violations.push(`长度超限，最大 ${constraints.maxLengthCm}cm`);
  }
  if (constraints.maxWidthCm != null && input.widthCm > Number(constraints.maxWidthCm)) {
    violations.push(`宽度超限，最大 ${constraints.maxWidthCm}cm`);
  }
  if (constraints.maxHeightCm != null && input.heightCm > Number(constraints.maxHeightCm)) {
    violations.push(`高度超限，最大 ${constraints.maxHeightCm}cm`);
  }

  if (violations.length) {
    throw createInputError('输入参数超出物流方法限制', {
      violations,
      constraints,
    });
  }

  return {
    ok: true,
    constraints,
    dimensionSumCm,
    longestSideCm,
  };
}

function calculateVolumetricWeight(input, method) {
  const divisor = Number(method.volumetricDivisor || 5000);
  const volumeCm3 = input.lengthCm * input.widthCm * input.heightCm;
  const volumetricKg = volumeCm3 / divisor;
  return Math.ceil(volumetricKg * 1000);
}

function calculateChargeableWeight(physicalWeightG, volumetricWeightG, method) {
  const basis = method.chargeBasis || 'max';
  if (basis === 'physical') {
    return physicalWeightG;
  }
  if (basis === 'volumetric') {
    return volumetricWeightG;
  }
  return Math.max(physicalWeightG, volumetricWeightG);
}

function calculateCarrierDeliveryCost(chargeableWeightG, method) {
  const includedWeightG = Number(method.includedWeightG || 0);
  const fixedFee = Number(method.fixedFee || 0);
  const incrementUnitG = Number(method.incrementUnitG || 100);
  const incrementFee = Number(method.incrementFee || 0);
  const minFee = Number(method.minFee ?? fixedFee);
  const maxFee = method.maxFee == null ? null : Number(method.maxFee);
  const extraWeightG = Math.max(chargeableWeightG - includedWeightG, 0);
  const incrementCount = extraWeightG > 0 ? Math.ceil(extraWeightG / incrementUnitG) : 0;

  let cost = fixedFee + incrementCount * incrementFee;
  cost = Math.max(cost, minFee);
  if (maxFee != null) {
    cost = Math.min(cost, maxFee);
  }
  return roundMoney(cost);
}

function calculateExtraFee(price, carrierDeliveryCost, extraFeeConfig) {
  if (!extraFeeConfig || extraFeeConfig.value == null) {
    return 0;
  }

  const value = Number(extraFeeConfig.value);
  if (extraFeeConfig.type === 'fixed') {
    return roundMoney(value);
  }
  if (extraFeeConfig.type === 'percent_delivery') {
    return roundMoney(carrierDeliveryCost * value);
  }
  return roundMoney(price * value);
}

function normalizeVariants(method) {
  return Array.isArray(method.variants) ? method.variants : [];
}

export function listShippingMethods() {
  const rules = getRules();
  return rules.methods.map((method) => ({
    carrierCode: method.carrierCode,
    deliveryMethodCode: method.deliveryMethodCode,
    displayName: method.displayName,
    originCountry: method.originCountry,
    warehouseType: method.warehouseType,
    salesScheme: method.salesScheme,
    currency: method.currency,
    deliveryDays: method.deliveryDays || null,
    variants: normalizeVariants(method),
    constraints: method.constraints || {},
    notes: method.notes || '',
  }));
}

export function getShippingRuleInfo() {
  const rules = getRules();
  const fx = getFxConfig();
  return {
    rulesPath: RULES_PATH,
    fxPath: FX_PATH,
    meta: rules.meta || {},
    methodCount: rules.methods.length,
    fx: {
      updatedAt: fx.updatedAt || null,
      baseCurrency: fx.baseCurrency || 'CNY',
      quoteCurrency: fx.quoteCurrency || 'RUB',
      latestDate: Object.keys(fx.rates).sort().at(-1) || null,
    },
  };
}

export function calculateShipping(input) {
  const normalizedInput = {
    originCountry: parseRequiredString(input.originCountry, 'originCountry'),
    warehouseType: parseRequiredString(input.warehouseType, 'warehouseType'),
    salesScheme: parseRequiredString(input.salesScheme, 'salesScheme'),
    carrierCode: parseRequiredString(input.carrierCode, 'carrierCode'),
    deliveryMethodCode: parseRequiredString(input.deliveryMethodCode, 'deliveryMethodCode'),
    price: parsePositiveNumber(input.price, 'price'),
    lengthCm: parsePositiveNumber(input.lengthCm, 'lengthCm'),
    widthCm: parsePositiveNumber(input.widthCm, 'widthCm'),
    heightCm: parsePositiveNumber(input.heightCm, 'heightCm'),
    weightG: parsePositiveNumber(input.weightG, 'weightG'),
    orderDate: parseOrderDate(input.orderDate),
  };

  const rules = getRules();
  const fxConfig = getFxConfig();
  const method = findMethod(rules.methods, normalizedInput);

  if (!method) {
    throw createInputError('未找到匹配的物流方法', {
      carrierCode: normalizedInput.carrierCode,
      deliveryMethodCode: normalizedInput.deliveryMethodCode,
      originCountry: normalizedInput.originCountry,
      warehouseType: normalizedInput.warehouseType,
      salesScheme: normalizedInput.salesScheme,
    });
  }

  const validation = validateConstraints(method, normalizedInput);
  const physicalWeightG = Math.ceil(normalizedInput.weightG);
  const volumetricWeightG = calculateVolumetricWeight(normalizedInput, method);
  const chargeableWeightG = calculateChargeableWeight(physicalWeightG, volumetricWeightG, method);
  const carrierDeliveryCost = calculateCarrierDeliveryCost(chargeableWeightG, method);
  const ozonHandlingFee = roundMoney(Number(method.ozonHandlingFee || 0));
  const extraFee = calculateExtraFee(normalizedInput.price, carrierDeliveryCost, method.extraFee);
  const totalLogisticsCost = roundMoney(carrierDeliveryCost + ozonHandlingFee + extraFee);
  const exchangeRate = resolveExchangeRate(normalizedInput.orderDate, fxConfig);

  return {
    physicalWeightG,
    volumetricWeightG,
    chargeableWeightG,
    carrierDeliveryCost,
    ozonHandlingFee,
    extraFee,
    totalLogisticsCost,
    currency: method.currency || 'CNY',
    ruleMeta: {
      displayName: method.displayName,
      carrierCode: method.carrierCode,
      deliveryMethodCode: method.deliveryMethodCode,
      originCountry: method.originCountry,
      warehouseType: method.warehouseType,
      salesScheme: method.salesScheme,
      chargeBasis: method.chargeBasis,
      includedWeightG: Number(method.includedWeightG || 0),
      incrementUnitG: Number(method.incrementUnitG || 0),
      incrementFee: Number(method.incrementFee || 0),
      officialSubtitle: method.officialSubtitle || '',
      deliveryDays: method.deliveryDays || null,
      variants: normalizeVariants(method),
      constraints: method.constraints || {},
      constraintPolicies: method.constraintPolicies || {},
      notes: method.notes || '',
      sourceUpdatedAt: rules.meta?.updatedAt || null,
    },
    calculationMeta: {
      input: normalizedInput,
      validation,
      exchangeRate,
    },
  };
}

export function compareShipping(input) {
  const normalizedInput = {
    originCountry: parseRequiredString(input.originCountry, 'originCountry'),
    warehouseType: parseRequiredString(input.warehouseType, 'warehouseType'),
    salesScheme: parseRequiredString(input.salesScheme, 'salesScheme'),
    price: parsePositiveNumber(input.price, 'price'),
    lengthCm: parsePositiveNumber(input.lengthCm, 'lengthCm'),
    widthCm: parsePositiveNumber(input.widthCm, 'widthCm'),
    heightCm: parsePositiveNumber(input.heightCm, 'heightCm'),
    weightG: parsePositiveNumber(input.weightG, 'weightG'),
    orderDate: parseOrderDate(input.orderDate),
  };

  const rules = getRules();
  const methods = findComparableMethods(rules.methods, normalizedInput);
  const items = methods.map((method) => {
    try {
      const result = calculateShipping({
        ...normalizedInput,
        carrierCode: method.carrierCode,
        deliveryMethodCode: method.deliveryMethodCode,
      });
      return {
        ok: true,
        service: {
          carrierCode: method.carrierCode,
          deliveryMethodCode: method.deliveryMethodCode,
          displayName: method.displayName,
          officialSubtitle: method.officialSubtitle || '',
          deliveryDays: method.deliveryDays || null,
          variants: normalizeVariants(method),
          deliveryTarget: method.deliveryTarget || '',
          batteryPolicy: method.constraints?.batteryPolicy || '',
          tags: method.tags || [],
        },
        result,
      };
    } catch (error) {
      return {
        ok: false,
        service: {
          carrierCode: method.carrierCode,
          deliveryMethodCode: method.deliveryMethodCode,
          displayName: method.displayName,
          officialSubtitle: method.officialSubtitle || '',
          deliveryDays: method.deliveryDays || null,
          variants: normalizeVariants(method),
          deliveryTarget: method.deliveryTarget || '',
          batteryPolicy: method.constraints?.batteryPolicy || '',
          tags: method.tags || [],
        },
        error: error.message,
        details: error.details || null,
      };
    }
  });

  const availableItems = items
    .filter((item) => item.ok)
    .sort((a, b) => a.result.totalLogisticsCost - b.result.totalLogisticsCost);

  return {
    input: normalizedInput,
    items: availableItems,
    unavailableItems: items.filter((item) => !item.ok),
    total: availableItems.length,
    unavailableCount: items.filter((item) => !item.ok).length,
  };
}

export function calculateShippingBatch(items) {
  if (!Array.isArray(items)) {
    throw createInputError('批量计算请求体 items 必须是数组');
  }

  const results = items.map((item, index) => {
    try {
      return {
        index,
        ok: true,
        result: calculateShipping(item),
      };
    } catch (error) {
      return {
        index,
        ok: false,
        error: error.message,
        details: error.details || null,
      };
    }
  });

  return {
    items: results,
    successCount: results.filter((item) => item.ok).length,
    failedCount: results.filter((item) => !item.ok).length,
    errors: results.filter((item) => !item.ok),
  };
}
