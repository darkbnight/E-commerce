import path from 'node:path';
import process from 'node:process';
import {
  DEFAULT_BASE_URL,
  OzonSellerClient,
  writeJsonFile,
} from './lib/ozon-seller-client.mjs';

const DEFAULT_VISIBILITY = 'ALL';
const DEFAULT_PAGE_LIMIT = 100;
const DEFAULT_INFO_BATCH_SIZE = 100;

function printUsage() {
  console.log(`
Ozon 店铺商品 JSON 导出

用法:
  node scripts/export-ozon-store-products.mjs --output data/ozon-store-products/products.json
  npm run ozon:store:export -- --max-items 50 --include-description

参数:
  --client-id             Ozon Client ID，也可用环境变量 OZON_CLIENT_ID
  --api-key               Ozon Api Key，也可用环境变量 OZON_API_KEY
  --base-url              默认 ${DEFAULT_BASE_URL}
  --output                输出 JSON 文件路径，默认写入 data/ozon-store-products/
  --visibility            默认 ALL；可按 Ozon filter.visibility 支持值覆盖
  --max-items             最多导出多少个商品；0 表示不限制，默认 0
  --page-limit            每页拉取数量，默认 ${DEFAULT_PAGE_LIMIT}
  --include-description   逐个调用 /v1/product/info/description 补商品描述

输出:
  raw_items               每个商品的原始 info / attributes / description 返回
  import_items            尽量整理成 /v2/product/import 可参考的 items 结构
`.trim());
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }
  return args;
}

function toInteger(value, fallbackValue) {
  if (value == null || value === '') return fallbackValue;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.filter((value) => value != null && value !== ''))];
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function createClient(args) {
  return new OzonSellerClient({
    clientId: args['client-id'] || process.env.OZON_CLIENT_ID,
    apiKey: args['api-key'] || process.env.OZON_API_KEY,
    baseUrl: args['base-url'] || process.env.OZON_BASE_URL || DEFAULT_BASE_URL,
  });
}

function getResult(payload) {
  return payload?.result ?? payload ?? {};
}

function getItems(payload) {
  const result = getResult(payload);
  if (Array.isArray(result)) return result;
  return ensureArray(result.items ?? payload?.items);
}

function getLastId(payload) {
  const result = getResult(payload);
  return result.last_id || payload?.last_id || '';
}

function getProductId(item) {
  return item?.id ?? item?.product_id ?? item?.productId ?? null;
}

function getOfferId(item) {
  return item?.offer_id ?? item?.offerId ?? '';
}

function buildProductKey(item) {
  const productId = getProductId(item);
  if (productId != null) return `product:${productId}`;
  const offerId = getOfferId(item);
  return offerId ? `offer:${offerId}` : '';
}

function compactObject(input) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => {
    if (value == null || value === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }));
}

function pickFirst(...values) {
  return values.find((value) => value != null && value !== '');
}

function normalizeImageList(value) {
  return ensureArray(value)
    .map((image) => {
      if (typeof image === 'string') return image;
      return image?.file_name || image?.url || image?.image_url || '';
    })
    .filter(Boolean);
}

function normalizeAttributeValues(values) {
  return ensureArray(values)
    .map((value) => compactObject({
      dictionary_value_id: value?.dictionary_value_id ?? value?.dictionaryValueId,
      value: value?.value == null ? '' : String(value.value),
    }))
    .filter((value) => value.dictionary_value_id != null || value.value);
}

function normalizeImportAttributes(attributes) {
  return ensureArray(attributes)
    .map((attribute) => compactObject({
      id: attribute?.id ?? attribute?.attribute_id,
      complex_id: attribute?.complex_id ?? attribute?.complexId ?? attribute?.attribute_complex_id ?? 0,
      values: normalizeAttributeValues(attribute?.values),
    }))
    .filter((attribute) => attribute.id && ensureArray(attribute.values).length);
}

