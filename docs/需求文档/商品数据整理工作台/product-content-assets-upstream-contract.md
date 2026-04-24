# 商品数据整理工作台 product_content_assets 上游对接契约

## 1. 文档目的

这份文档用于约定“商品草稿编辑”页签和上游内容采集链路的真实对接方式。

当前约定变更为：商品草稿编辑的内容上游以 `product_content_assets` 为主。上游同学只负责把商品详情内容稳定写入 `product_content_assets`，下游商品数据整理工作台负责读取这些内容、生成可编辑草稿，并把整理后的最终数据写入 `product_content_result`。

核心目标是保护双方开发进度：

- 上游不用提前实现草稿、价格、库存、Ozon 发布校验。
- 下游不用猜测内容采集结果，也不直接读取采集过程里的临时结构。
- 双方通过 SQLite 表字段和 JSON 格式对接，减少同一代码文件上的冲突。

## 2. 当前事实

截至 2026-04-24，代码和数据库状态如下：

- `product_content_assets` 表已经存在，定位是商品内容资产表，字段包含标题、描述、属性、标签、图片 URL、下载结果、内容状态等。
- 当前本地库 `db/ecommerce-workbench.sqlite` 中 `product_content_assets` 还是 0 条数据。
- 当前热销商品采集脚本说明里仍标注：热销采集不主动写入 `product_content_assets`。
- 商品数据整理工作台当前候选商品读取链路仍是 `source_jobs + product_business_snapshots`。
- 商品草稿编辑和最终 Ozon import item 当前写入 `product_content_result`。

因此，本次对接不是只改页面文案，而是要形成新的数据流：

```text
source_jobs / product_business_snapshots
        |
        | 上游内容补采、详情解析、图片整理
        v
product_content_assets
        |
        | 商品数据整理工作台读取内容资产，并按需关联经营快照
        v
product_content_result
        |
        | 已整理草稿、Ozon import item、校验状态
        v
Ozon 上货工具
```

## 3. 职责边界

### 3.1 上游负责

上游负责写入 `product_content_assets`：

- 商品详情标题。
- 商品描述。
- 商品详情属性或已映射的 Ozon 属性候选。
- 商品主图 URL。
- 商品图片 URL 列表。
- 图片下载或处理结果。
- 内容采集状态。
- 来源任务和来源快照关联。
- 内容版本去重所需的 `content_hash`。

上游不负责写入 `product_content_result`。

上游也不需要在第一阶段提供这些发布字段：

- `offer_id`
- `price`
- `old_price`
- `premium_price`
- `min_price`
- `currency_code`
- `vat`
- `barcode`
- `warehouse_id`
- `stock`
- `description_category_id`
- `type_id`

这些字段由商品数据整理工作台、店铺配置、人工编辑或 Ozon 类目接口补齐。

### 3.2 商品数据整理工作台负责

商品数据整理工作台负责：

- 从 `product_content_assets` 读取内容资产作为主要候选来源。
- 通过 `source_snapshot_id` 关联 `product_business_snapshots`，补充销量、类目文本、品牌、尺寸重量等经营快照字段。
- 创建和编辑草稿。
- 把整理后的草稿和 Ozon import item 写入 `product_content_result`。
- 校验草稿是否达到可导出状态。

商品数据整理工作台不反向修改 `product_content_assets`。

## 4. product_content_assets 最小可对接字段

上游第一阶段至少要稳定写入以下字段。没有这些字段，下游可以显示空列表或只能生成质量很低的草稿。

| 字段 | 要求 | 说明 |
| --- | --- | --- |
| `platform` | 必填 | 当前固定为 `ozon`。 |
| `platform_product_id` | 必填 | 平台商品 ID，用于跨表关联和去重。 |
| `source_job_id` | 强烈建议 | 关联 `source_jobs.id`，用于追踪内容采集批次。 |
| `source_snapshot_id` | 强烈建议 | 关联 `product_business_snapshots.id`，用于补充品牌、类目、销量、尺寸重量。 |
| `title` | 必填 | 商品详情标题，下游默认映射到草稿 `name`。 |
| `description` | 建议 | 商品详情描述，下游默认映射到草稿 `description`。 |
| `main_image_url` | 建议 | 主图 URL。 |
| `image_urls_json` | 建议 | 图片 URL 数组 JSON。 |
| `attributes_json` | 建议 | 商品属性 JSON。可以先是原始详情属性，后续再升级为 Ozon 属性候选。 |
| `content_hash` | 强烈建议 | 用于内容版本去重。建议不要留空。 |
| `content_status` | 必填 | 内容处理状态。 |
| `captured_at` | 建议 | 内容采集完成时间。 |
| `created_at` | 必填 | 记录创建时间。 |
| `updated_at` | 必填 | 记录更新时间。 |

