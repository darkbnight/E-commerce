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
      platform TEXT NOT NULL DEFAULT 'ozon',
      platform_product_id TEXT NOT NULL,
      product_url TEXT,
      source_job_id INTEGER,
      source_snapshot_id INTEGER,
      title TEXT,
      description TEXT,
      attributes_json TEXT,
      tags_json TEXT,
      main_image_url TEXT,
      image_urls_json TEXT,
      downloaded_images_json TEXT,
      content_hash TEXT,
      content_status TEXT NOT NULL DEFAULT 'pending',
      captured_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(platform, platform_product_id, content_hash)
    );

    CREATE INDEX IF NOT EXISTS idx_product_content_assets_product
    ON product_content_assets(platform, platform_product_id);

    CREATE INDEX IF NOT EXISTS idx_product_content_assets_source_job
    ON product_content_assets(source_job_id);

    CREATE INDEX IF NOT EXISTS idx_product_content_assets_status
    ON product_content_assets(content_status);

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
  const backfillResult = backfillSnapshotExtendedFields(db);
  console.log(JSON.stringify({
    ok: true,
    database: NEW_DB_PATH,
    copiedFromOld,
    ...result,
    ...backfillResult,
  }, null, 2));
} finally {
  db.close();
}
