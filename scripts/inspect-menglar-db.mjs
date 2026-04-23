import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DB_PATH = process.env.ECOMMERCE_WORKBENCH_DB_PATH ||
  path.join(process.cwd(), 'db', 'ecommerce-workbench.sqlite');

const db = new DatabaseSync(DB_PATH, { readOnly: true });

function safeCount(tableName) {
  const table = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName);
  if (!table) return null;
  return db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get();
}

const jobs = db.prepare('SELECT * FROM source_jobs ORDER BY id DESC LIMIT 5').all();
const rawCount = safeCount('products_raw');
const businessSnapshotCount = safeCount('product_business_snapshots');
const contentAssetCount = safeCount('product_content_assets');
const contentResultCount = safeCount('product_content_result');
const samples = db.prepare(`
  SELECT
    platform,
    platform_product_id,
    brand,
    category_level_1,
    category_level_2,
    category_level_3,
    sales_volume,
    sales_amount
  FROM product_business_snapshots
  ORDER BY id DESC
  LIMIT 10
`).all();

console.log(JSON.stringify({
  database: DB_PATH,
  jobs,
  rawCount,
  businessSnapshotCount,
  contentAssetCount,
  contentResultCount,
  samples,
}, null, 2));

db.close();
