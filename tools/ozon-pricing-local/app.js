const state = {
  logistics: [],
  categoryRates: [],
  exchangeRates: [],
};

const els = {};
const fieldIds = [
  'categoryId',
  'purchaseCost',
  'weight',
  'profitType',
  'profitVal',
  'discount',
  'logisticId',
  'deliveryType',
  'chinaFee',
  'adsRate',
  'cashRate',
  'refundRate',
  'otherFee',
  'volumeL',
  'volumeW',
  'volumeH',
  'manualLogisticsFee',
  'manualCategoryRate',
];

function byId(id) {
  return document.getElementById(id);
}

function numberValue(id) {
  const value = Number(els[id].value);
  return Number.isFinite(value) ? value : 0;
}

function optionalNumberValue(id) {
  if (els[id].value === '') return null;
  const value = Number(els[id].value);
  return Number.isFinite(value) ? value : null;
}

function money(value, currency = '¥') {
  return `${currency}${value.toFixed(2)}`;
}

function percent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function loadData() {
  const [logistics, categoryRates, exchangeRates] = await Promise.all([
    fetch('./data/logistics.json').then((res) => res.json()),
    fetch('./data/categoryRates.json').then((res) => res.json()),
    fetch('./data/exchangeRates.json').then((res) => res.json()),
  ]);

  state.logistics = logistics.items;
  state.categoryRates = categoryRates.items;
  state.exchangeRates = exchangeRates.items;
  state.generatedAt = logistics.generatedAt;
}

function getRate(code) {
  const item = state.exchangeRates.find((x) => x.currency_code === code);
  return item ? Number(item.rate) : 0;
}

function optionTextForCategory(item) {
  return `${item.name} - ${(item.rate * 100).toFixed(2)}%`;
}

function formatLogisticMoney(value, currency) {
  const symbol = currency === 'USD' ? '$' : '¥';
  return `${symbol}${Number(value || 0).toFixed(2)}`;
}

function logisticOptionText(item, input = null) {
  const carrier = item.logName ? `${item.logName} / ` : '';
  const isDoor = input && input.deliveryType === 2;
  const liftingPrice = isDoor ? item.liftingPriceDTD : item.liftingPrice;
  const byWeight = isDoor ? item.byWeightDTD : item.byWeight;
  const fallbackLifting = item.liftingPrice;
  const fallbackByWeight = item.byWeight;
  const baseText = `首 ${formatLogisticMoney(liftingPrice || fallbackLifting, item.currency)} + ${formatLogisticMoney(byWeight || fallbackByWeight, item.currency)}/100g`;

  if (!input) {
    return `${carrier}${item.name} (${baseText})`;
  }

  const quote = calculateLogisticsFee(item, input);
  return `${carrier}${item.name} (估 ¥${quote.feeRmb.toFixed(2)}，${baseText})`;
}

function populateSelects() {
  els.categoryId.innerHTML = state.categoryRates
    .map((item) => `<option value="${item.cId}">${optionTextForCategory(item)}</option>`)
    .join('');

  const homeGarden = state.categoryRates.find((item) => item.name.includes('房子和花园'));
  if (homeGarden) {
    els.categoryId.value = String(homeGarden.cId);
  }

  refreshLogisticOptions();

  const superEconomy = state.logistics.find((item) => item.name === 'CEL Super Economy');
  if (superEconomy) {
    els.logisticId.value = String(superEconomy.logId);
  }
}

function refreshLogisticOptions() {
  const selected = els.logisticId.value;
  const input = readInput();
  els.logisticId.innerHTML = state.logistics
    .map((item) => `<option value="${item.logId}">${logisticOptionText(item, input)}</option>`)
    .join('');
  if (state.logistics.some((item) => String(item.logId) === selected)) {
    els.logisticId.value = selected;
  }
}

function selectedLogistic() {
  return state.logistics.find((item) => String(item.logId) === els.logisticId.value);
}

