# product_content_assets 表文档

## 1. 用途

`product_content_assets` 记录商品的产品级内容资产，包括标题、描述、标签、主图和多图等字段。

它和 `product_business_snapshots` 分开存放，因为两类数据变化频率不同：

- 经营快照是时序数据，可能每天采集
- 内容资产是内容版本数据，只在内容变化时新增版本

它也和 `product_content_skus` 分开存放，因为 SKU 属于某个内容版本下的子集，不应该直接塞进产品级内容表。

## 2. 核心规则

- 商品身份通过 `platform + platform_product_id` 表达
- `source_job_id` 只表示这条内容资产来自哪次采集行为
- 默认保留内容版本能力，通过 `content_hash` 判断内容是否变化
- 当前阶段不强制单独保存显式 `version_no`
- 页面默认读取同一商品最新一条内容记录，最新口径以 `captured_at` 为准

## 3. 建议建表语句

```sql
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

  UNIQUE(platform, platform_product_id, content_hash),
  FOREIGN KEY(source_job_id) REFERENCES source_jobs(id)
);
```

## 4. 建议索引

```sql
CREATE INDEX IF NOT EXISTS idx_product_content_assets_product
ON product_content_assets(platform, platform_product_id);

CREATE INDEX IF NOT EXISTS idx_product_content_assets_source_job
ON product_content_assets(source_job_id);

CREATE INDEX IF NOT EXISTS idx_product_content_assets_captured_at
ON product_content_assets(captured_at);
```

## 5. 字段说明

| 字段名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | integer | 是 | 主键 |
| `source_job_id` | integer | 否 | 来源采集任务 ID，关联 `source_jobs.id` |
| `platform` | text | 是 | 平台标识，如 `ozon` |
| `platform_product_id` | text | 是 | 平台商品 ID |
| `product_url` | text | 否 | 商品详情页链接 |
| `title` | text | 否 | 商品标题 |
| `description` | text | 否 | 商品描述 |
| `tags_json` | text | 否 | 商品标签 JSON 文本 |
| `main_image_url` | text | 否 | 主图 URL |
| `image_urls_json` | text | 否 | 产品级图片 URL 列表 JSON 文本 |
| `content_hash` | text | 是 | 内容指纹，用于判断内容版本是否变化 |
| `captured_at` | text | 是 | 内容采集时间，也是“最新版本”主要判断口径 |
| `created_at` | text | 是 | 记录创建时间 |
| `updated_at` | text | 是 | 记录更新时间 |

## 6. 版本判断规则

推荐按以下顺序判断：

1. 先根据 `platform + platform_product_id` 找到同一商品历史内容
2. 再比较最新一条内容记录的 `content_hash`
3. 如果 `content_hash` 相同，认为内容未变化，不新增新版本
4. 如果 `content_hash` 不同，新增一条新的内容资产记录

注意：

- `content_hash` 用于判断“是不是同一版内容”
- `captured_at` 用于判断“哪一版最新”
- 当前阶段不强制维护显式版本号

## 7. 典型查询

读取某个商品最新内容版本：

```sql
SELECT *
FROM product_content_assets
WHERE platform = ? AND platform_product_id = ?
ORDER BY captured_at DESC, id DESC
LIMIT 1;
```

查询某个商品全部内容历史：

```sql
SELECT *
FROM product_content_assets
WHERE platform = ? AND platform_product_id = ?
ORDER BY captured_at DESC, id DESC;
```

查询同一次采集行为产出的内容资产：

```sql
SELECT *
FROM product_content_assets
WHERE source_job_id = ?
ORDER BY captured_at DESC, id DESC;
```