function buildImportItem({ attributesItem, infoItem, descriptionItem }) {
  const info = infoItem || {};
  const attributes = attributesItem || {};
  const description = getResult(descriptionItem);

  return compactObject({
    offer_id: pickFirst(attributes.offer_id, info.offer_id, description.offer_id),
    name: pickFirst(attributes.name, info.name),
    description: pickFirst(description.description, attributes.description, info.description),
    description_category_id: pickFirst(attributes.description_category_id, info.description_category_id),
    type_id: pickFirst(attributes.type_id, info.type_id),
    price: pickFirst(info.price, attributes.price),
    old_price: pickFirst(info.old_price, attributes.old_price),
    premium_price: pickFirst(info.premium_price, attributes.premium_price),
    min_price: pickFirst(info.min_price, attributes.min_price),
    currency_code: pickFirst(info.currency_code, attributes.currency_code),
    vat: pickFirst(attributes.vat, info.vat),
    barcode: pickFirst(attributes.barcode, info.barcode),
    depth: pickFirst(attributes.depth, info.depth),
    width: pickFirst(attributes.width, info.width),
    height: pickFirst(attributes.height, info.height),
    dimension_unit: pickFirst(attributes.dimension_unit, info.dimension_unit),
    weight: pickFirst(attributes.weight, info.weight),
    weight_unit: pickFirst(attributes.weight_unit, info.weight_unit),
    images: normalizeImageList(pickFirst(attributes.images, info.images)),
    primary_image: pickFirst(attributes.primary_image, info.primary_image),
    images360: normalizeImageList(pickFirst(attributes.images360, info.images360)),
    color_image: pickFirst(attributes.color_image, info.color_image),
    attributes: normalizeImportAttributes(attributes.attributes),
    complex_attributes: ensureArray(attributes.complex_attributes),
  });
}

async function fetchAllListedProducts(client, {
  visibility,
  pageLimit,
  maxItems,
}) {
  const items = [];
  let lastId = '';

  do {
    const remaining = maxItems > 0 ? maxItems - items.length : pageLimit;
    if (maxItems > 0 && remaining <= 0) break;

    const response = await client.getProductList({
      filter: { visibility },
      lastId,
      limit: Math.min(pageLimit, remaining),
    });
    const pageItems = getItems(response);
    items.push(...pageItems);
    lastId = getLastId(response);

    if (!lastId || pageItems.length === 0) break;
  } while (true);

  return maxItems > 0 ? items.slice(0, maxItems) : items;
}

async function fetchAttributeItems(client, listedItems) {
  const productIds = unique(listedItems.map(getProductId));
  const offerIds = unique(listedItems.map(getOfferId));
  const attributeItems = [];

  if (productIds.length) {
    for (const ids of chunk(productIds, DEFAULT_INFO_BATCH_SIZE)) {
      const filter = { product_id: ids };
      try {
        const response = await client.getProductInfoAttributes({ filter, limit: ids.length });
        attributeItems.push(...getItems(response));
      } catch (error) {
        if (error.status !== 404) throw error;
        const response = await client.getProductInfoAttributesV3({ filter, limit: ids.length });
        attributeItems.push(...getItems(response));
      }
    }
    return attributeItems;
  }

  for (const ids of chunk(offerIds, DEFAULT_INFO_BATCH_SIZE)) {
    const filter = { offer_id: ids };
    try {
      const response = await client.getProductInfoAttributes({ filter, limit: ids.length });
      attributeItems.push(...getItems(response));
    } catch (error) {
      if (error.status !== 404) throw error;
      const response = await client.getProductInfoAttributesV3({ filter, limit: ids.length });
      attributeItems.push(...getItems(response));
    }
  }

  return attributeItems;
}

async function fetchInfoItems(client, sourceItems) {
  const productIds = unique(sourceItems.map(getProductId));
  const offerIds = unique(sourceItems.map(getOfferId));
  const infoItems = [];

  if (productIds.length) {
    for (const ids of chunk(productIds, DEFAULT_INFO_BATCH_SIZE)) {
      const response = await client.getProductInfoList({ productIds: ids });
      infoItems.push(...getItems(response));
    }
    return infoItems;
  }

  for (const ids of chunk(offerIds, DEFAULT_INFO_BATCH_SIZE)) {
    const response = await client.getProductInfoList({ offerIds: ids });
    infoItems.push(...getItems(response));
  }
  return infoItems;
}

