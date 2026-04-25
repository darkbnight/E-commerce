# 字段与验收口径

## 1. 上游接口

当前内容资产采集依赖两类接口：

### 采集箱列表

- 路径：`POST /api/ozon-report-service/v1/productLibrary/pageQuery`
- 作用：按商品 ID 在采集箱中查记录，并拿到 `libraryId`
- 关键字段：
  - `id`：采集箱记录 ID，后续作为 `libraryId`
  - `sourceDataId`：平台商品 ID
  - `sourceDataExpandData.url`：原始商品链接

### 商品编辑详情

- 路径：`GET /api/ozon-report-service/v1/improveEditing/{libraryId}`
- 作用：获取标题、属性、描述、标签、SKU 图片等内容资产详情
- 关键字段：
  - `offerName`
  - `attributes`
  - `attrValueMap`
  - `height`, `width`, `depth`, `weight`
  - `sourceFormId`
  - `sourceFromPlatform`
  - `skus[].skuImages`

## 2. 标准化字段映射

当前脚本的标准化口径如下：

- 商品身份：`platform + platform_product_id`
- `platform`：固定为 `ozon`
- `platform_product_id`：优先 `detail.sourceFormId`，其次 `libraryItem.sourceDataId`
- `product_url`：`libraryItem.sourceDataExpandData.url`
- `title`：`detail.offerName`
- `description`：属性 `4191`
- `tags`：属性 `23171`
- `main_image_url`：所有 SKU 图片去重后的第一张
- `image_urls`：所有 `skus[].skuImages` 去重汇总
- `skus[].platform_sku_id`：优先 SKU 自身 ID 或稳定拼接值
- `skus[].sku_name`：SKU 标题或商品标题
- `skus[].price` / `currency_code`：从 SKU 价格字段映射

如果上游接口没有返回真实标题，而 `offerName` 只是商品 ID，应该明确说明这是上游返回现状，不要误判为脚本错误。

## 3. 数据库表

### `product_content_assets`

主记录表，至少关注：
- `id`
- `source_job_id`
- `platform`
- `platform_product_id`
- `title`
- `description`
- `tags_json`
- `main_image_url`
- `image_urls_json`
- `content_hash`
- `captured_at`

### `product_content_skus`

SKU 资产表，至少关注：
- `id`
- `content_asset_id`
- `platform_product_id`
- `platform_sku_id`
- `sku_name`
- `price`
- `currency_code`
- `images_json`
- `sort_order`

### `source_jobs`

任务追踪表，至少关注：
- `id`
- `page_type`
- `job_status`
- `request_count`
- `success_count`
- `record_count`
- `error_type`
- `error_message`

## 4. 最低验收标准

判定“已稳定返回内容资产数据”至少需要同时满足：

1. 前置检查通过，存在可用登录态和授权请求
2. 内容资产采集命令返回 `ok=true`
3. 成功命中目标商品 `libraryId`
4. `product_content_assets` 有对应商品记录
5. `product_content_skus` 有与该内容版本关联的 SKU 记录
6. `source_jobs` 记录为 `success`

只满足页面截图或命令行打印，不足以判定稳定。

## 5. 实采样例

已验证样例：
- 商品 ID：`2755299450`
- 命中 `libraryId`：`2091125402`
- 核心结果：
  - 标题：上游返回为 `2755299450`
  - 主题标签：`["#чистый_дом"]`
  - 图片数：`5`
  - SKU 数：`1`

这个样例适合做回归验证，但不要把单一样例当成字段稳定性的全部证明。