`product_content_assets` 可以不新增发布字段。第一阶段更重要的是把内容资产写稳定。

## 5. 状态约定

建议上游继续使用现有状态枚举：

| `content_status` | 下游处理方式 | 说明 |
| --- | --- | --- |
| `pending` | 默认不进入草稿候选列表 | 已占位但内容未采集。 |
| `capturing` | 默认不进入草稿候选列表 | 正在采集中。 |
| `captured` | 可进入候选列表 | 商品详情内容已采集，但图片下载可能未完成。 |
| `image_pending` | 可进入候选列表，但图片状态提示待处理 | 内容已采集，图片处理排队中。 |
| `image_downloaded` | 优先进入候选列表 | 内容和图片处理都较完整。 |
| `failed` | 默认不进入候选列表，可做问题筛选 | 内容采集或图片处理失败。 |

下游默认读取：

```sql
content_status IN ('captured', 'image_pending', 'image_downloaded')
```

如果上游需要让失败商品也进入人工处理，可以后续增加筛选参数，不建议第一阶段默认展示 `failed`。

## 6. JSON 字段格式

### 6.1 image_urls_json

推荐写成字符串数组：

```json
[
  "https://cdn.example.com/product-main.jpg",
  "https://cdn.example.com/product-detail-1.jpg"
]
```

也兼容对象数组：

```json
[
  {
    "url": "https://cdn.example.com/product-main.jpg",
    "sortOrder": 1,
    "isMain": true
  },
  {
    "url": "https://cdn.example.com/product-detail-1.jpg",
    "sortOrder": 2,
    "isMain": false
  }
]
```

约定：

- `main_image_url` 应该出现在 `image_urls_json` 里，最好排第一。
- 图片 URL 必须是下游可访问的 HTTP/HTTPS URL。
- 空数组可以写 `[]`，不要写非 JSON 文本。

### 6.2 attributes_json

第一阶段允许写原始详情属性：

```json
[
  {
    "name": "Brand",
    "values": [
      {
        "value": "No brand"
      }
    ]
  },
  {
    "name": "Material",
    "values": [
      {
        "value": "Plastic"
      }
    ]
  }
]
```

如果上游已经能映射到 Ozon 属性，建议写成下游可直接预填的格式：

```json
[
  {
    "attributeId": 85,
    "complexId": 0,
    "name": "Brand",
    "values": [
      {
        "value": "No brand",
        "dictionaryValueId": 971082156
      }
    ]
  }
]
```

约定：

- `attributeId` 有值时，下游会把它视为 Ozon 属性候选。
- 只有 `name` 没有 `attributeId` 时，下游只把它当作参考内容，不保证能直接导出给 Ozon。
- `values` 必须是数组。
- 字典属性如果有 Ozon 字典值 ID，使用 `dictionaryValueId`。

### 6.3 downloaded_images_json

如果上游已经做图片下载或转存，建议写成：

```json
[
  {
    "sourceUrl": "https://cdn.example.com/product-main.jpg",
    "localPath": "storage/product-images/ozon/123/main.jpg",
    "status": "downloaded",
    "width": 1200,
    "height": 1200,
    "mimeType": "image/jpeg"
  }
]
```

第一阶段下游仍以 `image_urls_json` 作为建草稿图片来源。`downloaded_images_json` 先用于展示处理状态和后续图片工作台扩展。

## 7. content_hash 约定

`content_hash` 用于同一商品内容版本去重。虽然当前表结构允许为空，但对接契约里建议上游必须写。

推荐规则：

```text
sha256(platform + platform_product_id + title + description + attributes_json + image_urls_json)
```

注意事项：

- 同一商品同一内容版本应该生成相同 `content_hash`。
- 内容变化后生成新的 `content_hash`，保留历史版本。
- 如果只是 `content_status` 从 `captured` 更新到 `image_downloaded`，但内容没有变化，可以复用同一个 `content_hash` 并更新原记录。
- 不建议长期留空，因为 SQLite 的 `UNIQUE(platform, platform_product_id, content_hash)` 对 `NULL` 不会形成稳定去重。

推荐 upsert：

