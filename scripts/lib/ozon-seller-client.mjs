import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_BASE_URL = 'https://api-seller.ozon.ru';
export const MAX_IMPORT_ITEMS = 100;
export const OZON_DEFAULT_LANGUAGE = 'ZH_HANS';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureString(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function ensurePositiveInteger(value) {
  const normalized = Number.parseInt(String(value), 10);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

function ensureNonNegativeInteger(value) {
  const normalized = Number.parseInt(String(value), 10);
  return Number.isInteger(normalized) && normalized >= 0 ? normalized : null;
}

export async function readJsonFile(filePath) {
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content);
}

export async function writeJsonFile(filePath, payload) {
  const targetPath = path.resolve(filePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export function chunkItems(items, size = MAX_IMPORT_ITEMS) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function loadItemsPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (isObject(payload) && Array.isArray(payload.items)) {
    return payload.items;
  }
  return [];
}

function validateAttribute(attribute, itemIndex, attributeIndex, errors) {
  if (!isObject(attribute)) {
    errors.push(`items[${itemIndex}].attributes[${attributeIndex}] 必须是对象`);
    return;
  }

  if (!ensurePositiveInteger(attribute.id)) {
    errors.push(`items[${itemIndex}].attributes[${attributeIndex}].id 必须是正整数`);
  }

  const values = ensureArray(attribute.values);
  if (values.length === 0) {
    errors.push(`items[${itemIndex}].attributes[${attributeIndex}].values 不能为空`);
  }

  const complexId = attribute.complex_id;
  if (complexId != null && ensureNonNegativeInteger(complexId) == null) {
    errors.push(`items[${itemIndex}].attributes[${attributeIndex}].complex_id 必须是大于等于 0 的整数`);
  }

  values.forEach((value, valueIndex) => {
    if (!isObject(value)) {
      errors.push(`items[${itemIndex}].attributes[${attributeIndex}].values[${valueIndex}] 必须是对象`);
      return;
    }

    const textValue = ensureString(value.value).trim();
    const dictionaryValueId = value.dictionary_value_id == null
      ? null
      : ensurePositiveInteger(value.dictionary_value_id);

    if (!textValue && !dictionaryValueId) {
      errors.push(`items[${itemIndex}].attributes[${attributeIndex}].values[${valueIndex}] 至少需要 value 或 dictionary_value_id`);
    }

    if (value.dictionary_value_id != null && !dictionaryValueId) {
      errors.push(`items[${itemIndex}].attributes[${attributeIndex}].values[${valueIndex}].dictionary_value_id 必须是正整数`);
    }
  });
}

export function validateProductItems(items) {
  const errors = [];

  if (!Array.isArray(items) || items.length === 0) {
    return {
      ok: false,
      errors: ['items 不能为空'],
      warnings: [],
    };
  }

  if (items.length > 1000) {
    errors.push('单个输入文件建议不超过 1000 条商品，避免一次执行过大');
  }

  const warnings = [];
  const seenOfferIds = new Set();

  items.forEach((item, itemIndex) => {
    if (!isObject(item)) {
      errors.push(`items[${itemIndex}] 必须是对象`);
      return;
    }

    const offerId = ensureString(item.offer_id).trim();
    const name = ensureString(item.name).trim();
    const price = ensureString(item.price).trim();
    const vat = ensureString(item.vat).trim();
    const descriptionCategoryId = ensurePositiveInteger(item.description_category_id);
    const typeId = ensurePositiveInteger(item.type_id);
    const depth = ensurePositiveInteger(item.depth);
    const width = ensurePositiveInteger(item.width);
    const height = ensurePositiveInteger(item.height);
    const weight = ensurePositiveInteger(item.weight);
    const dimensionUnit = ensureString(item.dimension_unit).trim();
    const weightUnit = ensureString(item.weight_unit).trim();
    const images = ensureArray(item.images);
    const attributes = ensureArray(item.attributes);

    if (!offerId) {
      errors.push(`items[${itemIndex}].offer_id 不能为空`);
    } else if (seenOfferIds.has(offerId)) {
      errors.push(`items[${itemIndex}].offer_id 重复: ${offerId}`);
    } else {
      seenOfferIds.add(offerId);
    }

    if (!name) {
      errors.push(`items[${itemIndex}].name 不能为空`);
    }

    if (!descriptionCategoryId) {
      errors.push(`items[${itemIndex}].description_category_id 必须是正整数`);
    }

    if (!typeId) {
      errors.push(`items[${itemIndex}].type_id 必须是正整数`);
    }

    if (!price) {
      errors.push(`items[${itemIndex}].price 不能为空`);
    }

    if (!vat) {
      errors.push(`items[${itemIndex}].vat 不能为空`);
    }

    if (images.length === 0) {
      errors.push(`items[${itemIndex}].images 至少需要 1 张图片`);
    }

    if (!depth) {
      errors.push(`items[${itemIndex}].depth 必须是正整数`);
    }

    if (!width) {
      errors.push(`items[${itemIndex}].width 必须是正整数`);
    }

    if (!height) {
      errors.push(`items[${itemIndex}].height 必须是正整数`);
    }

    if (!dimensionUnit) {
      errors.push(`items[${itemIndex}].dimension_unit 不能为空`);
    }

    if (!weight) {
      errors.push(`items[${itemIndex}].weight 必须是正整数`);
    }

    if (!weightUnit) {
      errors.push(`items[${itemIndex}].weight_unit 不能为空`);
    }

    if (attributes.length === 0) {
      errors.push(`items[${itemIndex}].attributes 至少需要 1 个属性`);
    }

    attributes.forEach((attribute, attributeIndex) => {
      validateAttribute(attribute, itemIndex, attributeIndex, errors);
    });

    if (!item.currency_code) {
      warnings.push(`items[${itemIndex}] 未填写 currency_code，将由 Ozon 或接口默认值决定`);
    }

    if (!item.description) {
      warnings.push(`items[${itemIndex}] 未填写 description，可能影响审核和转化`);
    }
  });

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function validatePriceItems(items) {
  const errors = [];

  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, errors: ['items 不能为空'] };
  }

  items.forEach((item, itemIndex) => {
    if (!isObject(item)) {
      errors.push(`items[${itemIndex}] 必须是对象`);
      return;
    }

    if (!ensureString(item.offer_id).trim() && !ensurePositiveInteger(item.product_id)) {
      errors.push(`items[${itemIndex}] 必须提供 offer_id 或 product_id`);
    }

    if (!ensureString(item.price).trim()) {
      errors.push(`items[${itemIndex}].price 不能为空`);
    }
  });

  return { ok: errors.length === 0, errors };
}

export function validateStockItems(items) {
  const errors = [];

  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, errors: ['items 不能为空'] };
  }

  items.forEach((item, itemIndex) => {
    if (!isObject(item)) {
      errors.push(`items[${itemIndex}] 必须是对象`);
      return;
    }

    const offerId = ensureString(item.offer_id).trim();
    const productId = ensurePositiveInteger(item.product_id);
    const stock = Number.parseInt(String(item.stock ?? ''), 10);
    const warehouseId = ensurePositiveInteger(item.warehouse_id);

    if (!offerId && !productId) {
      errors.push(`items[${itemIndex}] 必须提供 offer_id 或 product_id`);
    }

    if (!Number.isInteger(stock) || stock < 0) {
      errors.push(`items[${itemIndex}].stock 必须是大于等于 0 的整数`);
    }

    if (!warehouseId) {
      errors.push(`items[${itemIndex}].warehouse_id 必须是正整数`);
    }
  });

  return { ok: errors.length === 0, errors };
}

