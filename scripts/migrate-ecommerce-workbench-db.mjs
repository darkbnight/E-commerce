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
      product_type TEXT,
      brand TEXT,
      title TEXT,
      category_level_1 TEXT,
      category_level_2 TEXT,
      category_level_3 TEXT,
      sales_volume REAL,
      sales_growth REAL,
      potential_index REAL,
      sales_amount REAL,
      add_to_cart_rate REAL,
      impressions REAL,
      clicks REAL,
      view_rate REAL,
      ad_cost REAL,
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
  `);
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
  console.log(JSON.stringify({
    ok: true,
    database: NEW_DB_PATH,
    copiedFromOld,
    ...result,
  }, null, 2));
} finally {
  db.close();
}