function selectedCategory() {
  return state.categoryRates.find((item) => String(item.cId) === els.categoryId.value);
}

function calculateChargeWeight(logistic, input) {
  const actualWeight = Math.max(input.weight, 0);
  let volumetricWeight = 0;

  if (logistic.cargoWeightFactor > 0 && input.volumeL > 0 && input.volumeW > 0 && input.volumeH > 0) {
    volumetricWeight = (input.volumeL * input.volumeW * input.volumeH / logistic.cargoWeightFactor) * 1000;
  }

  const rawWeight = Math.max(actualWeight, volumetricWeight);

  // Old page logistics data uses roundUp as a compact flag. For fast pricing,
  // use a conservative 100g billing unit for roundUp 0/1 and 1kg for roundUp 2.
  const unit = logistic.roundUp === 2 ? 1000 : 100;
  const charged = rawWeight > 0 ? Math.ceil(rawWeight / unit) * unit : 0;

  return {
    actualWeight,
    volumetricWeight,
    charged,
    unit,
  };
}

function calculateLogisticsFee(logistic, input) {
  const charge = calculateChargeWeight(logistic, input);
  const isDoor = input.deliveryType === 2;
  const liftingPrice = isDoor ? logistic.liftingPriceDTD : logistic.liftingPrice;
  const byWeight = isDoor ? logistic.byWeightDTD : logistic.byWeight;

  let feeInLogisticCurrency = Number(liftingPrice || 0) + (charge.charged / 100) * Number(byWeight || 0);

  // Some routes do not support DTD and publish a zero DTD weight price.
  if (isDoor && feeInLogisticCurrency <= 0) {
    feeInLogisticCurrency = Number(logistic.liftingPrice || 0) + (charge.charged / 100) * Number(logistic.byWeight || 0);
  }

  const usdRate = getRate('USD');
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

function convertRmbToUsd(value) {
  const usdRate = getRate('USD');
  return usdRate > 0 ? value * usdRate : 0;
}

function readInput() {
  const discountPercent = clamp(numberValue('discount'), 0, 100);
  return {
    categoryId: Number(els.categoryId.value),
    logisticId: Number(els.logisticId.value),
    purchaseCost: numberValue('purchaseCost'),
    weight: numberValue('weight'),
    profitType: els.profitType.value,
    profitVal: numberValue('profitVal'),
    discount: discountPercent / 100,
    deliveryType: Number(els.deliveryType.value),
    chinaFee: numberValue('chinaFee'),
    adsRate: numberValue('adsRate') / 100,
    cashRate: numberValue('cashRate') / 100,
    refundRate: numberValue('refundRate') / 100,
    otherFee: numberValue('otherFee'),
    volumeL: numberValue('volumeL'),
    volumeW: numberValue('volumeW'),
    volumeH: numberValue('volumeH'),
    manualLogisticsFee: optionalNumberValue('manualLogisticsFee'),
    manualCategoryRate: optionalNumberValue('manualCategoryRate'),
  };
}

function calculatePricing() {
  const input = readInput();
  const logistic = selectedLogistic();
  const category = selectedCategory();
  const rubRate = getRate('RUB');
  const usdRate = getRate('USD');

  if (!logistic || !category) {
    throw new Error('缺少物流或类目数据');
  }

  const logistics = calculateLogisticsFee(logistic, input);
  const categoryRate = input.manualCategoryRate == null ? category.rate : input.manualCategoryRate / 100;
  const logisticsFee = input.manualLogisticsFee == null ? logistics.feeRmb : input.manualLogisticsFee;
  const fixedCost = input.purchaseCost + input.chinaFee + logisticsFee + input.otherFee;
  const variableRate = categoryRate + input.adsRate + input.cashRate + input.refundRate;

  let salePriceRmb;
  if (input.profitType === 'amount') {
    salePriceRmb = (fixedCost + input.profitVal) / (1 - variableRate);
  } else {
    const targetProfitRate = input.profitVal / 100;
    salePriceRmb = fixedCost / (1 - variableRate - targetProfitRate);
  }

  const safeSalePriceRmb = Number.isFinite(salePriceRmb) && salePriceRmb > 0 ? salePriceRmb : 0;
  const discount = input.discount > 0 ? input.discount : 1;
  const originalPriceRmb = safeSalePriceRmb / discount;

  const commission = safeSalePriceRmb * categoryRate;
  const adsFee = safeSalePriceRmb * input.adsRate;
  const cashFee = safeSalePriceRmb * input.cashRate;
  const refundFee = safeSalePriceRmb * input.refundRate;
  const profit = safeSalePriceRmb - fixedCost - commission - adsFee - cashFee - refundFee;
  const actualProfitRate = safeSalePriceRmb > 0 ? profit / safeSalePriceRmb : 0;

  return {
    input,
    logistic,
    category,
    rubRate,
    usdRate,
    logistics,
    logisticsFee,
    categoryRate,
    salePriceRmb: safeSalePriceRmb,
    originalPriceRmb,
    commission,
    adsFee,
    cashFee,
    refundFee,
    profit,
    actualProfitRate,
    fixedCost,
    variableRate,
  };
}

function renderLogisticsCompare() {
  const input = readInput();
  const celLogistics = state.logistics.filter((item) => item.logName === 'CEL' || item.name.startsWith('CEL '));
  const rows = celLogistics.map((item) => {
    const pickup = calculateLogisticsFee(item, { ...input, deliveryType: 1 });
    const door = calculateLogisticsFee(item, { ...input, deliveryType: 2 });
    const hasDoor = Number(item.byWeightDTD || 0) > 0 || Number(item.liftingPriceDTD || 0) > 0;
    const pickupUsd = convertRmbToUsd(pickup.feeRmb);
    const doorUsd = convertRmbToUsd(door.feeRmb);
    const logo = item.logo && item.logo.startsWith('http') ? item.logo : '';
    return `
      <div class="logistics-row">
        <div class="carrier-cell">
          ${logo ? `<img src="${logo}" alt="${item.name}">` : '<div></div>'}
          <span>${item.name}</span>
        </div>
        <div class="fee-cell">
          <span>到取货点： $ ${pickupUsd.toFixed(2)} ( ¥ ${pickup.feeRmb.toFixed(2)} )</span>
          ${hasDoor ? `<span>快递上门配送： $ ${doorUsd.toFixed(2)} ( ¥ ${door.feeRmb.toFixed(2)} )</span>` : ''}
        </div>
      </div>
    `;
  });
  byId('logisticsCompareList').innerHTML = rows.join('');
}

function openLogisticsModal() {
  renderLogisticsCompare();
  byId('logisticsModal').hidden = false;
}

function closeLogisticsModal() {
  byId('logisticsModal').hidden = true;
}

function setText(id, text) {
  byId(id).textContent = text;
}

function renderResult(result) {
  const rub = result.rubRate || 0;
  const usd = result.usdRate || 0;
  const saleRub = result.salePriceRmb * rub;
  const originalRub = result.originalPriceRmb * rub;
  const saleUsd = usd > 0 ? result.salePriceRmb * usd : 0;
  const originalUsd = usd > 0 ? result.originalPriceRmb * usd : 0;
  const logisticsShare = result.salePriceRmb > 0 ? result.logisticsFee / result.salePriceRmb : 0;

  setText('saleUsd', money(saleUsd, '$'));
  setText('saleRub', `₽${saleRub.toFixed(2)}`);
  setText('originalUsd', money(originalUsd, '$'));
  setText('originalRub', `₽${originalRub.toFixed(2)}`);
  setText('profitRmb', money(result.profit));
  setText('profitRate', percent(result.actualProfitRate));
  setText('chargeWeight', `${result.logistics.charged.toFixed(0)}g`);
  setText('logisticsShare', percent(logisticsShare));

  setText('rowOriginal', `${money(result.originalPriceRmb)} / ₽${originalRub.toFixed(2)}`);
  setText('rowSale', `${money(result.salePriceRmb)} / ₽${saleRub.toFixed(2)}`);
  setText('rowProfit', money(result.profit));
  setText('rowProfitRate', percent(result.actualProfitRate));
  setText('costPurchase', money(result.input.purchaseCost));
  setText('costChina', money(result.input.chinaFee));
  setText('costLogistics', money(result.logisticsFee));
  setText('costCommission', money(result.commission));
  setText('costAds', money(result.adsFee));
  setText('costCash', money(result.cashFee));
  setText('costRefund', money(result.refundFee));
  setText('costOther', money(result.input.otherFee));

  const manualLogistics = result.input.manualLogisticsFee != null;
  const manualCommission = result.input.manualCategoryRate != null;
  const volumeNote = result.logistics.volumetricWeight > result.logistics.actualWeight
    ? `，体积重 ${result.logistics.volumetricWeight.toFixed(0)}g`
    : '';
  setText(
    'logisticsNote',
    manualLogistics
      ? '手动覆盖'
      : `${result.logistic.name}，${result.logistics.unit}g 进位${volumeNote}`,
  );
  setText(
    'commissionNote',
    `${manualCommission ? '手动覆盖' : result.category.name}，${percent(result.categoryRate)}`,
  );

  const warnings = [];
  if (result.variableRate >= 0.85 || result.salePriceRmb <= 0) {
    warnings.push('费率或毛利目标过高，建议降低毛利、佣金或其他费率。');
  }
  if (logisticsShare > 0.35) {
    warnings.push('物流占比超过 35%，选品阶段建议谨慎。');
  }
  if (result.profit < 5) {
    warnings.push('预计利润低于 5 元，建议复核售价和成本。');
  }
  setText('warningText', warnings.join(' '));
}

function updateRateSummary() {
  setText(
    'ratesSummary',
    `1 CNY = ${getRate('USD').toFixed(4)} USD\n1 CNY = ${getRate('RUB').toFixed(4)} RUB`,
  );
  setText('dataStamp', `数据更新：${new Date(state.generatedAt).toLocaleString('zh-CN')}`);
}

function calculateAndRender() {
  refreshLogisticOptions();
  renderResult(calculatePricing());
}

function resetForm() {
  els.purchaseCost.value = '1';
  els.weight.value = '80';
  els.profitType.value = 'rate';
  els.profitVal.value = '20';
  els.discount.value = '50';
  els.deliveryType.value = '1';
  els.chinaFee.value = '0';
  els.adsRate.value = '0';
  els.cashRate.value = '1';
  els.refundRate.value = '2';
  els.otherFee.value = '0';
  els.volumeL.value = '21';
  els.volumeW.value = '20';
  els.volumeH.value = '1.4';
  els.manualLogisticsFee.value = '';
  els.manualCategoryRate.value = '';
  byId('profitUnit').textContent = '%';
  calculateAndRender();
}

async function init() {
  for (const id of fieldIds) {
    els[id] = byId(id);
  }

  await loadData();
  populateSelects();
  updateRateSummary();

  byId('pricingForm').addEventListener('submit', (event) => {
    event.preventDefault();
    calculateAndRender();
  });
  byId('resetBtn').addEventListener('click', resetForm);
  byId('showLogisticsCompare').addEventListener('click', openLogisticsModal);
  byId('logisticsModal').addEventListener('click', (event) => {
    if (event.target.hasAttribute('data-close-modal')) {
      closeLogisticsModal();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeLogisticsModal();
  });
  els.profitType.addEventListener('change', () => {
    byId('profitUnit').textContent = els.profitType.value === 'amount' ? '¥' : '%';
  });

  for (const id of fieldIds) {
    els[id].addEventListener('change', calculateAndRender);
  }

  calculateAndRender();
}

init().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<pre class="fatal">加载失败：${error.message}</pre>`;
});
