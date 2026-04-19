import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DB_PATH = path.join(process.cwd(), 'db', 'menglar-mvp.sqlite');
const db = new DatabaseSync(DB_PATH, { readOnly: true });

const jobs = db.prepare('SELECT * FROM source_jobs ORDER BY id DESC LIMIT 5').all();
const rawCount = db.prepare('SELECT COUNT(*) AS count FROM products_raw').get();
const normalizedCount = db.prepare('SELECT COUNT(*) AS count FROM products_normalized').get();
const samples = db.prepare(`
  SELECT ozon_product_id, brand, category_level_1, category_level_2, category_level_3, sales, revenue
  FROM products_normalized
  ORDER BY id DESC
  LIMIT 10
`).all();

console.log(JSON.stringify({ jobs, rawCount, normalizedCount, samples }, null, 2));
