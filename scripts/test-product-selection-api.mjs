import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const tempRoot = path.join(process.cwd(), '.cache', 'test-temp');
await mkdir(tempRoot, { recursive: true });
const tempDir = await mkdtemp(path.join(tempRoot, 'product-selection-api-'));
const tempDbPath = path.join(tempDir, 'ecommerce-workbench.sqlite');
process.env.ECOMMERCE_WORKBENCH_DB_PATH = tempDbPath;

const { startWorkbenchServer } = await import('../backend/menglar-workbench-api/server.mjs');

seedDb(tempDbPath);

const port = Number(process.env.TEST_PORT || 4203);
const server = await startWorkbenchServer({ port });

try {
  const baseUrl = `http://127.0.0.1:${port}`;

  const createResponse = await fetch(`${baseUrl}/api/product-selection/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        { sourceSnapshotId: 2001 },
        { sourceSnapshotId: 2002 },
      ],
    }),
  });
  assert.equal(createResponse.status, 200);
  const createBody = await createResponse.json();
  assert.equal(createBody.insertedCount, 2);
  assert.equal(createBody.duplicateCount, 0);
  assert.equal(createBody.items.length, 2);
  for (const item of createBody.items) {
    assert.equal(typeof item.initialDeliveryCost, 'number');
    assert.ok(item.initialDeliveryCost > 0, 'initialDeliveryCost should be auto calculated on create');
  }

  const productsResponse = await fetch(`${baseUrl}/api/products?jobId=11&minAvgPrice=108&maxAvgPrice=110&minWeight=200&maxWeight=220`);
  assert.equal(productsResponse.status, 200);
  const productsBody = await productsResponse.json();
  assert.equal(productsBody.total, 1);
  assert.equal(productsBody.items[0].platform_product_id, 'SKU-2002');
  assert.equal(productsBody.filters.minAvgPrice, '108');
  assert.equal(productsBody.filters.maxWeight, '220');

  const duplicateResponse = await fetch(`${baseUrl}/api/product-selection/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ sourceSnapshotId: 2001 }],
    }),
  });
  assert.equal(duplicateResponse.status, 200);
  const duplicateBody = await duplicateResponse.json();
  assert.equal(duplicateBody.insertedCount, 0);
  assert.equal(duplicateBody.duplicateCount, 1);

  const rejectResponse = await fetch(`${baseUrl}/api/product-selection/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selectionStage: 'screening_rejected',
      items: [{ sourceSnapshotId: 2002 }],
    }),
  });
  assert.equal(rejectResponse.status, 200);
  const rejectBody = await rejectResponse.json();
  assert.equal(rejectBody.insertedCount, 0);
  assert.equal(rejectBody.duplicateCount, 1);
  assert.equal(rejectBody.updatedCount, 1);

  const selectedProductsResponse = await fetch(`${baseUrl}/api/products?jobId=11&productStatus=selected`);
  assert.equal(selectedProductsResponse.status, 200);
  const selectedProductsBody = await selectedProductsResponse.json();
  assert.equal(selectedProductsBody.total, 1);
  assert.equal(selectedProductsBody.items[0].platform_product_id, 'SKU-2001');
  assert.equal(selectedProductsBody.filters.productStatus, 'selected');

  const rejectedProductsResponse = await fetch(`${baseUrl}/api/products?jobId=11&productStatus=rejected`);
  assert.equal(rejectedProductsResponse.status, 200);
  const rejectedProductsBody = await rejectedProductsResponse.json();
  assert.equal(rejectedProductsBody.total, 1);
  assert.equal(rejectedProductsBody.items[0].platform_product_id, 'SKU-2002');
  assert.equal(rejectedProductsBody.items[0].selection_stage, 'screening_rejected');

  const listResponse = await fetch(`${baseUrl}/api/product-selection/items`);
  assert.equal(listResponse.status, 200);
  const listBody = await listResponse.json();
  assert.equal(listBody.total, 2);
  assert.equal(listBody.items.length, 2);
  assert.equal(listBody.items[0].item.platform_product_id != null, true);
  for (const item of listBody.items) {
    assert.equal(typeof item.initialDeliveryCost, 'number');
    assert.ok(item.initialDeliveryCost > 0, 'list response should keep auto calculated delivery cost');
  }

  const firstId = Number(listBody.items.find((item) => item.item.platform_product_id === 'SKU-2001').id);
  const patchResponse = await fetch(`${baseUrl}/api/product-selection/items/${firstId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stage: 'source_pending',
      initialCostPrice: 12.5,
      initialDeliveryCost: 4.6,
      initialTargetPrice: 36.9,
      initialProfitRate: 18.2,
      pricingDecision: 'continue',
      supplyMatchStatus: 'matched',
      supplyReferenceUrl: 'https://detail.1688.com/offer/mock-source.html',
      supplyVendorName: 'Mock 1688 Supplier',
    }),
  });
  assert.equal(patchResponse.status, 200);
  const patchBody = await patchResponse.json();
  assert.equal(patchBody.item.stage, 'source_pending');
  assert.equal(patchBody.item.pricingDecision, 'continue');
  assert.equal(patchBody.item.supplyMatchStatus, 'matched');
  assert.equal(patchBody.item.initialTargetPrice, 36.9);

  const invalidPatchResponse = await fetch(`${baseUrl}/api/product-selection/items/${firstId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stage: 'invalid_stage',
    }),
  });
  assert.equal(invalidPatchResponse.status, 400);

  const transferResponse = await fetch(`${baseUrl}/api/product-selection/items/${firstId}/transfer-to-prep`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(transferResponse.status, 200);
  const transferBody = await transferResponse.json();
  assert.equal(transferBody.item.stage, 'prep_ready');
  assert.ok(transferBody.item.transferToPrepAt);

  const db = new DatabaseSync(tempDbPath, { readOnly: true });
  try {
    const row = db.prepare(`
      SELECT source_job_id,
             source_snapshot_id,
             selection_stage,
             initial_delivery_cost,
             initial_target_price,
             pricing_decision,
             supply_match_status,
             transfer_to_prep_at
      FROM product_selection_items
      WHERE id = ?
    `).get(firstId);
    assert.equal(row.source_job_id, 11);
    assert.equal(row.source_snapshot_id === 2001 || row.source_snapshot_id === 2002, true);
    assert.equal(row.selection_stage, 'prep_ready');
    assert.ok(row.initial_delivery_cost > 0);
    assert.equal(row.initial_target_price, 36.9);
    assert.equal(row.pricing_decision, 'continue');
    assert.equal(row.supply_match_status, 'matched');
    assert.ok(row.transfer_to_prep_at);

    const autoPricedRows = db.prepare(`
      SELECT source_snapshot_id,
             initial_delivery_cost
      FROM product_selection_items
      ORDER BY source_snapshot_id ASC
    `).all();
    assert.equal(autoPricedRows.length, 2);
    for (const autoPricedRow of autoPricedRows) {
      assert.ok(autoPricedRow.initial_delivery_cost > 0, `snapshot ${autoPricedRow.source_snapshot_id} should persist auto delivery cost`);
    }
  } finally {
    db.close();
  }

  console.log(JSON.stringify({
    ok: true,
    database: tempDbPath,
    total: listBody.total,
    updatedId: firstId,
  }, null, 2));
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}

function seedDb(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      CREATE TABLE source_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_name TEXT NOT NULL,
        page_url TEXT NOT NULL,
        page_type TEXT NOT NULL,
        pagination_mode TEXT NOT NULL,
        job_status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        raw_count INTEGER NOT NULL DEFAULT 0,
        normalized_count INTEGER NOT NULL DEFAULT 0,
        warning_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE product_business_snapshots (
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
    `);

    db.prepare(`
      INSERT INTO source_jobs (
        id, page_name, page_url, page_type, pagination_mode, job_status,
        started_at, finished_at, raw_count, normalized_count, warning_count, error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      11,
      '住宅和花园热销商品',
      'https://example.com/page',
      'hot_products',
      'single_page',
      'success',
      '2026-04-24T10:00:00.000Z',
      '2026-04-24T10:08:00.000Z',
      2,
      2,
      0,
      null,
      '2026-04-24T10:00:00.000Z',
      '2026-04-24T10:08:00.000Z',
    );

    const insertSnapshot = db.prepare(`
      INSERT INTO product_business_snapshots (
        id, job_id, raw_record_id, platform, platform_product_id, product_url, product_image_url,
        shop_id, shop_name, product_type, brand, title, product_created_date,
        category_level_1, category_level_2, category_level_3,
        sales_volume, sales_growth, potential_index, sales_amount, sales_amount_cny,
        avg_price_rub, avg_price_cny, add_to_cart_rate, impressions, clicks, view_rate,
        ad_cost, ad_cost_cny, ad_cost_rate, order_conversion_rate, estimated_gross_margin,
        shipping_mode, delivery_time, average_sales_amount, length_cm, width_cm, height_cm, weight_g,
        parse_status, captured_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertSnapshot.run(
      2001, 11, null, 'ozon', 'SKU-2001', 'https://example.com/sku-2001', 'https://example.com/sku-2001.jpg',
      'SHOP-1', '店铺一', 'cross_border', 'Generic', 'Cleaning Cloth A', '2026-04-01',
      'Дом и сад', 'Уборка', 'Тряпки',
      860, 0.12, 901.5, 158000, 14200,
      1290, 118, 0.22, 14500, 4200, 0.29,
      4100, 368, 0.04, 0.18, 0.27,
      'FBO', '2-4 days', 183.7, 30, 20, 2, 180,
      'complete', '2026-04-24T10:05:00.000Z', '2026-04-24T10:05:00.000Z', '2026-04-24T10:05:00.000Z',
    );
    insertSnapshot.run(
      2002, 11, null, 'ozon', 'SKU-2002', 'https://example.com/sku-2002', 'https://example.com/sku-2002.jpg',
      'SHOP-2', '店铺二', 'cross_border', 'No Brand', 'Cleaning Cloth B', '2026-04-03',
      'Дом и сад', 'Кухня', 'Тряпки',
      620, 0.08, 744.2, 128000, 11500,
      1180, 108, 0.17, 12000, 3600, 0.22,
      3900, 350, 0.03, 0.16, 0.21,
      'FBS', '3-5 days', 206.4, 32, 22, 3, 210,
      'complete', '2026-04-24T10:06:00.000Z', '2026-04-24T10:06:00.000Z', '2026-04-24T10:06:00.000Z',
    );
  } finally {
    db.close();
  }
}
