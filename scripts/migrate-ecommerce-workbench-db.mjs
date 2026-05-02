import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = process.cwd();
const DB_DIR = path.join(ROOT, 'db');
const OLD_DB_PATH = path.join(DB_DIR, 'menglar-mvp.sqlite');
const NEW_DB_PATH = path.join(DB_DIR, 'ecommerce-workbench.sqlite');

function tableExists(db, tableName) {
  return Boolean(db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName));
}

function tableColumns(db, tableName) {
  return new Set(db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name));
}

function createTargetTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_business_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      raw_record_id INTEGER,
      platform TEXT NOT NULL DEFAULT 'ozon',
      platform_product_id TEXT NOT NULL,
      product_url TEXT,
      product_image_url TEXT,
      shop_id TEXT,
      shop_name TEXT,
      product_type TEXT,
      brand TEXT,
      title TEXT,
      product_created_date TEXT,
      category_level_1 TEXT,
      category_level_2 TEXT,
      category_level_3 TEXT,
      sales_volume REAL,
      sales_growth REAL,
      potential_index REAL,
      sales_amount REAL,
      sales_amount_cny REAL,
      avg_price_rub REAL,
      avg_price_cny REAL,
      add_to_cart_rate REAL,
      impressions REAL,
      clicks REAL,
      view_rate REAL,
      ad_cost REAL,
      ad_cost_cny REAL,
      ad_cost_rate REAL,
      order_conversion_rate REAL,
      estimated_gross_margin REAL,
      shipping_mode TEXT,
      delivery_time TEXT,
      average_sales_amount REAL,
      length_cm REAL,
      width_cm REAL,
      height_cm REAL,
      weight_g REAL,
      parse_status TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(job_id, platform, platform_product_id)
    );

    CREATE INDEX IF NOT EXISTS idx_product_business_snapshots_job
    ON product_business_snapshots(job_id);

    CREATE INDEX IF NOT EXISTS idx_product_business_snapshots_product
    ON product_business_snapshots(platform, platform_product_id);

    CREATE INDEX IF NOT EXISTS idx_product_business_snapshots_captured_at
    ON product_business_snapshots(captured_at);

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
      rating_value REAL,
      review_count INTEGER,
      question_count INTEGER,
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
      variant_key TEXT,
      variant_attributes_json TEXT,
      images_binding_status TEXT,
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

    CREATE TABLE IF NOT EXISTS product_content_result (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      result_key TEXT NOT NULL UNIQUE,
      draft_id INTEGER,
      source_job_id INTEGER,
      source_snapshot_id INTEGER,
      product_normalized_id INTEGER,
      platform TEXT NOT NULL DEFAULT 'ozon',
      platform_product_id TEXT,
      offer_id TEXT,
      name TEXT,
      description TEXT,
      description_category_id INTEGER,
      type_id INTEGER,
      vendor TEXT,
      model_name TEXT,
      barcode TEXT,
      price TEXT,
      old_price TEXT,
      premium_price TEXT,
      min_price TEXT,
      currency_code TEXT,
      vat TEXT,
      warehouse_id TEXT,
      stock REAL,
      package_depth_mm REAL,
      package_width_mm REAL,
      package_height_mm REAL,
      package_weight_g REAL,
      images_json TEXT NOT NULL DEFAULT '[]',
      attributes_json TEXT NOT NULL DEFAULT '[]',
      ozon_import_item_json TEXT NOT NULL,
      raw_draft_json TEXT NOT NULL,
      result_status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_product_content_result_source
    ON product_content_result(source_job_id, source_snapshot_id);

    CREATE INDEX IF NOT EXISTS idx_product_content_result_product
    ON product_content_result(platform, platform_product_id);

    CREATE INDEX IF NOT EXISTS idx_product_content_result_status
    ON product_content_result(result_status);

    CREATE TABLE IF NOT EXISTS product_selection_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_job_id INTEGER NOT NULL,
      source_snapshot_id INTEGER NOT NULL,
      source_platform TEXT NOT NULL DEFAULT 'ozon',
      source_platform_product_id TEXT NOT NULL,
      selection_stage TEXT NOT NULL DEFAULT 'pool_pending',
      selection_result TEXT,
      selection_note TEXT,
      initial_cost_price REAL,
      initial_delivery_cost REAL,
      initial_target_price REAL,
      initial_profit_rate REAL,
      pricing_decision TEXT NOT NULL DEFAULT 'pending',
      supply_match_status TEXT NOT NULL DEFAULT 'pending',
      supply_reference_url TEXT,
      supply_vendor_name TEXT,
      competitor_packet_status TEXT NOT NULL DEFAULT 'pending',
      transfer_to_prep_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(source_job_id, source_platform, source_platform_product_id)
    );

    CREATE INDEX IF NOT EXISTS idx_product_selection_items_job
    ON product_selection_items(source_job_id);

    CREATE INDEX IF NOT EXISTS idx_product_selection_items_snapshot
    ON product_selection_items(source_snapshot_id);

    CREATE INDEX IF NOT EXISTS idx_product_selection_items_stage
    ON product_selection_items(selection_stage);

    CREATE INDEX IF NOT EXISTS idx_product_selection_items_product
    ON product_selection_items(source_platform, source_platform_product_id);
  `);
  ensureProductBusinessSnapshotColumns(db);
  ensureProductContentColumns(db);
  ensureProductSelectionItemColumns(db);
}

function migrateProductContentAssets(db) {
  if (!tableExists(db, 'product_content_assets')) {
    return { migratedContentAssets: 0, rebuiltContentAssets: false };
  }

  const columns = tableColumns(db, 'product_content_assets');
  const needsRebuild =
    columns.has('attributes_json') ||
    columns.has('downloaded_images_json') ||
    columns.has('content_status') ||
    columns.has('source_snapshot_id') ||
    !columns.has('source_job_id') ||
    !columns.has('content_hash') ||
    !columns.has('captured_at');

  if (!needsRebuild) {
    return {
      migratedContentAssets: db.prepare('SELECT COUNT(*) AS total FROM product_content_assets').get().total,
      rebuiltContentAssets: false,
    };
  }

  db.exec('ALTER TABLE product_content_assets RENAME TO product_content_assets_legacy');
  db.exec(`
    CREATE TABLE product_content_assets (
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
      rating_value REAL,
      review_count INTEGER,
      question_count INTEGER,
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
  `);

  db.exec(`
    INSERT OR IGNORE INTO product_content_assets (
      id,
      source_job_id,
      platform,
      platform_product_id,
      product_url,
      title,
      description,
      tags_json,
      main_image_url,
      image_urls_json,
      NULL,
      NULL,
      NULL,
      content_hash,
      captured_at,
      created_at,
      updated_at
    )
    SELECT
      id,
      source_job_id,
      COALESCE(NULLIF(platform, ''), 'ozon'),
      platform_product_id,
      product_url,
      title,
      description,
      tags_json,
      main_image_url,
      image_urls_json,
      rating_value,
      review_count,
      question_count,
      COALESCE(
        NULLIF(content_hash, ''),
        'legacy:' || COALESCE(NULLIF(platform, ''), 'ozon') || ':' || COALESCE(platform_product_id, '') || ':' || CAST(id AS TEXT)
      ),
      COALESCE(NULLIF(captured_at, ''), NULLIF(created_at, ''), NULLIF(updated_at, ''), datetime('now')),
      COALESCE(NULLIF(created_at, ''), NULLIF(captured_at, ''), datetime('now')),
      COALESCE(NULLIF(updated_at, ''), NULLIF(captured_at, ''), datetime('now'))
    FROM product_content_assets_legacy
    WHERE platform_product_id IS NOT NULL AND TRIM(platform_product_id) <> '';
  `);

  const migratedContentAssets = db.prepare('SELECT COUNT(*) AS total FROM product_content_assets').get().total;
  db.exec('DROP TABLE product_content_assets_legacy');
  return { migratedContentAssets, rebuiltContentAssets: true };
}

function ensureProductContentColumns(db) {
  if (tableExists(db, 'product_content_assets')) {
    const assetColumns = tableColumns(db, 'product_content_assets');
    for (const [name, definition] of [
      ['rating_value', 'REAL'],
      ['review_count', 'INTEGER'],
      ['question_count', 'INTEGER'],
    ]) {
      if (!assetColumns.has(name)) {
        db.exec(`ALTER TABLE product_content_assets ADD COLUMN ${name} ${definition}`);
      }
    }
  }

  if (tableExists(db, 'product_content_skus')) {
    const skuColumns = tableColumns(db, 'product_content_skus');
    for (const [name, definition] of [
      ['variant_key', 'TEXT'],
      ['variant_attributes_json', 'TEXT'],
      ['images_binding_status', 'TEXT'],
    ]) {
      if (!skuColumns.has(name)) {
        db.exec(`ALTER TABLE product_content_skus ADD COLUMN ${name} ${definition}`);
      }
    }
  }
}

function ensureProductSelectionItemColumns(db) {
  if (!tableExists(db, 'product_selection_items')) return;

  const columns = db.prepare('PRAGMA table_info(product_selection_items)').all();
  const names = new Set(columns.map((column) => column.name));
  const additions = [
    ['pricing_form_json', 'TEXT'],
  ];

  for (const [name, definition] of additions) {
    if (!names.has(name)) {
      db.exec(`ALTER TABLE product_selection_items ADD COLUMN ${name} ${definition}`);
    }
  }
}

function ensureProductBusinessSnapshotColumns(db) {
  if (!tableExists(db, 'product_business_snapshots')) return;

  const columns = db.prepare('PRAGMA table_info(product_business_snapshots)').all();
  const names = new Set(columns.map((column) => column.name));
  const additions = [
    ['product_image_url', 'TEXT'],
    ['shop_id', 'TEXT'],
    ['shop_name', 'TEXT'],
    ['product_created_date', 'TEXT'],
    ['sales_amount_cny', 'REAL'],
    ['avg_price_rub', 'REAL'],
    ['avg_price_cny', 'REAL'],
    ['ad_cost_cny', 'REAL'],
  ];

  for (const [name, definition] of additions) {
    if (!names.has(name)) {
      db.exec(`ALTER TABLE product_business_snapshots ADD COLUMN ${name} ${definition}`);
    }
  }
}

function toNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/[,%\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function backfillSnapshotExtendedFields(db) {
  if (!tableExists(db, 'products_raw') || !tableExists(db, 'product_business_snapshots')) {
    return { updatedExtendedFields: 0 };
  }

  const rows = db.prepare(`
    SELECT
      product_business_snapshots.id,
      products_raw.raw_payload
    FROM product_business_snapshots
    JOIN products_raw ON products_raw.id = product_business_snapshots.raw_record_id
    WHERE product_business_snapshots.raw_record_id IS NOT NULL
  `).all();

  const update = db.prepare(`
    UPDATE product_business_snapshots
    SET product_url = COALESCE(product_url, ?),
        product_image_url = COALESCE(product_image_url, ?),
        shop_id = COALESCE(shop_id, ?),
        shop_name = COALESCE(shop_name, ?),
        title = COALESCE(title, ?),
        product_created_date = COALESCE(product_created_date, ?),
        sales_amount_cny = COALESCE(sales_amount_cny, ?),
        avg_price_rub = COALESCE(avg_price_rub, ?),
        avg_price_cny = COALESCE(avg_price_cny, ?),
        ad_cost_cny = COALESCE(ad_cost_cny, ?)
    WHERE id = ?
  `);

  let updated = 0;
  for (const row of rows) {
    let payload;
    try {
      payload = JSON.parse(row.raw_payload);
    } catch {
      continue;
    }

    const result = update.run(
      payload.url ?? null,
      payload.skuImg ?? payload.imageUrl ?? null,
      payload.shopId == null ? null : String(payload.shopId),
      payload.shopName ?? payload.sellerName ?? null,
      payload.skuName ?? payload.title ?? payload.name ?? null,
      payload.createDt ?? null,
      toNumber(payload.monthGmvRmb),
      toNumber(payload.avgPrice),
      toNumber(payload.avgPriceRmb),
      toNumber(payload.adsalesRmb),
      row.id,
    );
    updated += result.changes;
  }

  return { updatedExtendedFields: updated };
}

function migrateProductsNormalized(db) {
  if (!tableExists(db, 'products_normalized')) {
    return { sourceCount: 0, migratedCount: 0, skipped: 'products_normalized not found' };
  }

  const sourceCount = db.prepare('SELECT COUNT(*) AS total FROM products_normalized').get().total;
  db.exec(`
    INSERT OR IGNORE INTO product_business_snapshots (
      id,
      job_id,
      raw_record_id,
      platform,
      platform_product_id,
      product_type,
      brand,
      category_level_1,
      category_level_2,
      category_level_3,
      sales_volume,
      sales_growth,
      potential_index,
      sales_amount,
      add_to_cart_rate,
      impressions,
      clicks,
      view_rate,
      ad_cost,
      ad_cost_rate,
      order_conversion_rate,
      estimated_gross_margin,
      shipping_mode,
      delivery_time,
      average_sales_amount,
      length_cm,
      width_cm,
      height_cm,
      weight_g,
      parse_status,
      captured_at,
      created_at,
      updated_at
    )
    SELECT
      id,
      job_id,
      raw_record_id,
      'ozon',
      ozon_product_id,
      product_type,
      brand,
      category_level_1,
      category_level_2,
      category_level_3,
      sales,
      sales_growth,
      potential_index,
      revenue,
      add_to_cart_rate,
      impressions,
      clicks,
      view_rate,
      ad_cost,
      ad_cost_rate,
      order_conversion_rate,
      estimated_gross_margin,
      shipping_mode,
      delivery_time,
      average_sales_amount,
      length_cm,
      width_cm,
      height_cm,
      weight_g,
      parse_status,
      created_at,
      created_at,
      updated_at
    FROM products_normalized;
  `);

  const migratedCount = db.prepare('SELECT COUNT(*) AS total FROM product_business_snapshots').get().total;
  db.exec('DROP TABLE products_normalized');
  return { sourceCount, migratedCount, droppedOldTable: true };
}

await mkdir(DB_DIR, { recursive: true });

let copiedFromOld = false;
if (!existsSync(NEW_DB_PATH) && existsSync(OLD_DB_PATH)) {
  await copyFile(OLD_DB_PATH, NEW_DB_PATH);
  copiedFromOld = true;
}

const db = new DatabaseSync(NEW_DB_PATH);
try {
  createTargetTables(db);
  const result = migrateProductsNormalized(db);
  const contentAssetResult = migrateProductContentAssets(db);
  ensureProductContentColumns(db);
  const backfillResult = backfillSnapshotExtendedFields(db);
  console.log(JSON.stringify({
    ok: true,
    database: NEW_DB_PATH,
    copiedFromOld,
    ...result,
    ...contentAssetResult,
    ...backfillResult,
  }, null, 2));
} finally {
  db.close();
}
