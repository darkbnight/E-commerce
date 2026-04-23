# product_content_assets 表文档

## 1. 用途

`product_content_assets` 记录商品内容资料，包括标题、描述、属性、标签、图片 URL 和图片下载结果。

它和经营快照分开存放，因为内容数据和经营数据的更新频率不同。销量、销售额、曝光、点击等经营数据可能每次采集都会变化；商品详情、图片、标签通常来自详情页补采或后续处理流程，不一定每个批次都会采集。

## 2. 核心规则

- 商品内容通过 `platform + platform_product_id` 关联商品。
- `source_job_id` 只表示内容采集来源，不代表内容必须绑定某个批次。
- `source_snapshot_id` 可用于追溯内容补采来自哪条经营快照。
- 默认保留内容版本能力，通过 `content_hash` 判断内容是否变化。
- 页面默认读取同一商品最新一条内容记录。

## 3. 建议建表语句

```sql
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

  UNIQUE(platform, platform_product_id, content_hash),
  FOREIGN KEY(source_job_id) REFERENCES source_jobs(id),
  FOREIGN KEY(source_snapshot_id) REFERENCES product_business_snapshots(id)
);
```

## 4. 建议索引

```sql
CREATE INDEX IF NOT EXISTS idx_product_content_assets_product
ON product_content_assets(platform, platform_product_id);

CREATE INDEX IF NOT EXISTS idx_product_content_assets_source_job
ON product_content_assets(source_job_id);

CREATE INDEX IF NOT EXISTS idx_product_content_assets_status
ON product_content_assets(content_status);
```

## 5. 字段说明

| 字段名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | integer | 是 | 主键 |
| `platform` | text | 是 | 平台标识，如 `ozon` |
| `platform_product_id` | text | 是 | 平台商品 ID |
| `product_url` | text | 否 | 商品详情页链接 |
| `source_job_id` | integer | 否 | 内容采集任务 ID，关联 `source_jobs.id` |
| `source_snapshot_id` | integer | 否 | 来源经营快照 ID，关联 `product_business_snapshots.id` |
| `title` | text | 否 | 商品详情标题 |
| `description` | text | 否 | 商品描述 |
| `attributes_json` | text | 否 | 商品属性 JSON 文本 |
| `tags_json` | text | 否 | 商品标签 JSON 文本 |
| `main_image_url` | text | 否 | 主图 URL |
| `image_urls_json` | text | 否 | 图片 URL 列表 JSON 文本 |
| `downloaded_images_json` | text | 否 | 已下载图片文件信息 JSON 文本 |
| `content_hash` | text | 否 | 内容摘要，用于判断内容版本是否变化 |
| `content_status` | text | 是 | 内容处理状态 |
| `captured_at` | text | 否 | 内容采集时间 |
| `created_at` | text | 是 | 记录创建时间 |
| `updated_at` | text | 是 | 记录更新时间 |

## 6. content_status 建议枚举

| 状态 | 说明 |
| --- | --- |
| `pending` | 待补充内容 |
| `capturing` | 内容采集中 |
| `captured` | 内容已采集 |
| `image_pending` | 待下载图片 |
| `image_downloaded` | 图片已下载 |
| `failed` | 内容采集或图片下载失败 |

## 7. 典型查询

读取某个商品最新内容：

```sql
SELECT *
FROM product_content_assets
WHERE platform = ? AND platform_product_id = ?
ORDER BY captured_at DESC, id DESC
LIMIT 1;
```

查询待补充内容的商品：

```sql
SELECT *
FROM product_content_assets
WHERE content_status IN ('pending', 'failed')
ORDER BY updated_at ASC, id ASC;
```
