export const defaultPricingForm = {
  categoryId: '',
  purchaseCost: '1',
  weight: '80',
  profitType: 'rate',
  profitVal: '20',
  discount: '50',
  logisticId: '',
  shippingServiceKey: '',
  deliveryType: '1',
  chinaFee: '0',
  adsRate: '0',
  cashRate: '1',
  refundRate: '2',
  otherFee: '0',
  volumeL: '21',
  volumeW: '20',
  volumeH: '1.4',
  manualLogisticsFee: '',
  manualCategoryRate: '',
};

export function normalizeInitialForm(form, categoryRates, logistics) {
  const category =
    categoryRates.find((item) => String(item.cId) === String(form.categoryId)) ||
    categoryRates.find((item) => item.name.includes('房子') || item.name.includes('花园')) ||
    categoryRates[0];
  const logistic =
    logistics.find((item) => String(item.logId) === String(form.logisticId)) ||
    logistics.find((item) => item.name === 'CEL Super Economy') ||
    logistics[0];

  return {
    ...form,
    categoryId: category ? String(category.cId) : '',
    logisticId: logistic ? String(logistic.logId) : '',
  };
}

export function getRate(exchangeRates, code) {
  const item = exchangeRates.find((rate) => rate.currency_code === code);
  return item ? Number(item.rate) : 0;
}

export function toPricingInput(form) {
  return {
    categoryId: Number(form.categoryId),
    logisticId: Number(form.logisticId),
    purchaseCost: numberValue(form.purchaseCost),
    weight: numberValue(form.weight),
    profitType: form.profitType,
    profitVal: numberValue(form.profitVal),
    discount: clamp(numberValue(form.discount), 0, 100) / 100,
    deliveryType: Number(form.deliveryType),
    chinaFee: numberValue(form.chinaFee),
    adsRate: numberValue(form.adsRate) / 100,
    cashRate: numberValue(form.cashRate) / 100,
    refundRate: numberValue(form.refundRate) / 100,
    otherFee: numberValue(form.otherFee),
    volumeL: numberValue(form.volumeL),
    volumeW: numberValue(form.volumeW),
    volumeH: numberValue(form.volumeH),
    manualLogisticsFee: optionalNumberValue(form.manualLogisticsFee),
    manualCategoryRate: optionalNumberValue(form.manualCategoryRate),
  };
}

export function calculateChargeWeight(logistic, input) {
  const actualWeight = Math.max(input.weight, 0);
  let volumetricWeight = 0;

  if (Number(logistic.cargoWeightFactor) > 0 && input.volumeL > 0 && input.volumeW > 0 && input.volumeH > 0) {
    volumetricWeight = ((input.volumeL * input.volumeW * input.volumeH) / Number(logistic.cargoWeightFactor)) * 1000;
  }

  const rawWeight = Math.max(actualWeight, volumetricWeight);
  const unit = Number(logistic.roundUp) === 2 ? 1000 : 100;
  const charged = rawWeight > 0 ? Math.ceil(rawWeight / unit) * unit : 0;

  return {
    actualWeight,
    volumetricWeight,
    charged,
    unit,
  };
}

export function calculateLogisticsFee(logistic, input, exchangeRates) {
  const charge = calculateChargeWeight(logistic, input);
  const isDoor = input.deliveryType === 2;
  const liftingPrice = isDoor ? logistic.liftingPriceDTD : logistic.liftingPrice;
  const byWeight = isDoor ? logistic.byWeightDTD : logistic.byWeight;

  let feeInLogisticCurrency = Number(liftingPrice || 0) + (charge.charged / 100) * Number(byWeight || 0);

  if (isDoor && feeInLogisticCurrency <= 0) {
    feeInLogisticCurrency = Number(logistic.liftingPrice || 0) + (charge.charged / 100) * Number(logistic.byWeight || 0);
  }

  const usdRate = getRate(exchangeRates, 'USD');
  let feeRmb = feeInLogisticCurrency;
  if (logistic.currency === 'USD') {
    feeRmb = usdRate > 0 ? feeInLogisticCurrency / usdRate : feeInLogisticCurrency * 7.2;
  }

  return {
    ...charge,
    feeRmb,
    feeInLogisticCurrency,
    currency: logistic.currency,
    liftingPrice,
    byWeight,
  };
}

