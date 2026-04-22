import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { unzipSync } from 'fflate';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'data', 'shipping-sources');
const OUTPUT_PATH = path.join(ROOT, 'config', 'shipping', 'rules.generated.json');
const CALIBRATION_PATH = path.join(ROOT, 'config', 'shipping', 'calculator-calibration.json');

const SOURCES = {
  commercialChina: path.join(SOURCE_DIR, 'China_scoring_ENG_CN_7_04_26.xlsx'),
  chinaPost: path.join(SOURCE_DIR, 'China_post_HELP_ePacket_AM_AZ_UZ.xlsx'),
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: 'text',
});

function normalizeArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function readZipText(zip, filePath) {
  const entry = zip[filePath];
  if (!entry) {
    throw new Error(`Missing XLSX internal file: ${filePath}`);
  }
  return Buffer.from(entry).toString('utf8');
}

function loadWorkbook(filePath) {
  const zip = unzipSync(readFileSync(filePath));
  const sharedStrings = loadSharedStrings(zip);
  const workbook = parser.parse(readZipText(zip, 'xl/workbook.xml'));
  const rels = parser.parse(readZipText(zip, 'xl/_rels/workbook.xml.rels'));
  const relList = normalizeArray(rels.Relationships.Relationship);
  const relMap = new Map(relList.map((rel) => [rel.Id, rel.Target]));
  const sheets = normalizeArray(workbook.workbook.sheets.sheet).map((sheet) => {
    const target = relMap.get(sheet['r:id']);
    const normalizedTarget = target.startsWith('xl/') ? target : `xl/${target}`;
    return {
      name: sheet.name,
      path: normalizedTarget,
    };
  });

  return {
    zip,
    sharedStrings,
    sheets,
  };
}

function loadSharedStrings(zip) {
  if (!zip['xl/sharedStrings.xml']) {
    return [];
  }

  const doc = parser.parse(readZipText(zip, 'xl/sharedStrings.xml'));
  const items = normalizeArray(doc.sst?.si);
  return items.map((item) => {
    if (item.t != null) return textFromNode(item.t);
    if (item.r != null) {
      return normalizeArray(item.r).map((run) => textFromNode(run.t)).join('');
    }
    return textFromNode(item);
  });
}

function textFromNode(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => textFromNode(item)).join('');
  }
  if (value.text != null) return textFromNode(value.text);
  if (value.t != null) return textFromNode(value.t);
  if (value.v != null) return textFromNode(value.v);
  return '';
}

function columnIndex(cellRef = 'A1') {
  const letters = cellRef.replace(/[^A-Z]/gi, '').toUpperCase();
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + letter.charCodeAt(0) - 64;
  }
  return index - 1;
}

function cellValue(cell, sharedStrings) {
  if (cell.v == null && cell.is?.t == null) {
    return '';
  }

  if (cell.t === 's') {
    const index = Number(cell.v);
    return sharedStrings[index] || '';
  }

  if (cell.is?.t != null) {
    return typeof cell.is.t === 'string' ? cell.is.t : cell.is.t.text || '';
  }

  return textFromNode(cell.v).trim();
}

function readSheet(workbook, sheetName) {
  const sheet = workbook.sheets.find((item) => item.name === sheetName);
  if (!sheet) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }

  const doc = parser.parse(readZipText(workbook.zip, sheet.path));
  const rows = normalizeArray(doc.worksheet.sheetData.row);
  return rows.map((row) => {
    const cells = normalizeArray(row.c);
    const values = [];
    for (const cell of cells) {
      const index = columnIndex(cell.r);
      while (values.length <= index) {
        values.push('');
      }
      values[index] = cellValue(cell, workbook.sharedStrings);
    }
    return values.map((value) => String(value ?? '').trim());
  });
}

function findHeaderIndex(rows, requiredHeaders) {
  const index = rows.findIndex((row) => requiredHeaders.every((header) => row.includes(header)));
  if (index < 0) {
    throw new Error(`Header row not found: ${requiredHeaders.join(', ')}`);
  }
  return index;
}

function rowsToObjects(rows, headerIndex) {
  const header = rows[headerIndex];
  return rows.slice(headerIndex + 1).map((row) => {
    const item = {};
    header.forEach((key, index) => {
      if (key) {
        item[key] = row[index] || '';
      }
    });
    return item;
  });
}

