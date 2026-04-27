# product_content_skus 表文档

## 1. 用途

`product_content_skus` 记录某一条内容资产版本下面的 SKU 集合。

这张表只承接 SKU 级资产，不承接产品级字段。当前阶段重点保存以下信息：

- 平台 SKU ID
- SKU 名称
- SKU 价格
- SKU 图片数组

这样可以稳定表达：

- 一个商品有哪些 SKU
- 这些 SKU 属于哪一版内容资产
- 每个 SKU 在该版本下的图片和价格是什么

## 2. 核心规则

- 一条 `product_content_assets` 可以对应多条 `product_content_skus`
- SKU 通过 `content_asset_id` 关联所属内容版本
- SKU 同时保留 `platform + platform_product_id`，便于跨表排查和后续迁移
- 同一条内容版本下，不应出现重复的 `platform_sku_id`
- SKU 跟随内容版本走，不直接挂到经营快照表

## 3. 建议建表语句

```sql
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

  UNIQUE(content_asset_id, platform_sku_id),
  FOREIGN KEY(content_asset_id) REFERENCES product_content_assets(id),
  FOREIGN KEY(source_job_id) REFERENCES source_jobs(id)
);
```

## 4. 建议索引

```sql
CREATE INDEX IF NOT EXISTS idx_product_content_skus_content_asset
ON product_content_skus(content_asset_id);

CREATE INDEX IF NOT EXISTS idx_product_content_skus_product
ON product_content_skus(platform, platform_product_id);

CREATE INDEX IF NOT EXISTS idx_product_content_skus_source_job
ON product_content_skus(source_job_id);
```

## 5. 字段说明

| 字段名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | integer | 是 | 主键 |
| `content_asset_id` | integer | 是 | 所属内容资产版本 ID，关联 `product_content_assets.id` |
| `source_job_id` | integer | 否 | 来源采集任务 ID，关联 `source_jobs.id` |
| `platform` | text | 是 | 平台标识，如 `ozon` |
| `platform_product_id` | text | 是 | 平台商品 ID |
| `platform_sku_id` | text | 是 | 平台 SKU ID |
| `sku_name` | text | 否 | SKU 名称 |
| `price` | real | 否 | SKU 价格 |
| `currency_code` | text | 否 | 币种，如 `CNY`、`RUB` |
| `images_json` | text | 否 | SKU 图片数组 JSON 文本 |
| `sort_order` | integer | 是 | 排序值，默认 `0` |
| `captured_at` | text | 是 | SKU 资产采集时间，通常与所属内容版本保持一致 |
| `created_at` | text | 是 | 记录创建时间 |
| `updated_at` | text | 是 | 记录更新时间 |

## 6. 关系口径

建议这样理解：

```text
商品身份 = platform + platform_product_id

同一商品
  -> 可以有多条内容版本 product_content_assets
  -> 每条内容版本下面有一组 SKU product_content_skus
```

也就是说：

- SKU 不是直接挂在商品经营快照下
- SKU 属于“某一版内容资产”
- 当内容变化并产生新版本时，该版本应写入自己对应的一组 SKU

## 7. 典型查询

读取某条内容版本对应的全部 SKU：

```sql
SELECT *
FROM product_content_skus
WHERE content_asset_id = ?
ORDER BY sort_order ASC, id ASC;
```

读取某个商品最新内容版本下的 SKU：

```sql
SELECT sku.*
FROM product_content_skus sku
JOIN product_content_assets asset
  ON asset.id = sku.content_asset_id
WHERE asset.platform = ?
  AND asset.platform_product_id = ?
ORDER BY asset.captured_at DESC, asset.id DESC, sku.sort_order ASC, sku.id ASC;
```