export function calculatePricing({ form, logistics, categoryRates, exchangeRates, shippingQuote = null }) {
  const input = toPricingInput(form);
  const logistic = logistics.find((item) => String(item.logId) === String(input.logisticId));
  const category = categoryRates.find((item) => String(item.cId) === String(input.categoryId));
  const rubRate = getRate(exchangeRates, 'RUB');
  const usdRate = getRate(exchangeRates, 'USD');

  if (!logistic || !category) {
    return {
      ok: false,
      error: '缺少物流或类目数据，无法计算。',
    };
  }

  const logisticsQuote = calculateLogisticsFee(logistic, input, exchangeRates);
  const categoryRate = input.manualCategoryRate == null ? Number(category.rate) : input.manualCategoryRate / 100;
  const automaticLogisticsFee = shippingQuote?.feeRmb ?? logisticsQuote.feeRmb;
  const logisticsFee = input.manualLogisticsFee == null ? automaticLogisticsFee : input.manualLogisticsFee;
  const fixedCost = input.purchaseCost + input.chinaFee + logisticsFee + input.otherFee;
  const variableRate = categoryRate + input.adsRate + input.cashRate + input.refundRate;
  const denominator =
    input.profitType === 'amount'
      ? 1 - variableRate
      : 1 - variableRate - input.profitVal / 100;

  let salePriceRmb = 0;
  if (denominator > 0) {
    salePriceRmb =
      input.profitType === 'amount'
        ? (fixedCost + input.profitVal) / denominator
        : fixedCost / denominator;
  }

  const safeSalePriceRmb = Number.isFinite(salePriceRmb) && salePriceRmb > 0 ? salePriceRmb : 0;
  const discount = input.discount > 0 ? input.discount : 1;
  const originalPriceRmb = safeSalePriceRmb / discount;

  const commission = safeSalePriceRmb * categoryRate;
  const adsFee = safeSalePriceRmb * input.adsRate;
  const cashFee = safeSalePriceRmb * input.cashRate;
  const refundFee = safeSalePriceRmb * input.refundRate;
  const profit = safeSalePriceRmb - fixedCost - commission - adsFee - cashFee - refundFee;
  const totalCost = fixedCost + commission + adsFee + cashFee + refundFee;
  const actualProfitRate = safeSalePriceRmb > 0 ? profit / safeSalePriceRmb : 0;
  const crossBorderLogisticsShare = safeSalePriceRmb > 0 ? logisticsFee / safeSalePriceRmb : 0;
  const domesticLogisticsShare = safeSalePriceRmb > 0 ? input.chinaFee / safeSalePriceRmb : 0;
  const totalLogisticsShare = crossBorderLogisticsShare + domesticLogisticsShare;

  return {
    ok: true,
    input,
    logistic,
    category,
    rubRate,
    usdRate,
    logistics: shippingQuote
      ? {
          ...logisticsQuote,
          feeRmb: shippingQuote.feeRmb,
          charged: shippingQuote.chargeableWeightG ?? logisticsQuote.charged,
          actualWeight: shippingQuote.physicalWeightG ?? logisticsQuote.actualWeight,
          volumetricWeight: shippingQuote.volumetricWeightG ?? logisticsQuote.volumetricWeight,
          unit: shippingQuote.incrementUnitG ?? logisticsQuote.unit,
        }
      : logisticsQuote,
    shippingQuote,
    logisticsFee,
    categoryRate,
    salePriceRmb: safeSalePriceRmb,
    originalPriceRmb,
    salePriceRub: safeSalePriceRmb * rubRate,
    originalPriceRub: originalPriceRmb * rubRate,
    salePriceUsd: usdRate > 0 ? safeSalePriceRmb * usdRate : 0,
    originalPriceUsd: usdRate > 0 ? originalPriceRmb * usdRate : 0,
    commission,
    adsFee,
    cashFee,
    refundFee,
    profit,
    totalCost,
    actualProfitRate,
    fixedCost,
    variableRate,
    logisticsShare: totalLogisticsShare,
    totalLogisticsShare,
    crossBorderLogisticsShare,
    domesticLogisticsShare,
    warnings: collectWarnings({ variableRate, salePriceRmb: safeSalePriceRmb, logisticsShare: totalLogisticsShare, profit }),
  };
}

export function buildLogisticsCompare({ form, logistics, exchangeRates }) {
  const input = toPricingInput(form);
  return logistics
    .filter((item) => item.logName === 'CEL' || item.name.startsWith('CEL '))
    .map((item) => {
      const pickup = calculateLogisticsFee(item, { ...input, deliveryType: 1 }, exchangeRates);
      const door = calculateLogisticsFee(item, { ...input, deliveryType: 2 }, exchangeRates);
      const usdRate = getRate(exchangeRates, 'USD');
      return {
        id: item.logId,
        name: item.name,
        logo: item.logo && item.logo.startsWith('http') ? item.logo : '',
        hasDoor: Number(item.byWeightDTD || 0) > 0 || Number(item.liftingPriceDTD || 0) > 0,
        pickup,
        door,
        pickupUsd: usdRate > 0 ? pickup.feeRmb * usdRate : 0,
        doorUsd: usdRate > 0 ? door.feeRmb * usdRate : 0,
      };
    });
}

function collectWarnings({ variableRate, salePriceRmb, logisticsShare, profit }) {
  const warnings = [];
  if (variableRate >= 0.85 || salePriceRmb <= 0) {
    warnings.push('费率或毛利目标过高，当前参数无法形成稳定售价。');
  }
  if (logisticsShare > 0.35) {
    warnings.push('物流占比超过 35%，选品阶段建议谨慎复核。');
  }
  if (profit < 5) {
    warnings.push('预计利润低于 5 元，建议复核售价和成本。');
  }
  return warnings;
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumberValue(value) {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
