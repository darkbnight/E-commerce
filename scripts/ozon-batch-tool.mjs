import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  buildTemplate,
  OzonSellerClient,
  readJsonFile,
  writeJsonFile,
  loadItemsPayload,
  validatePriceItems,
  validateProductItems,
  validateStockItems,
} from './lib/ozon-seller-client.mjs';

function printUsage() {
  console.log(`
Ozon 批量上货工具

用法:
  node scripts/ozon-batch-tool.mjs template --kind products --output data/ozon-upload/products.example.json
  node scripts/ozon-batch-tool.mjs validate --input data/ozon-upload/products.json
  node scripts/ozon-batch-tool.mjs upload --input data/ozon-upload/products.json --report data/ozon-upload/report.json
  node scripts/ozon-batch-tool.mjs import-info --task-id 123456
  node scripts/ozon-batch-tool.mjs category-tree --output data/ozon-upload/category-tree.json
  node scripts/ozon-batch-tool.mjs category-attributes --description-category-id 17031663 --type-id 100001234 --output data/ozon-upload/category-17031663-attrs.json
  node scripts/ozon-batch-tool.mjs attribute-values --description-category-id 17031663 --type-id 100001234 --attribute-id 85
  node scripts/ozon-batch-tool.mjs prices --input data/ozon-upload/prices.json
  node scripts/ozon-batch-tool.mjs stocks --input data/ozon-upload/stocks.json

公共参数:
  --client-id     Ozon Client ID，也可用环境变量 OZON_CLIENT_ID
  --api-key       Ozon Api Key，也可用环境变量 OZON_API_KEY
  --base-url      默认 https://api-seller.ozon.ru

说明:
  - upload 会自动按每批 100 条分片上传
  - validate 只做本地结构校验，不请求 Ozon
  - 如果只是核对入参，先用 --dry-run
`.trim());
}

function parseArgs(argv) {
  const [command = 'help', ...rest] = argv;
  const args = { _: [] };

  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];
    if (!current.startsWith('--')) {
      args._.push(current);
      continue;
    }

    const key = current.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return { command, args };
}

function fail(message, details) {
  console.error(`[失败] ${message}`);
  if (details) {
    console.error(JSON.stringify(details, null, 2));
  }
}