```sql
INSERT INTO product_content_assets (
  platform,
  platform_product_id,
  product_url,
  source_job_id,
  source_snapshot_id,
  title,
  description,
  attributes_json,
  tags_json,
  main_image_url,
  image_urls_json,
  downloaded_images_json,
  content_hash,
  content_status,
  captured_at,
  created_at,
  updated_at
) VALUES (
  @platform,
  @platformProductId,
  @productUrl,
  @sourceJobId,
  @sourceSnapshotId,
  @title,
  @description,
  @attributesJson,
  @tagsJson,
  @mainImageUrl,
  @imageUrlsJson,
  @downloadedImagesJson,
  @contentHash,
  @contentStatus,
  @capturedAt,
  @now,
  @now
)
ON CONFLICT(platform, platform_product_id, content_hash) DO UPDATE SET
  product_url = excluded.product_url,
  source_job_id = excluded.source_job_id,
  source_snapshot_id = excluded.source_snapshot_id,
  title = excluded.title,
  description = excluded.description,
  attributes_json = excluded.attributes_json,
  tags_json = excluded.tags_json,
  main_image_url = excluded.main_image_url,
  image_urls_json = excluded.image_urls_json,
  downloaded_images_json = excluded.downloaded_images_json,
  content_status = excluded.content_status,
  captured_at = excluded.captured_at,
  updated_at = excluded.updated_at;
```

## 8. 下游读取方式

商品数据整理工作台切换后，建议读取每个商品最新的一条内容资产，并关联经营快照：

```sql
WITH ranked_assets AS (
  SELECT
    product_content_assets.*,
    ROW_NUMBER() OVER (
      PARTITION BY platform, platform_product_id
      ORDER BY
        COALESCE(captured_at, updated_at, created_at) DESC,
        id DESC
    ) AS rn
  FROM product_content_assets
  WHERE content_status IN ('captured', 'image_pending', 'image_downloaded')
)
SELECT
  ranked_assets.id AS content_asset_id,
  ranked_assets.platform,
  ranked_assets.platform_product_id,
  ranked_assets.product_url,
  ranked_assets.source_job_id,
  ranked_assets.source_snapshot_id,
  ranked_assets.title,
  ranked_assets.description,
  ranked_assets.attributes_json,
  ranked_assets.main_image_url,
  ranked_assets.image_urls_json,
  ranked_assets.downloaded_images_json,
  ranked_assets.content_status,
  ranked_assets.captured_at,
  product_business_snapshots.brand,
  product_business_snapshots.category_level_1,
  product_business_snapshots.category_level_2,
  product_business_snapshots.category_level_3,
  product_business_snapshots.sales_volume,
  product_business_snapshots.sales_amount,
  product_business_snapshots.length_cm,
  product_business_snapshots.width_cm,
  product_business_snapshots.height_cm,
  product_business_snapshots.weight_g,
  source_jobs.page_name,
  source_jobs.page_type,
  source_jobs.finished_at
FROM ranked_assets
LEFT JOIN product_business_snapshots
  ON product_business_snapshots.id = ranked_assets.source_snapshot_id
LEFT JOIN source_jobs
  ON source_jobs.id = ranked_assets.source_job_id
WHERE ranked_assets.rn = 1
ORDER BY
  COALESCE(ranked_assets.captured_at, ranked_assets.updated_at, ranked_assets.created_at) DESC,
  ranked_assets.id DESC
LIMIT ?;
```

如果 `source_snapshot_id` 暂时无法提供，下游可以按 `platform + platform_product_id` 回退关联最新经营快照，但这只能作为兼容策略。正式对接应优先写 `source_snapshot_id`。

## 9. 字段映射

商品数据整理工作台从内容资产创建草稿时，建议按以下规则预填：

| 草稿字段 | 来源 | 规则 |
| --- | --- | --- |
| `sourceJobId` | `product_content_assets.source_job_id` | 原样继承。 |
| `sourceSnapshotId` | `product_content_assets.source_snapshot_id` | 原样继承。 |
| `platform` | `product_content_assets.platform` | 默认 `ozon`。 |
| `platformProductId` | `product_content_assets.platform_product_id` | 原样继承。 |
| `ozonProductId` | `product_content_assets.platform_product_id` | 当前竞品/平台商品 ID。 |
| `name` | `product_content_assets.title` | 作为发布标题初稿，后续可人工或 AI 改写。 |
| `description` | `product_content_assets.description` | 作为发布描述初稿。 |
| `vendor` | `product_business_snapshots.brand` | 只作候选值，人工可修改。 |
| `images` | `main_image_url` + `image_urls_json` | 转成 `{ url, sortOrder, isMain }`。 |
| `attributes` | `attributes_json` | Ozon 格式则预填；原始属性只作参考候选。 |
| `packageDepthMm` | `product_business_snapshots.length_cm` | `cm * 10`，人工复核。 |
| `packageWidthMm` | `product_business_snapshots.width_cm` | `cm * 10`，人工复核。 |
| `packageHeightMm` | `product_business_snapshots.height_cm` | `cm * 10`，人工复核。 |
| `packageWeightG` | `product_business_snapshots.weight_g` | 原样继承，人工复核。 |

下列字段不从 `product_content_assets` 强行生成：

