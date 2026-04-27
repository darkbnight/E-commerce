import { existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DB_PATH = process.env.ECOMMERCE_WORKBENCH_DB_PATH ||
  path.resolve('db', 'ecommerce-workbench.sqlite');

if (!existsSync(DB_PATH)) {
  throw new Error(`数据库不存在：${DB_PATH}`);
}

const db = new DatabaseSync(DB_PATH, { open: true });

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
`);

const demoProducts = [
  {
    productId: 'demo-content-ornament-001',
    business: {
      jobId: 9101,
      title: '复古金属挂饰套装 100 枚 升级版',
      productImageUrl: 'https://placehold.co/720x720/efe2cf/12363c?text=Ornament+V2',
      shopName: 'Craft Home',
      brand: 'MoriCraft',
      salesVolume: 286,
      salesAmountCny: 5697.12,
      avgPriceCny: 19.92,
      impressions: 18240,
      clicks: 1378,
      orderConversionRate: 9.85,
      estimatedGrossMargin: 23.4,
      shippingMode: 'FBO',
      deliveryTime: '6-10天',
      capturedAt: '2026-04-25T14:25:00.000Z',
    },
    versions: [
      {
        sourceJobId: 9001,
        productUrl: 'https://www.ozon.ru/product/demo-content-ornament-001',
        title: '复古金属挂饰套装 100 枚',
        description: '旧版内容：适合做项链、手链、钥匙扣和节庆装饰，主图以暖色木质背景展示。',
        tags: ['手作', '挂饰', '复古'],
        mainImageUrl: 'https://placehold.co/720x720/f2e5d5/1b2a2f?text=Ornament+V1',
        imageUrls: [
          'https://placehold.co/720x720/f2e5d5/1b2a2f?text=Ornament+V1-1',
          'https://placehold.co/720x720/e8dccf/1b2a2f?text=Ornament+V1-2',
        ],
        contentHash: 'demo-ornament-v1',
        capturedAt: '2026-04-21T10:30:00.000Z',
        skus: [
          {
            skuId: 'demo-ornament-v1-sku-1',
            skuName: '100 枚装',
            price: 19.92,
            images: ['https://placehold.co/600x600/f4ece0/1b2a2f?text=100pcs'],
          },
        ],
      },
      {
        sourceJobId: 9002,
        productUrl: 'https://www.ozon.ru/product/demo-content-ornament-001',
        title: '复古金属挂饰套装 100 枚 升级版',
        description: '新版内容：补充了适用场景说明，增加局部细节图，用于核对标题、标签、多图和 SKU 映射。',
        tags: ['手作', '挂饰', '节庆', '金属'],
        mainImageUrl: 'https://placehold.co/720x720/efe2cf/12363c?text=Ornament+V2',
        imageUrls: [
          'https://placehold.co/720x720/efe2cf/12363c?text=Ornament+V2-1',
          'https://placehold.co/720x720/e2d1bb/12363c?text=Ornament+V2-2',
          'https://placehold.co/720x720/f8efe4/12363c?text=Ornament+V2-3',
        ],
        contentHash: 'demo-ornament-v2',
        capturedAt: '2026-04-25T14:20:00.000Z',
        skus: [
          {
            skuId: 'demo-ornament-v2-sku-1',
            skuName: '100 枚装',
            price: 19.92,
            images: ['https://placehold.co/600x600/f3eadf/12363c?text=100pcs+V2'],
          },
          {
            skuId: 'demo-ornament-v2-sku-2',
            skuName: '150 枚装',
            price: 26.8,
            images: [
              'https://placehold.co/600x600/eadccc/12363c?text=150pcs+V2',
              'https://placehold.co/600x600/e1d3c2/12363c?text=150pcs+Detail',
            ],
          },
        ],
      },
    ],
  },
  {
    productId: 'demo-content-organizer-002',
    business: {
      jobId: 9102,
      title: '桌面收纳盒 三格透明款',
      productImageUrl: 'https://placehold.co/720x720/e9efe9/17342e?text=Organizer',
      shopName: 'Neat Space',
      brand: 'ClearNest',
      salesVolume: 143,
      salesAmountCny: 4468.75,
      avgPriceCny: 31.25,
      impressions: 9720,
      clicks: 884,
      orderConversionRate: 11.62,
      estimatedGrossMargin: 18.7,
      shippingMode: 'FBS',
      deliveryTime: '5-8天',
      capturedAt: '2026-04-25T14:36:00.000Z',
    },
    versions: [
      {
        sourceJobId: 9003,
        productUrl: 'https://www.ozon.ru/product/demo-content-organizer-002',
        title: '桌面收纳盒 三格透明款',
        description: '单版本示例：适合看主图、多图和标签展示效果。',
        tags: ['收纳', '桌面', '透明'],
        mainImageUrl: 'https://placehold.co/720x720/e9efe9/17342e?text=Organizer',
        imageUrls: [
          'https://placehold.co/720x720/e9efe9/17342e?text=Organizer-1',
          'https://placehold.co/720x720/d9e7de/17342e?text=Organizer-2',
          'https://placehold.co/720x720/f3f6f2/17342e?text=Organizer-3',
        ],
        contentHash: 'demo-organizer-v1',
        capturedAt: '2026-04-25T14:35:00.000Z',
        skus: [
          {
            skuId: 'demo-organizer-v1-sku-1',
            skuName: '透明三格',
            price: 31.25,
            images: ['https://placehold.co/600x600/eaf0ea/17342e?text=3Grid'],
          },
        ],
      },
    ],
  },
  {
    productId: 'demo-content-kitchen-003',
    business: {
      jobId: 9103,
      title: '厨房硅胶刮刀套装 4 件',
      productImageUrl: 'https://placehold.co/720x720/f6e9de/4a3126?text=Kitchen+Set',
      shopName: 'Daily Kitchen Lab',
      brand: 'CookMerry',
      salesVolume: 318,
      salesAmountCny: 8078.4,
      avgPriceCny: 25.4,
      impressions: 20560,
      clicks: 1662,
      orderConversionRate: 12.31,
      estimatedGrossMargin: 21.8,
      shippingMode: 'FBO',
      deliveryTime: '4-7天',
      capturedAt: '2026-04-25T14:42:00.000Z',
    },
    versions: [
      {
        sourceJobId: 9004,
        productUrl: 'https://www.ozon.ru/product/demo-content-kitchen-003',
        title: '厨房硅胶刮刀套装 4 件',
        description: '多 SKU 示例：适合核对不同颜色和不同价格的 SKU 图片映射。',
        tags: ['厨房', '硅胶', '刮刀'],
        mainImageUrl: 'https://placehold.co/720x720/f6e9de/4a3126?text=Kitchen+Set',
        imageUrls: [
          'https://placehold.co/720x720/f6e9de/4a3126?text=Kitchen+1',
          'https://placehold.co/720x720/ecd8cb/4a3126?text=Kitchen+2',
        ],
        contentHash: 'demo-kitchen-v1',
        capturedAt: '2026-04-25T14:40:00.000Z',
        skus: [
          {
            skuId: 'demo-kitchen-v1-sku-1',
            skuName: '奶油白',
            price: 24.5,
            images: ['https://placehold.co/600x600/f7ede6/4a3126?text=Cream'],
          },
          {
            skuId: 'demo-kitchen-v1-sku-2',
            skuName: '橄榄绿',
            price: 24.5,
            images: ['https://placehold.co/600x600/e0e7d8/4a3126?text=Olive'],
          },
          {
            skuId: 'demo-kitchen-v1-sku-3',
            skuName: '暖棕色',
            price: 26.9,
            images: ['https://placehold.co/600x600/e8d6c6/4a3126?text=Brown'],
          },
        ],
      },
    ],
  },
];

const insertAsset = db.prepare(`
  INSERT INTO product_content_assets (
    source_job_id, platform, platform_product_id, product_url, title, description,
    tags_json, main_image_url, image_urls_json, content_hash, captured_at, created_at, updated_at
  ) VALUES (?, 'ozon', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(platform, platform_product_id, content_hash) DO UPDATE SET
    source_job_id = excluded.source_job_id,
    product_url = excluded.product_url,
    title = excluded.title,
    description = excluded.description,
    tags_json = excluded.tags_json,
    main_image_url = excluded.main_image_url,
    image_urls_json = excluded.image_urls_json,
    captured_at = excluded.captured_at,
    updated_at = excluded.updated_at
`);

const deleteBusinessByProduct = db.prepare(`
  DELETE FROM product_business_snapshots
  WHERE platform = 'ozon' AND platform_product_id = ?
`);

const insertBusiness = db.prepare(`
  INSERT INTO product_business_snapshots (
    job_id, raw_record_id, platform, platform_product_id, product_url, product_image_url,
    shop_id, shop_name, product_type, brand, title, product_created_date,
    category_level_1, category_level_2, category_level_3,
    sales_volume, sales_growth, potential_index, sales_amount, sales_amount_cny,
    avg_price_rub, avg_price_cny, add_to_cart_rate, impressions, clicks, view_rate,
    ad_cost, ad_cost_cny, ad_cost_rate, order_conversion_rate, estimated_gross_margin,
    shipping_mode, delivery_time, average_sales_amount, length_cm, width_cm, height_cm, weight_g,
    parse_status, captured_at, created_at, updated_at
  ) VALUES (
    ?, NULL, 'ozon', ?, ?, ?, NULL, ?, 'demo', ?, ?, NULL,
    'Demo', 'Content', 'Assets',
    ?, NULL, NULL, NULL, ?,
    NULL, ?, NULL, ?, ?, NULL,
    NULL, NULL, NULL, ?, ?,
    ?, ?, NULL, NULL, NULL, NULL, NULL,
    'ok', ?, ?, ?
  )
`);

const findAsset = db.prepare(`
  SELECT id
  FROM product_content_assets
  WHERE platform = 'ozon' AND platform_product_id = ? AND content_hash = ?
  LIMIT 1
`);

const deleteSkuByAsset = db.prepare(`
  DELETE FROM product_content_skus
  WHERE content_asset_id = ?
`);

const insertSku = db.prepare(`
  INSERT INTO product_content_skus (
    content_asset_id, source_job_id, platform, platform_product_id, platform_sku_id,
    sku_name, price, currency_code, images_json, sort_order, captured_at, created_at, updated_at
  ) VALUES (?, ?, 'ozon', ?, ?, ?, ?, 'CNY', ?, ?, ?, ?, ?)
`);

let assetCount = 0;
let skuCount = 0;
let businessCount = 0;

for (const product of demoProducts) {
  deleteBusinessByProduct.run(product.productId);
  insertBusiness.run(
    product.business.jobId,
    product.productId,
    `https://www.ozon.ru/product/${product.productId}`,
    product.business.productImageUrl,
    product.business.shopName,
    product.business.brand,
    product.business.title,
    product.business.salesVolume,
    product.business.salesAmountCny,
    product.business.avgPriceCny,
    product.business.impressions,
    product.business.clicks,
    product.business.orderConversionRate,
    product.business.estimatedGrossMargin,
    product.business.shippingMode,
    product.business.deliveryTime,
    product.business.capturedAt,
    product.business.capturedAt,
    product.business.capturedAt,
  );
  businessCount += 1;

  for (const version of product.versions) {
    insertAsset.run(
      version.sourceJobId,
      product.productId,
      version.productUrl,
      version.title,
      version.description,
      JSON.stringify(version.tags),
      version.mainImageUrl,
      JSON.stringify(version.imageUrls),
      version.contentHash,
      version.capturedAt,
      version.capturedAt,
      version.capturedAt,
    );

    const asset = findAsset.get(product.productId, version.contentHash);
    deleteSkuByAsset.run(asset.id);
    assetCount += 1;

    version.skus.forEach((sku, index) => {
      insertSku.run(
        asset.id,
        version.sourceJobId,
        product.productId,
        sku.skuId,
        sku.skuName,
        sku.price,
        JSON.stringify(sku.images),
        index,
        version.capturedAt,
        version.capturedAt,
        version.capturedAt,
      );
      skuCount += 1;
    });
  }
}

db.close();

console.log(JSON.stringify({
  dbPath: DB_PATH,
  productIds: demoProducts.map((item) => item.productId),
  businessCount,
  assetCount,
  skuCount,
}, null, 2));
