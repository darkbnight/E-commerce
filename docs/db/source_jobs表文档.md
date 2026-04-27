# source_jobs 表文档

## 1. 用途

`source_jobs` 记录每一次采集行为的来源页面、执行状态、采集参数和结果摘要。

当前阶段它的职责是做轻量任务留痕，而不是做来源专属流程状态机。它主要回答以下问题：

- 这次什么时候采集
- 从哪个页面或接口采集
- 这次采集成功还是失败
- 采到了多少原始记录、经营快照、内容资产和 SKU
- 如果失败，失败摘要是什么

## 2. 建议字段

| 字段名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | integer | 是 | 主键 |
| `page_name` | text | 是 | 来源页面名称 |
| `page_url` | text | 是 | 采集页面 URL |
| `page_type` | text | 是 | 页面或任务类型，如 `hot_products`、`industry_general`、`product_content_capture` |
| `pagination_mode` | text | 是 | 分页或采集模式，如 `paged`、`api_capture` |
| `job_status` | text | 是 | 任务状态，如 `running`、`success`、`failed` |
| `started_at` | text | 是 | 开始时间 |
| `finished_at` | 否 | 否 | 结束时间 |
| `raw_count` | integer | 是 | 原始记录数 |
| `normalized_count` | integer | 是 | 历史兼容字段，当前可继续表示经营快照入库数 |
| `warning_count` | integer | 是 | 警告数量 |
| `request_count` | integer | 是 | 采集请求数 |
| `success_count` | integer | 是 | 成功请求数 |
| `record_count` | integer | 是 | 当前任务核心业务结果数 |
| `error_type` | text | 否 | 标准错误类型 |
| `error_message` | text | 否 | 错误摘要 |
| `created_at` | text | 是 | 创建时间 |
| `updated_at` | text | 是 | 更新时间 |

## 3. 统计口径

`source_jobs` 保持摘要层职责，不承担来源专属状态机。

建议口径：

- `request_count`：本次采集过程中的请求次数
- `success_count`：成功返回次数
- `record_count`：本次核心业务结果数
- 内容资产采集场景下：
  - `record_count` 可表示产品级内容资产数量
  - SKU 数量可由关联的 `product_content_skus` 聚合统计

## 4. error_type 建议枚举

| 状态 | 说明 |
| --- | --- |
| `login_required` | 登录态缺失 |
| `guest_blocked` | 游客态或账号权限不足 |
| `profile_locked` | 浏览器 profile 被占用 |
| `browser_blocked` | 浏览器启动或访问异常 |
| `api_auth_missing` | 业务接口鉴权缺失 |
| `db_error` | 数据库读写异常 |
| `unknown` | 未归类错误 |

## 5. 表关系

```text
source_jobs.id
  -> products_raw.job_id
  -> product_business_snapshots.job_id
  -> product_content_assets.source_job_id
  -> product_content_skus.source_job_id
```

`source_jobs` 不直接保存商品明细，只保存任务元信息和统计摘要。
