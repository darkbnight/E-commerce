# product_business_snapshots 表文档

## 1. 用途

`product_business_snapshots` 记录某个平台商品在某一次采集任务中的经营表现。

它不是商品主档，也不负责记录商品最终处理状态。它的核心职责是保留“当时采集到的经营现场”，用于批次结果展示、初筛、趋势分析和后续候选判断。

## 2. 核心规则

- 同一商品在同一采集任务中最多保留一条快照。
- 同一商品跨不同采集任务可以保留多条快照。
- 商品身份由 `platform + platform_product_id` 表达。
- 批次归属由 `job_id` 表达。
- 经营数据不覆盖历史记录。

## 3. 建议建表语句

```sql
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

  UNIQUE(job_id, platform, platform_product_id),
  FOREIGN KEY(job_id) REFERENCES source_jobs(id),
  FOREIGN KEY(raw_record_id) REFERENCES products_raw(id)
);
```

## 4. 建议索引

```sql
CREATE INDEX IF NOT EXISTS idx_product_business_snapshots_job
ON product_business_snapshots(job_id);

CREATE INDEX IF NOT EXISTS idx_product_business_snapshots_product
ON product_business_snapshots(platform, platform_product_id);

CREATE INDEX IF NOT EXISTS idx_product_business_snapshots_captured_at
ON product_business_snapshots(captured_at);
```

## 5. 字段说明

| 字段名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | integer | 是 | 主键 |
| `job_id` | integer | 是 | 采集任务 ID，关联 `source_jobs.id` |
| `raw_record_id` | integer | 否 | 原始载荷 ID，关联 `products_raw.id` |
| `platform` | text | 是 | 平台标识，如 `ozon` |
| `platform_product_id` | text | 是 | 平台商品 ID |
| `product_url` | text | 否 | 商品链接 |
| `product_image_url` | text | 否 | 商品主图链接，来源如萌拉 `skuImg` |
| `shop_id` | text | 否 | 店铺 ID，来源如萌拉 `shopId` |
| `shop_name` | text | 否 | 店铺名称，来源如萌拉 `shopName` |
| `product_type` | text | 否 | 商品类型，如本土、跨境等 |
| `brand` | text | 否 | 品牌 |
| `title` | text | 否 | 采集时商品标题 |
| `product_created_date` | text | 否 | 商品卡创建日期，来源如萌拉 `createDt` |
| `category_level_1` | text | 否 | 一级类目 |
| `category_level_2` | text | 否 | 二级类目 |
| `category_level_3` | text | 否 | 三级类目 |
| `sales_volume` | real | 否 | 销量 |
| `sales_growth` | real | 否 | 销量增长率 |
| `potential_index` | real | 否 | 潜力指数 |
| `sales_amount` | real | 否 | 销售额，默认保存萌拉返回的卢布口径 |
| `sales_amount_cny` | real | 否 | 销售额人民币口径，来源如萌拉 `monthGmvRmb` |
| `avg_price_rub` | real | 否 | 平均单价卢布口径，来源如萌拉 `avgPrice` |
| `avg_price_cny` | real | 否 | 平均单价人民币口径，来源如萌拉 `avgPriceRmb` |
| `add_to_cart_rate` | real | 否 | 加购率 |
| `impressions` | real | 否 | 曝光数 |
| `clicks` | real | 否 | 点击数 |
| `view_rate` | real | 否 | 浏览率 |
| `ad_cost` | real | 否 | 广告费用 |
| `ad_cost_cny` | real | 否 | 广告费用人民币口径，来源如萌拉 `adsalesRmb` |
| `ad_cost_rate` | real | 否 | 广告费占比 |
| `order_conversion_rate` | real | 否 | 订单转化率 |
| `estimated_gross_margin` | real | 否 | 预估毛利率 |
| `shipping_mode` | text | 否 | 物流/发货模式 |
| `delivery_time` | text | 否 | 配送时效 |
| `average_sales_amount` | real | 否 | 平均销售额 |
| `length_cm` | real | 否 | 长度，单位 cm |
| `width_cm` | real | 否 | 宽度，单位 cm |
| `height_cm` | real | 否 | 高度，单位 cm |
| `weight_g` | real | 否 | 重量，单位 g |
| `parse_status` | text | 是 | 解析状态，如 `complete`、`partial` |
| `captured_at` | text | 是 | 采集时间 |
| `created_at` | text | 是 | 记录创建时间 |
| `updated_at` | text | 是 | 记录更新时间 |

## 6. 典型查询

按批次查看结果：

```sql
SELECT *
FROM product_business_snapshots
WHERE job_id = ?
ORDER BY sales_volume DESC, id DESC;
```

查看某个商品历史：

```sql
SELECT *
FROM product_business_snapshots
WHERE platform = ? AND platform_product_id = ?
ORDER BY captured_at DESC, id DESC;
```

查看每个商品的最新快照：

```sql
SELECT *
FROM (
  SELECT
    product_business_snapshots.*,
    ROW_NUMBER() OVER (
      PARTITION BY platform, platform_product_id
      ORDER BY captured_at DESC, id DESC
    ) AS rn
  FROM product_business_snapshots
)
WHERE rn = 1;
```
