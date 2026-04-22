import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

const SAMPLE_PRODUCTS = [
  { name: '80g thin item', weight: 80, priceRub: 82, l: 21, w: 20, h: 1.4 },
  { name: '300g low price', weight: 300, priceRub: 1300, l: 18, w: 12, h: 6 },
  { name: '800g low price', weight: 800, priceRub: 1300, l: 25, w: 18, h: 10 },
  { name: '1500g mid price', weight: 1500, priceRub: 3500, l: 35, w: 25, h: 12 },
  { name: '3000g mid price', weight: 3000, priceRub: 3500, l: 45, w: 30, h: 18 },
  { name: '4000g premium', weight: 4000, priceRub: 9000, l: 50, w: 35, h: 20 },
  { name: '7000g premium', weight: 7000, priceRub: 9000, l: 60, w: 40, h: 28 },
];

const CEL_IDS = [
  1, 2, 3, 4,
  5, 6, 7, 100,
  101, 102, 103,
  104, 105,
  106, 107, 108,
  109, 110, 111,
  112, 113, 114,
];

function billingGroup(sample) {
  if (sample.priceRub <= 1500 && sample.weight <= 500) return 'Extra Small';
  if (sample.priceRub <= 1500) return 'Budget';
  if (sample.priceRub <= 7000 && sample.weight <= 2000) return 'Small';
  if (sample.priceRub <= 7000) return 'Big';
  if (sample.weight <= 5000) return 'Premium Small';
  return 'Premium Big';
}

function chargeWeight(logistic, sample) {
  let volumetric = 0;
  if (logistic.cargoWeightFactor > 0 && sample.l && sample.w && sample.h) {
    volumetric = (sample.l * sample.w * sample.h / logistic.cargoWeightFactor) * 1000;
  }
  const raw = Math.max(sample.weight, volumetric);
  const unit = logistic.roundUp === 2 ? 1000 : 100;
  return {
    actual: sample.weight,
    volumetric,
    charged: Math.ceil(raw / unit) * unit,
    unit,
  };
}

function fee(logistic, sample, deliveryType = 1) {
  const weight = chargeWeight(logistic, sample);
  const isDoor = deliveryType === 2;
  const lifting = isDoor && logistic.byWeightDTD > 0 ? logistic.liftingPriceDTD : logistic.liftingPrice;
  const rate = isDoor && logistic.byWeightDTD > 0 ? logistic.byWeightDTD : logistic.byWeight;
  return {
    ...weight,
    fee: lifting + (weight.charged / 100) * rate,
    lifting,
    rate,
  };
}

function fmt(n) {
  return n.toFixed(2).padStart(8, ' ');
}

async function main() {
  const raw = await readFile(path.join(ROOT, 'data', 'logistics.json'), 'utf8');
  const logistics = JSON.parse(raw).items
    .filter((item) => CEL_IDS.includes(item.logId))
    .sort((a, b) => CEL_IDS.indexOf(a.logId) - CEL_IDS.indexOf(b.logId));

  console.log('CEL logistics sanity check');
  console.log('Rule: roundUp 0/1 => 100g, roundUp 2 => 1000g; fee = lifting + charged/100 * byWeight.');
  console.log('');

  for (const sample of SAMPLE_PRODUCTS) {
    console.log(`## ${sample.name} | ${sample.weight}g | ₽${sample.priceRub} | ${billingGroup(sample)}`);
    console.log('id'.padEnd(5), 'name'.padEnd(42), 'charged'.padStart(8), 'pickup'.padStart(9), 'door'.padStart(9));
    for (const logistic of logistics) {
      const pickup = fee(logistic, sample, 1);
      const door = fee(logistic, sample, 2);
      console.log(
        String(logistic.logId).padEnd(5),
        logistic.name.slice(0, 42).padEnd(42),
        `${pickup.charged}g`.padStart(8),
        fmt(pickup.fee),
        fmt(door.fee),
      );
    }
    console.log('');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