function toInt(value, fieldName) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} 必须是正整数`);
  }
  return parsed;
}

function createClient(args) {
  return new OzonSellerClient({
    clientId: args['client-id'] || process.env.OZON_CLIENT_ID,
    apiKey: args['api-key'] || process.env.OZON_API_KEY,
    baseUrl: args['base-url'] || process.env.OZON_BASE_URL,
  });
}

async function handleTemplate(args) {
  const kind = String(args.kind || 'products');
  const output = args.output || path.join('data', 'ozon-upload', `${kind}.example.json`);
  const payload = buildTemplate(kind);
  await writeJsonFile(output, payload);
  console.log(`[完成] 模板已写入 ${path.resolve(output)}`);
}

async function loadInputItems(inputPath) {
  const payload = await readJsonFile(inputPath);
  return loadItemsPayload(payload);
}

async function handleValidate(args) {
  if (!args.input) {
    throw new Error('validate 需要 --input');
  }

  const items = await loadInputItems(args.input);
  const mode = String(args.mode || 'products');

  const result =
    mode === 'prices' ? validatePriceItems(items) :
    mode === 'stocks' ? validateStockItems(items) :
    validateProductItems(items);

  console.log(JSON.stringify({
    input: path.resolve(args.input),
    mode,
    itemCount: items.length,
    ...result,
  }, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

async function handleUpload(args) {
  if (!args.input) {
    throw new Error('upload 需要 --input');
  }

  const items = await loadInputItems(args.input);
  const validation = validateProductItems(items);

  if (!validation.ok) {
    fail('商品数据校验未通过，已终止上传', validation);
    return;
  }

  const report = {
    mode: args['dry-run'] ? 'dry-run' : 'upload',
    input: path.resolve(args.input),
    itemCount: items.length,
    warnings: validation.warnings,
    startedAt: new Date().toISOString(),
  };

  if (args['dry-run']) {
    report.finishedAt = new Date().toISOString();
    report.result = {
      batchCount: Math.ceil(items.length / 100),
      totalItems: items.length,
    };
  } else {
    const client = createClient(args);
    report.result = await client.uploadProducts(items);
    report.finishedAt = new Date().toISOString();
  }

  if (args.report) {
    await writeJsonFile(args.report, report);
  }

  console.log(JSON.stringify(report, null, 2));
}

async function handleImportInfo(args) {
  const taskId = toInt(args['task-id'], 'task-id');
  const client = createClient(args);
  const result = await client.getImportInfo(taskId);
  console.log(JSON.stringify(result, null, 2));
}

async function handleCategoryTree(args) {
  const client = createClient(args);
  const result = await client.getCategoryTree();
  if (args.output) {
    await writeJsonFile(args.output, result);
  }
  console.log(JSON.stringify(result, null, 2));
}

async function handleCategoryAttributes(args) {
  const descriptionCategoryId = toInt(args['description-category-id'] || args['category-id'], 'description-category-id');
  const typeId = toInt(args['type-id'], 'type-id');
  const client = createClient(args);
  const result = await client.getCategoryAttributes({
    descriptionCategoryId,
    typeId,
    language: String(args.language || 'DEFAULT'),
  });
  if (args.output) {
    await writeJsonFile(args.output, result);
  }
  console.log(JSON.stringify(result, null, 2));
}

async function handleAttributeValues(args) {
  const descriptionCategoryId = toInt(args['description-category-id'] || args['category-id'], 'description-category-id');
  const typeId = toInt(args['type-id'], 'type-id');
  const attributeId = toInt(args['attribute-id'], 'attribute-id');
  const client = createClient(args);
  const result = await client.getCategoryAttributeValues({
    descriptionCategoryId,
    typeId,
    attributeId,
    language: String(args.language || 'DEFAULT'),
    lastValueId: Number.parseInt(String(args['last-value-id'] || '0'), 10) || 0,
    limit: Number.parseInt(String(args.limit || '50'), 10) || 50,
  });
  if (args.output) {
    await writeJsonFile(args.output, result);
  }
  console.log(JSON.stringify(result, null, 2));
}

async function handlePrices(args) {
  if (!args.input) {
    throw new Error('prices 需要 --input');
  }

  const items = await loadInputItems(args.input);
  const validation = validatePriceItems(items);
  if (!validation.ok) {
    fail('价格数据校验未通过', validation);
    return;
  }

  if (args['dry-run']) {
    console.log(JSON.stringify({
      mode: 'prices',
      dryRun: true,
      input: path.resolve(args.input),
      itemCount: items.length,
    }, null, 2));
    return;
  }

  const client = createClient(args);
  const result = await client.importPrices(items);
  console.log(JSON.stringify(result, null, 2));
}

async function handleStocks(args) {
  if (!args.input) {
    throw new Error('stocks 需要 --input');
  }

  const items = await loadInputItems(args.input);
  const validation = validateStockItems(items);
  if (!validation.ok) {
    fail('库存数据校验未通过', validation);
    return;
  }

  if (args['dry-run']) {
    console.log(JSON.stringify({
      mode: 'stocks',
      dryRun: true,
      input: path.resolve(args.input),
      itemCount: items.length,
    }, null, 2));
    return;
  }

  const client = createClient(args);
  const result = await client.updateStocks(items);
  console.log(JSON.stringify(result, null, 2));
}

const handlers = {
  help: async () => printUsage(),
  template: handleTemplate,
  validate: handleValidate,
  upload: handleUpload,
  'import-info': handleImportInfo,
  'category-tree': handleCategoryTree,
  'category-attributes': handleCategoryAttributes,
  'attribute-values': handleAttributeValues,
  prices: handlePrices,
  stocks: handleStocks,
};

export async function main(argv = process.argv.slice(2)) {
  try {
    const { command, args } = parseArgs(argv);
    const handler = handlers[command] || handlers.help;
    await handler(args);
    return 0;
  } catch (error) {
    fail(error.message, error.body);
    return 1;
  }
}

const isMainModule =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const exitCode = await main();
  process.exitCode = exitCode;
}
