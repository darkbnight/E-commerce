import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

const SOURCES = {
  logistics: 'https://ozon.menglar.com/tools/logistics/logisticsList',
  categoryRates: 'https://ozon.menglar.com/tools/logistics/categoryRateList',
  exchangeRates: 'https://ozon.menglar.com/api/exchange-rate/v1/get/rate?siteId=0',
};

async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json,text/plain,*/*',
      'user-agent': 'Mozilla/5.0 local-pricing-tool',
    },
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status}: ${url}`);
  }
  return response.json();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeLogistics(items) {
  return items
    .map((item) => ({
      logId: item.logId,
      name: item.name,
      logName: item.logName || '',
      currency: item.currency || 'RMB',
      liftingPrice: toNumber(item.liftingPrice),
      liftingPriceDTD: toNumber(item.liftingPriceDTD),
      byWeight: toNumber(item.byWeight),
      byWeightDTD: toNumber(item.byWeightDTD),
      roundUp: toNumber(item.roundUp),
      weightLimit: toNumber(item.weightLimit),
      lengthLimit: toNumber(item.lengthLimit),
      sideLengthLimit: toNumber(item.sideLengthLimit),
      cargoGroup: item.cargoGroup ?? null,
      cargoWeightLimit: toNumber(item.cargoWeightLimit),
      cargoWeightFactor: toNumber(item.cargoWeightFactor),
      topPriority: toNumber(item.topPriority),
      speedDayMin: toNumber(item.speedDayMin),
      speedDayMax: toNumber(item.speedDayMax),
      logo: item.logo || '',
    }))
    .sort((a, b) => {
      if (b.topPriority !== a.topPriority) return b.topPriority - a.topPriority;
      return a.logId - b.logId;
    });
}

function normalizeCategoryRates(items) {
  return items
    .map((item) => ({
      cId: item.cId,
      levelId: item.levelId ?? null,
      name: item.name,
      rate: toNumber(item.rate),
    }))
    .sort((a, b) => a.cId - b.cId);
}

function normalizeExchangeRates(items) {
  return items
    .map((item) => ({
      currency_code: item.currency_code,
      rate: toNumber(item.rate),
    }))
    .sort((a, b) => a.currency_code.localeCompare(b.currency_code));
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  const [logisticsRes, categoryRatesRes, exchangeRatesRes] = await Promise.all([
    getJson(SOURCES.logistics),
    getJson(SOURCES.categoryRates),
    getJson(SOURCES.exchangeRates),
  ]);

  if (!logisticsRes.success || !Array.isArray(logisticsRes.data)) {
    throw new Error('Unexpected logistics response');
  }
  if (!categoryRatesRes.success || !Array.isArray(categoryRatesRes.data)) {
    throw new Error('Unexpected category rates response');
  }
  if (!Array.isArray(exchangeRatesRes.data)) {
    throw new Error('Unexpected exchange rates response');
  }

  const generatedAt = new Date().toISOString();
  const dataSets = {
    logistics: {
      source: SOURCES.logistics,
      generatedAt,
      items: normalizeLogistics(logisticsRes.data),
    },
    categoryRates: {
      source: SOURCES.categoryRates,
      generatedAt,
      items: normalizeCategoryRates(categoryRatesRes.data),
    },
    exchangeRates: {
      source: SOURCES.exchangeRates,
      generatedAt,
      items: normalizeExchangeRates(exchangeRatesRes.data),
    },
  };

  await Promise.all(
    Object.entries(dataSets).map(([name, data]) =>
      writeFile(path.join(DATA_DIR, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`, 'utf8'),
    ),
  );

  console.log(`Updated ${dataSets.logistics.items.length} logistics rows`);
  console.log(`Updated ${dataSets.categoryRates.items.length} category rows`);
  console.log(`Updated ${dataSets.exchangeRates.items.length} exchange-rate rows`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