async function fetchDescriptionItems(client, attributeItems) {
  const descriptions = [];
  for (const item of attributeItems) {
    const offerId = getOfferId(item);
    const productId = getProductId(item);
    try {
      const response = await client.getProductInfoDescription({ offerId, productId });
      descriptions.push({
        key: buildProductKey(item),
        response,
      });
    } catch (error) {
      descriptions.push({
        key: buildProductKey(item),
        error: {
          message: error.message,
          status: error.status,
          body: error.body,
        },
      });
    }
  }
  return descriptions;
}

function mapByKey(items) {
  return new Map(items.map((item) => [buildProductKey(item), item]).filter(([key]) => key));
}

function buildOutput({
  args,
  visibility,
  listedItems,
  attributeItems,
  infoItems,
  descriptionItems,
}) {
  const listedByKey = mapByKey(listedItems);
  const attributesByKey = mapByKey(attributeItems);
  const infoByKey = mapByKey(infoItems);
  const descriptionByKey = new Map(descriptionItems.map((item) => [item.key, item]));
  const sourceItems = attributeItems.length ? attributeItems : listedItems;

  const rawItems = sourceItems.map((sourceItem) => {
    const key = buildProductKey(sourceItem);
    const attributesItem = attributesByKey.get(key) || null;
    const listedItem = listedByKey.get(key) || null;
    return {
      key,
      product_id: getProductId(attributesItem || listedItem || sourceItem),
      offer_id: getOfferId(attributesItem || listedItem || sourceItem),
      product_list_item: listedItem,
      attributes_response_item: attributesItem,
      info_response_item: infoByKey.get(key) || null,
      description_response: descriptionByKey.get(key)?.response || null,
      description_error: descriptionByKey.get(key)?.error || null,
    };
  });

  return {
    meta: {
      exported_at: new Date().toISOString(),
      source: 'Ozon Seller API',
      visibility,
      include_description: Boolean(args['include-description']),
      total_items: rawItems.length,
      endpoints: [
        '/v3/product/list',
        '/v4/product/info/attributes',
        '/v3/products/info/attributes',
        '/v3/product/info/list',
        ...(args['include-description'] ? ['/v1/product/info/description'] : []),
      ],
    },
    raw_items: rawItems,
    import_items: rawItems.map((item) => buildImportItem({
      attributesItem: item.attributes_response_item,
      infoItem: item.info_response_item,
      descriptionItem: item.description_response,
    })),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    return;
  }

  const client = createClient(args);
  const visibility = String(args.visibility || DEFAULT_VISIBILITY);
  const pageLimit = Math.min(Math.max(toInteger(args['page-limit'], DEFAULT_PAGE_LIMIT), 1), 1000);
  const maxItems = Math.max(toInteger(args['max-items'], 0), 0);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.resolve(
    args.output || path.join('data', 'ozon-store-products', `store-products-${timestamp}.json`)
  );

  const listedItems = await fetchAllListedProducts(client, { visibility, pageLimit, maxItems });
  const attributeItems = await fetchAttributeItems(client, listedItems);
  const infoItems = await fetchInfoItems(client, attributeItems.length ? attributeItems : listedItems);
  const descriptionItems = args['include-description']
    ? await fetchDescriptionItems(client, attributeItems.length ? attributeItems : listedItems)
    : [];

  const output = buildOutput({
    args,
    visibility,
    listedItems,
    attributeItems,
    infoItems,
    descriptionItems,
  });

  await writeJsonFile(outputPath, output);
  console.log(JSON.stringify({
    ok: true,
    output: outputPath,
    totalItems: output.meta.total_items,
    importItems: output.import_items.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
    status: error.status,
    endpoint: error.endpoint,
    body: error.body,
  }, null, 2));
  process.exitCode = 1;
});