function normalizeRateText(rateText) {
  return String(rateText || '')
    .replace(/\u00a5|\uffe5/g, '¥')
    .replace(/,/g, '.')
    .replace(/г/gi, 'g')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRate(rateText) {
  const text = normalizeRateText(rateText);
  const match = text.match(/¥\s*([0-9.]+)\s*\+\s*¥\s*([0-9.]+)\s*\/\s*(?:(\d+)\s*)?g/i);
  if (match) {
    return {
      fixedFee: Number(match[1]),
      incrementFee: Number(match[2]),
      incrementUnitG: Number(match[3] || 1),
      raw: rateText,
    };
  }

  const fixedOnly = text.match(/¥\s*([0-9.]+)/);
  if (fixedOnly) {
    return {
      fixedFee: Number(fixedOnly[1]),
      incrementFee: 0,
      incrementUnitG: 1,
      raw: rateText,
    };
  }

  return null;
}

function parseDays(value) {
  const text = String(value || '');
  const match = text.match(/(\d+)\s*[-\u2013\u2014]\s*(\d+)/);
  if (!match) return null;
  return {
    min: Number(match[1]),
    max: Number(match[2]),
  };
}

function parseBooleanPolicy(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('allow') || text.includes('allowed')) return 'allowed';
  if (text.includes('forbid') || text.includes('forbidden')) return 'forbidden';
  return 'unknown';
}

function parseConstraints(measurements, minWeight, maxWeight, minRub, maxRub, minCny, maxCny) {
  const text = String(measurements || '');
  const constraints = {};

  const sumMatch = text.match(/sum of sides\s*(?:<=|\u2264|<)\s*(\d+)/i);
  if (sumMatch) {
    constraints.maxDimensionSumCm = Number(sumMatch[1]);
  }

  const sideMatch = text.match(/length\s*(?:<=|\u2264|<)\s*(\d+)/i);
  if (sideMatch) {
    constraints.maxSideCm = Number(sideMatch[1]);
  }

  const minWeightG = parseOptionalNumber(minWeight);
  const maxWeightG = parseOptionalNumber(maxWeight);
  if (minWeightG != null) constraints.minWeightG = minWeightG;
  if (maxWeightG != null) constraints.maxWeightG = maxWeightG;

  const minPriceRub = parseOptionalNumber(minRub);
  const maxPriceRub = parseOptionalNumber(maxRub);
  if (minPriceRub != null) constraints.minPriceRub = minPriceRub;
  if (maxPriceRub != null) constraints.maxPriceRub = maxPriceRub;

  const minPriceCny = parseOptionalNumber(minCny);
  const maxPriceCny = parseOptionalNumber(maxCny);
  if (minPriceCny != null) constraints.minPriceCny = minPriceCny;
  if (maxPriceCny != null) constraints.maxPriceCny = maxPriceCny;

  return constraints;
}

function parseMinMaxRange(value) {
  const text = String(value || '').replace(/,/g, '.');
  const match = text.match(/([0-9.]+)\s*-\s*([0-9.]+)/);
  if (!match) return { min: null, max: null };
  return {
    min: Number(match[1]),
    max: Number(match[2]),
  };
}

function constraintPoliciesFor(constraints) {
  return {
    maxWeightG: constraints.maxWeightG == null ? 'none' : 'hard',
    maxSideCm: constraints.maxSideCm == null ? 'none' : 'hard',
    maxDimensionSumCm: constraints.maxDimensionSumCm == null ? 'none' : 'reference',
    minPriceCny: constraints.minPriceCny == null ? 'none' : 'hard',
    maxPriceCny: constraints.maxPriceCny == null ? 'none' : 'hard',
  };
}