| 草稿字段 | 原因 |
| --- | --- |
| `offerId` | 商家货号需要店铺规则或人工确认，不能用平台商品 ID 代替。 |
| `descriptionCategoryId` | 需要 Ozon 类目接口或人工选择。 |
| `typeId` | 需要 Ozon 类目接口或人工选择。 |
| `price` | 不能用销售额或竞品价格直接替代。 |
| `currencyCode` | 应来自店铺配置。 |
| `vat` | 应来自税务配置或人工确认。 |
| `barcode` | 不能复制竞品条码。 |
| `warehouseId` | 应来自店铺仓库配置。 |
| `stock` | 应来自库存链路或人工录入。 |

## 10. 最小联调验收

上游完成第一阶段后，至少满足以下检查：

1. `product_content_assets` 有非 0 数据。
2. 至少 1 条记录满足 `content_status IN ('captured', 'image_pending', 'image_downloaded')`。
3. 满足条件的记录有 `platform='ozon'` 和非空 `platform_product_id`。
4. 满足条件的记录有非空 `title`。
5. `image_urls_json` 是合法 JSON；如果没有图片，写 `[]`。
6. `attributes_json` 是合法 JSON；如果没有属性，写 `[]`。
7. `source_snapshot_id` 能关联到 `product_business_snapshots.id`，或者明确说明该批数据没有经营快照来源。
8. `content_hash` 非空，重复采集同一内容不会无限新增重复版本。
9. 上游不写 `product_content_result`。
10. 下游从该记录创建草稿后，只在 `product_content_result` 中新增或更新结果。

可用以下 SQL 快速检查：

```sql
SELECT
  COUNT(*) AS ready_asset_count
FROM product_content_assets
WHERE content_status IN ('captured', 'image_pending', 'image_downloaded')
  AND platform = 'ozon'
  AND platform_product_id IS NOT NULL
  AND platform_product_id <> ''
  AND title IS NOT NULL
  AND title <> '';
```

检查来源快照关联：

```sql
SELECT
  product_content_assets.id,
  product_content_assets.platform_product_id,
  product_content_assets.title,
  product_content_assets.source_snapshot_id,
  product_business_snapshots.id AS joined_snapshot_id,
  product_business_snapshots.brand,
  product_business_snapshots.length_cm,
  product_business_snapshots.width_cm,
  product_business_snapshots.height_cm,
  product_business_snapshots.weight_g
FROM product_content_assets
LEFT JOIN product_business_snapshots
  ON product_business_snapshots.id = product_content_assets.source_snapshot_id
WHERE product_content_assets.content_status IN ('captured', 'image_pending', 'image_downloaded')
ORDER BY product_content_assets.id DESC
LIMIT 20;
```

## 11. 双方开发顺序建议

### 11.1 上游优先做

1. 在内容采集或详情补采完成后写入 `product_content_assets`。
2. 保证 `platform_product_id`、`source_snapshot_id`、`title`、`image_urls_json`、`content_status` 稳定。
3. 补 `content_hash`，避免重复版本膨胀。
4. 把图片处理状态写入 `content_status` 和 `downloaded_images_json`。

### 11.2 下游随后做

1. 新增 `readDbCandidatesFromContentAssets`，优先读取 `product_content_assets`。
2. 保留短期 fallback：如果 `product_content_assets` 没有可用记录，继续读取 `product_business_snapshots`，避免上游开发期间页面空白。
3. `POST /api/product-data-prep/drafts` 创建草稿时，把 `content_asset_id` 对应的资产转换为草稿初始值。
4. 保存、校验、导出仍全部使用 `product_content_result`。
5. 当上游数据稳定后，再考虑移除 fallback 或改成显式筛选。

## 12. 不建议做的事

- 不建议让上游直接写 `product_content_result`。
- 不建议在 `product_content_assets` 里加入大量发布草稿字段，避免内容资产表变成草稿表。
- 不建议用 `platform_product_id` 当 `offer_id`。
- 不建议把 `product_business_snapshots` 的 `sales_amount` 当 `price`。
- 不建议忽略 `source_snapshot_id`，否则下游会丢失品牌、类目、销量、尺寸重量等上下文。
- 不建议把非 JSON 字符串写入 `image_urls_json`、`attributes_json`、`downloaded_images_json`。

## 13. 第一阶段完成定义

当以下链路跑通，可以认为双方完成第一阶段对接：

```text
上游采集商品详情
-> 写入 product_content_assets
-> 商品数据整理工作台读取该表
-> 用户创建草稿
-> 草稿保存到 product_content_result
-> 校验生成 ozon_import_item_json
```

第一阶段不要求自动完成 Ozon 类目选择、价格策略、库存对接和真实上货。