export function buildTemplate(kind = 'products') {
  const templates = {
    products: {
      items: [
        {
          offer_id: 'CLOTH-30X40-2PK-GREY',
          name: 'Cleaning Cloth Microfiber 30x40 cm 2 pcs Grey',
          description: 'Reusable cleaning cloth for kitchen and household use.',
          description_category_id: 17031663,
          type_id: 100001234,
          price: '199',
          old_price: '259',
          premium_price: '189',
          currency_code: 'CNY',
          vat: '0',
          barcode: '2000000000011',
          depth: 3,
          width: 20,
          height: 30,
          dimension_unit: 'mm',
          weight: 120,
          weight_unit: 'g',
          images: [
            'https://example.com/cloth-main.jpg',
            'https://example.com/cloth-detail.jpg'
          ],
          attributes: [
            {
              id: 85,
              complex_id: 0,
              values: [{ value: 'Generic' }]
            },
            {
              id: 8229,
              complex_id: 0,
              values: [{ value: '2' }]
            }
          ]
        }
      ]
    },
    prices: {
      items: [
        {
          offer_id: 'CLOTH-30X40-2PK-GREY',
          price: '199',
          old_price: '259',
          premium_price: '189',
          currency_code: 'CNY',
          min_price: '179'
        }
      ]
    },
    stocks: {
      items: [
        {
          offer_id: 'CLOTH-30X40-2PK-GREY',
          warehouse_id: 123456789,
          stock: 50
        }
      ]
    }
  };

  if (kind === 'all') {
    return templates;
  }

  return templates[kind] ?? templates.products;
}