function parseOptionalNumber(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function deliveryTargetFromName(name) {
  const text = String(name || '').toLowerCase();
  if (text.includes('courier')) return 'courier';
  return 'pickup_point';
}

function codeFromName(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function cleanDeliveryMethod(name) {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCommercialChinaRules() {
  const workbook = loadWorkbook(SOURCES.commercialChina);
  const rows = readSheet(workbook, 'CHINA rFBS');
  const headerIndex = findHeaderIndex(rows, ['Scoring Group', 'Service Level', '3PL', 'Delivery Method']);
  const records = rowsToObjects(rows, headerIndex);

  return records
    .filter((record) => record['Delivery Method'] && record['3PL'] && record['Rates (PUDO / Courier)'])
    .map((record) => {
      const rate = parseRate(record['Rates (PUDO / Courier)']);
      if (!rate) return null;
      const deliveryMethod = cleanDeliveryMethod(record['Delivery Method']);
      const carrierCode = codeFromName(record['3PL']);
      const rubRange = parseMinMaxRange(record['Shipment cost limit / min-max \nRUB']);
      const cnyRange = parseMinMaxRange(record['Shipment cost limit / min-max \nCNY']);
      const constraints = parseConstraints(
        record['Measurements, max cm'],
        record['Shipment weight limits / min g'],
        record['Shipment weight limits / max g'],
        rubRange.min,
        rubRange.max,
        cnyRange.min,
        cnyRange.max,
      );

      return {
        carrierCode,
        deliveryMethodCode: codeFromName(`${record['3PL']} ${deliveryMethod}`),
        displayName: deliveryMethod,
        officialSubtitle: deliveryMethod,
        originCountry: 'CN',
        warehouseType: 'seller_warehouse',
        salesScheme: 'realFBS',
        destinationCountry: 'RU',
        destinationCity: 'Moscow',
        scoringGroup: record['Scoring Group'] || null,
        serviceLevel: record['Service Level'] || null,
        ozonRating: Number(record['Ozon rating']) || null,
        deliveryTarget: deliveryTargetFromName(deliveryMethod),
        chargeBasis: 'physical',
        currency: 'CNY',
        includedWeightG: 0,
        fixedFee: rate.fixedFee,
        incrementUnitG: rate.incrementUnitG,
        incrementFee: rate.incrementFee,
        minFee: 0,
        maxFee: null,
        ozonHandlingFee: 0,
        extraFee: { type: 'fixed', value: 0 },
        deliveryDays: parseDays(record['Time-limits (from drop-off to Sorting center Ozon), days']),
        constraints: {
          ...constraints,
          batteryPolicy: parseBooleanPolicy(record.Batteries),
          liquidPolicy: parseBooleanPolicy(record.Liquids),
        },
        constraintPolicies: constraintPoliciesFor(constraints),
        tags: [],
        officialSource: {
          kind: 'xlsx',
          file: path.basename(SOURCES.commercialChina),
          sheet: 'CHINA rFBS',
          rate: rate.raw,
        },
        notes: 'Imported from Ozon official China rFBS XLSX.',
      };
    })
    .filter(Boolean);
}

function parseChinaPostRules() {
  const workbook = loadWorkbook(SOURCES.chinaPost);
  const rows = readSheet(workbook, 'China to Russia by CP');
  const headerIndex = findHeaderIndex(rows, ['Delivery Method', 'Price']);
  const records = rowsToObjects(rows, headerIndex);

  return records
    .filter((record) => record['Delivery Method'] && record.Price)
    .map((record) => {
      const rate = parseRate(record.Price);
      if (!rate) return null;
      const deliveryMethod = cleanDeliveryMethod(record['Delivery Method']);
      const constraints = parseConstraints(
        record['Measurements, max cm'],
        record['Shipment weight limits / min g'],
        record['Shipment weight limits / max g'],
        record['Shipment cost limit / min RUB'],
        record['Shipment cost limit / max RUB'],
        record['Shipment cost limit / min CNY'],
        record['Shipment cost limit / max CNY'],
      );

      return {
        carrierCode: 'CHINA_POST',
        deliveryMethodCode: codeFromName(`CHINA_POST ${deliveryMethod}`),
        displayName: deliveryMethod.replace(/\s*\([^)]*\)/g, '').trim(),
        officialSubtitle: deliveryMethod,
        originCountry: 'CN',
        warehouseType: 'seller_warehouse',
        salesScheme: 'realFBS',
        destinationCountry: 'RU',
        destinationCity: 'Moscow',
        deliveryTarget: deliveryTargetFromName(deliveryMethod),
        chargeBasis: 'physical',
        currency: 'CNY',
        includedWeightG: 0,
        fixedFee: rate.fixedFee,
        incrementUnitG: rate.incrementUnitG,
        incrementFee: rate.incrementFee,
        minFee: 0,
        maxFee: null,
        ozonHandlingFee: 0,
        extraFee: { type: 'fixed', value: 0 },
        deliveryDays: parseDays(record['Time-limits delivery to Moscow']),
        constraints: {
          ...constraints,
          batteryPolicy: parseBooleanPolicy(record.Batteries),
          liquidPolicy: parseBooleanPolicy(record.Liquids),
        },
        constraintPolicies: constraintPoliciesFor(constraints),
        tags: [],
        officialSource: {
          kind: 'xlsx',
          file: path.basename(SOURCES.chinaPost),
          sheet: 'China to Russia by CP',
          rate: rate.raw,
        },
        notes: 'Imported from Ozon official China Post XLSX.',
      };
    })
    .filter(Boolean);
}

function uniqueRules(rules) {
  const map = new Map();
  for (const rule of rules) {
    map.set(rule.deliveryMethodCode, rule);
  }
  return [...map.values()].sort((a, b) => {
    const carrier = a.carrierCode.localeCompare(b.carrierCode);
    if (carrier !== 0) return carrier;
    return a.displayName.localeCompare(b.displayName);
  });
}

function loadCalculatorCalibration() {
  try {
    return JSON.parse(readFileSync(CALIBRATION_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function applyCalculatorCalibration(rules, calibration) {
  if (!calibration) return rules;

  const serviceSamples = new Map();
  const excludedSamples = new Map();
  for (const sample of normalizeArray(calibration.samples)) {
    for (const deliveryMethodCode of normalizeArray(sample.excludedDeliveryMethodCodes)) {
      const existing = excludedSamples.get(deliveryMethodCode) || [];
      existing.push({
        sampleId: sample.sampleId,
        input: sample.input,
      });
      excludedSamples.set(deliveryMethodCode, existing);
    }

    for (const service of normalizeArray(sample.services)) {
      const existing = serviceSamples.get(service.deliveryMethodCode) || [];
      existing.push({
        sampleId: sample.sampleId,
        input: sample.input,
        ...service,
      });
      serviceSamples.set(service.deliveryMethodCode, existing);
    }
  }

  return rules.map((rule) => {
    const samples = serviceSamples.get(rule.deliveryMethodCode);
    const exclusions = excludedSamples.get(rule.deliveryMethodCode) || [];
    if (!samples?.length) {
      return {
        ...rule,
        sourceConfidence: 'xlsx_only',
        calculatorExcludedSamples: exclusions,
      };
    }

    const primarySample = samples[0];
    const variants = normalizeArray(primarySample.variants).map((variant) => ({
      variantCode: variant.variantCode,
      officialName: variant.officialName,
      deliveryTarget: variant.deliveryTarget,
      deliveryDays: variant.deliveryDays || null,
      deliveryTimeText: variant.deliveryTimeText || '',
      pickupText: variant.pickupText || '',
      chargeWeightText: variant.chargeWeightText || '',
      batteryPolicy: variant.batteryPolicy || rule.constraints?.batteryPolicy || 'unknown',
      badges: normalizeArray(variant.badges),
      source: {
        kind: 'official_calculator',
        sampleId: primarySample.sampleId,
      },
    }));

    const primaryDeliveryDays = variants.find((variant) => variant.deliveryDays)?.deliveryDays || rule.deliveryDays || null;
    const calculatorTags = new Set([
      ...normalizeArray(rule.tags),
      ...normalizeArray(primarySample.badges),
      ...variants.flatMap((variant) => normalizeArray(variant.badges)),
    ]);

    return {
      ...rule,
      officialDisplayName: primarySample.officialDisplayName || rule.displayName,
      displayName: primarySample.officialDisplayName || rule.displayName,
      deliveryDays: primaryDeliveryDays,
      sourceConfidence: 'official_calculator_verified',
      calculatorPriceSamples: samples.map((sample) => ({
        sampleId: sample.sampleId,
        input: sample.input,
        price: sample.calculatorPrice,
      })),
      calculatorExcludedSamples: exclusions,
      variants,
      tags: [...calculatorTags],
      officialSource: {
        ...rule.officialSource,
        calculatorCalibration: {
          file: path.basename(CALIBRATION_PATH),
          sampleIds: samples.map((sample) => sample.sampleId),
        },
      },
    };
  });
}

function main() {
  const commercialRules = parseCommercialChinaRules();
  const chinaPostRules = parseChinaPostRules();
  const calibration = loadCalculatorCalibration();
  const rules = applyCalculatorCalibration(uniqueRules([...chinaPostRules, ...commercialRules]), calibration);
  const payload = {
    meta: {
      updatedAt: new Date().toISOString(),
      source: 'Ozon official XLSX files',
      sourceFiles: Object.values(SOURCES).map((filePath) => path.relative(ROOT, filePath).replaceAll(path.sep, '/')),
      calculatorCalibration: calibration ? {
        file: path.relative(ROOT, CALIBRATION_PATH).replaceAll(path.sep, '/'),
        sampleCount: normalizeArray(calibration.samples).length,
        boundarySampleCount: normalizeArray(calibration.boundarySamples).length,
        weightBands: calibration.weightBands || [],
      } : null,
      notes: 'Generated by scripts/import-shipping-rules.mjs. Review before replacing config/shipping/rules.json.',
    },
    boundarySamples: calibration?.boundarySamples || [],
    methods: rules,
  };

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`shipping rules generated: ${rules.length}`);
  console.log(path.relative(ROOT, OUTPUT_PATH));
}

main();
