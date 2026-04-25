import { createHash } from 'node:crypto';

export const PRODUCT_CONTENT_TARGET = {
  pageName: '萌拉商品内容资产',
  pageType: 'product_content_assets',
  paginationMode: 'single_record',
  targetUrl: 'https://ozon.menglar.com/workbench/storeanalysis/store/addGoods',
};

export function ensureProductContentTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_content_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_job_id INTEGER,
      platform TEXT NOT NULL DEFAULT 'ozon',
      platform_product_id TEXT NOT NULL,
      product_url TEXT,
      title TEXT,
      description TEXT,
      tags_json TEXT,
      main_image_url TEXT,
      image_urls_json TEXT,
      content_hash TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(platform, platform_product_id, content_hash)
    );

    CREATE INDEX IF NOT EXISTS idx_product_content_assets_product
    ON product_content_assets(platform, platform_product_id);

    CREATE INDEX IF NOT EXISTS idx_product_content_assets_source_job
    ON product_content_assets(source_job_id);

    CREATE INDEX IF NOT EXISTS idx_product_content_assets_captured_at
    ON product_content_assets(captured_at);

    CREATE TABLE IF NOT EXISTS product_content_skus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_asset_id INTEGER NOT NULL,
      source_job_id INTEGER,
      platform TEXT NOT NULL DEFAULT 'ozon',
      platform_product_id TEXT NOT NULL,
      platform_sku_id TEXT NOT NULL,
      sku_name TEXT,
      price REAL,
      currency_code TEXT,
      images_json TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      captured_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(content_asset_id, platform_sku_id)
    );

    CREATE INDEX IF NOT EXISTS idx_product_content_skus_content_asset
    ON product_content_skus(content_asset_id);

    CREATE INDEX IF NOT EXISTS idx_product_content_skus_product
    ON product_content_skus(platform, platform_product_id);

    CREATE INDEX IF NOT EXISTS idx_product_content_skus_source_job
    ON product_content_skus(source_job_id);
  `);
}

function findAttributeValue(detail, attributeId) {
  const key = String(attributeId);
  const mapValue = detail?.attrValueMap?.[key]?.values;
  if (mapValue != null) return mapValue;

  const attribute = Array.isArray(detail?.attributes)
    ? detail.attributes.find((item) => String(item?.id) === key)
    : null;
  if (!attribute) return null;
  if (!Array.isArray(attribute.values) || attribute.values.length === 0) return null;

  if (attribute.values.length === 1) {
    const first = attribute.values[0];
    return first?.value ?? first?.dictionary_value_id ?? null;
  }

  return attribute.values.map((item) => item?.value ?? item?.dictionary_value_id ?? null).filter((item) => item != null);
}

function toNullableText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function toNullableNumber(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function extractTags(rawValue) {
  if (rawValue == null) return [];
  const values = Array.isArray(rawValue) ? rawValue : [rawValue];
  const tags = [];

  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (!text) continue;

    const matchedTags = text.match(/#[^#,\s，；;]+/g);
    if (matchedTags?.length) {
      tags.push(...matchedTags.map((item) => item.trim()).filter(Boolean));
      continue;
    }

    const parts = text
      .split(/[\n,，;；]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    tags.push(...parts);
  }

  return [...new Set(tags)];
}

function uniqueStrings(values) {
  const result = [];
  for (const value of values) {
    const text = toNullableText(value);
    if (text && !result.includes(text)) result.push(text);
  }
  return result;
}

export function normalizeContentAsset(detail, libraryItem, options = {}) {
  const platform = options.platform || 'ozon';
  const platformProductId =
    toNullableText(detail?.sourceFormId) ||
    toNullableText(libraryItem?.sourceDataId) ||
    toNullableText(options.productId);

  if (!platformProductId) {
    throw new Error('内容资产缺少平台商品 ID，无法入库');
  }

  const title = toNullableText(detail?.offerName);
  const description = toNullableText(findAttributeValue(detail, 4191));
  const tags = extractTags(findAttributeValue(detail, 23171));
  const productUrl =
    toNullableText(libraryItem?.sourceDataExpandData?.url) ||
    toNullableText(options.productUrl);

  const skus = (Array.isArray(detail?.skus) ? detail.skus : []).map((sku, index) => ({
    platform_sku_id:
      toNullableText(sku?.sku) ||
      toNullableText(sku?.id) ||
      `${platformProductId}-${index + 1}`,
    sku_name: toNullableText(sku?.name) || title,
    price: toNullableNumber(sku?.price),
    currency_code: toNullableText(sku?.currency) || toNullableText(detail?.currencyCode),
    images: uniqueStrings(Array.isArray(sku?.skuImages) ? sku.skuImages : []),
    sort_order: index,
  }));

  const imageUrls = uniqueStrings(skus.flatMap((sku) => sku.images));
  const asset = {
    platform,
    platform_product_id: platformProductId,
    product_url: productUrl,
    title,
    description,
    tags,
    main_image_url: imageUrls[0] || null,
    image_urls: imageUrls,
    skus,
  };

  asset.content_hash = createHash('sha256')
    .update(JSON.stringify({
      platform: asset.platform,
      platform_product_id: asset.platform_product_id,
      title: asset.title,
      description: asset.description,
      tags: asset.tags,
      image_urls: asset.image_urls,
      skus: asset.skus.map((sku) => ({
        platform_sku_id: sku.platform_sku_id,
        sku_name: sku.sku_name,
        price: sku.price,
        currency_code: sku.currency_code,
        images: sku.images,
      })),
    }))
    .digest('hex');

  return asset;
}

export function upsertContentAsset(db, jobId, asset, capturedAt) {
  ensureProductContentTables(db);

  const existing = db.prepare(`
    SELECT id
    FROM product_content_assets
    WHERE platform = ?
      AND platform_product_id = ?
      AND content_hash = ?
    LIMIT 1
  `).get(asset.platform, asset.platform_product_id, asset.content_hash);

  let contentAssetId = existing ? Number(existing.id) : null;
  let insertedAsset = false;
  if (!contentAssetId) {
    const ts = capturedAt;
    const result = db.prepare(`
      INSERT INTO product_content_assets (
        source_job_id, platform, platform_product_id, product_url,
        title, description, tags_json, main_image_url, image_urls_json,
        content_hash, captured_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      jobId,
      asset.platform,
      asset.platform_product_id,
      asset.product_url,
      asset.title,
      asset.description,
      JSON.stringify(asset.tags),
      asset.main_image_url,
      JSON.stringify(asset.image_urls),
      asset.content_hash,
      ts,
      ts,
      ts,
    );
    contentAssetId = Number(result.lastInsertRowid);
    insertedAsset = result.changes > 0;
  }

  const insertSku = db.prepare(`
    INSERT OR IGNORE INTO product_content_skus (
      content_asset_id, source_job_id, platform, platform_product_id, platform_sku_id,
      sku_name, price, currency_code, images_json, sort_order,
      captured_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let insertedSkuCount = 0;
  for (const sku of asset.skus) {
    const result = insertSku.run(
      contentAssetId,
      jobId,
      asset.platform,
      asset.platform_product_id,
      sku.platform_sku_id,
      sku.sku_name,
      sku.price,
      sku.currency_code,
      JSON.stringify(sku.images),
      sku.sort_order,
      capturedAt,
      capturedAt,
      capturedAt,
    );
    insertedSkuCount += result.changes;
  }

  return {
    contentAssetId,
    insertedAsset,
    insertedSkuCount,
  };
}