export class OzonSellerClient {
  constructor({
    clientId,
    apiKey,
    baseUrl = DEFAULT_BASE_URL,
    fetchImpl = globalThis.fetch,
  }) {
    this.clientId = clientId;
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
  }

  ensureCredentials() {
    if (!this.clientId || !this.apiKey) {
      throw new Error('缺少 Ozon 凭证，请提供 --client-id / --api-key 或设置 OZON_CLIENT_ID / OZON_API_KEY');
    }
  }

  async request(endpoint, payload = {}) {
    this.ensureCredentials();

    const response = await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Client-Id': this.clientId,
        'Api-Key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const rawText = await response.text();
    let body;

    try {
      body = rawText ? JSON.parse(rawText) : {};
    } catch {
      body = { rawText };
    }

    if (!response.ok) {
      const error = new Error(`Ozon API 请求失败: ${response.status} ${response.statusText}`);
      error.status = response.status;
      error.body = body;
      throw error;
    }

    return body;
  }

  async getCategoryTree({ language = OZON_DEFAULT_LANGUAGE } = {}) {
    return this.request('/v1/description-category/tree', {
      language,
    });
  }

  async getCategoryAttributes({ descriptionCategoryId, typeId, language = OZON_DEFAULT_LANGUAGE }) {
    return this.request('/v1/description-category/attribute', {
      description_category_id: descriptionCategoryId,
      type_id: typeId,
      language,
    });
  }

  async getCategoryAttributeValues({
    attributeId,
    descriptionCategoryId,
    typeId,
    language = OZON_DEFAULT_LANGUAGE,
    lastValueId = 0,
    limit = 50
  }) {
    return this.request('/v1/description-category/attribute/values', {
      attribute_id: attributeId,
      description_category_id: descriptionCategoryId,
      type_id: typeId,
      language,
      last_value_id: lastValueId,
      limit,
    });
  }

  async getProductList({
    filter = {},
    lastId = '',
    limit = 1000,
  } = {}) {
    return this.request('/v3/product/list', {
      filter,
      last_id: lastId,
      limit,
    });
  }

  async getProductInfoList({
    offerIds = [],
    productIds = [],
    skus = [],
  } = {}) {
    const payload = {};
    if (offerIds.length) payload.offer_id = offerIds;
    if (productIds.length) payload.product_id = productIds;
    if (skus.length) payload.sku = skus;
    return this.request('/v3/product/info/list', payload);
  }

  async getProductInfoAttributes({
    filter = {},
    lastId = '',
    limit = 100,
    sortDir = 'ASC',
  } = {}) {
    return this.request('/v4/product/info/attributes', {
      filter,
      last_id: lastId,
      limit,
      sort_dir: sortDir,
    });
  }

  async getProductInfoDescription({ offerId = '', productId = null } = {}) {
    const payload = {};
    if (offerId) payload.offer_id = offerId;
    if (productId != null) payload.product_id = productId;
    return this.request('/v1/product/info/description', payload);
  }

  async uploadProducts(items) {
    const batches = chunkItems(items, MAX_IMPORT_ITEMS);
    const results = [];

    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      const response = await this.request('/v3/product/import', { items: batch });
      results.push({
        batchIndex: index + 1,
        itemCount: batch.length,
        response,
      });
    }

    return {
      batchCount: batches.length,
      totalItems: items.length,
      results,
    };
  }

  async getImportInfo(taskId) {
    return this.request('/v1/product/import/info', {
      task_id: taskId,
    });
  }

  async importPrices(items) {
    return this.request('/v1/product/import/prices', { prices: items });
  }

  async updateStocks(items) {
    return this.request('/v2/products/stocks', { stocks: items });
  }
}
