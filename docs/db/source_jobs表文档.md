# source_jobs 表文档

## 1. 用途

`source_jobs` 记录每一次采集任务的执行状态、来源页面、采集参数和结果摘要。

本次数据库重构中，`source_jobs` 暂时不调整字段结构。它继续作为采集任务数据层，回答以下问题：

- 这次什么时候采集？
- 从哪个页面或接口采集？
- 任务是否成功？
- 采集到了多少原始记录和业务记录？
- 如果失败，失败类型和错误摘要是什么？

## 2. 建议字段

| 字段名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | integer | 是 | 主键 |
| `page_name` | text | 是 | 来源页面名称 |
| `page_url` | text | 是 | 采集页面 URL |
| `page_type` | text | 是 | 页面/任务类型，如 `hot_products`、`industry_general` |
| `pagination_mode` | text | 是 | 分页或采集模式，如 `paged`、`api_capture` |
| `job_status` | text | 是 | 任务状态，如 `running`、`success`、`failed` |
| `started_at` | text | 是 | 开始时间 |
| `finished_at` | text | 否 | 结束时间 |
| `raw_count` | integer | 是 | 原始记录数 |
| `normalized_count` | integer | 是 | 历史字段，后续语义对应经营快照入库数 |
| `warning_count` | integer | 是 | 警告数量 |
| `request_count` | integer | 是 | 采集请求数 |
| `success_count` | integer | 是 | 成功请求数 |
| `record_count` | integer | 是 | 采集结果记录数 |
| `error_type` | text | 否 | 标准错误类型 |
| `error_message` | text | 否 | 错误摘要 |
| `created_at` | text | 是 | 创建时间 |
| `updated_at` | text | 是 | 更新时间 |

## 3. 统计口径

`raw_count`、`normalized_count`、`warning_count` 是早期商品采集链路字段，继续保留兼容。

`request_count`、`success_count`、`record_count` 用于跨任务类型统一展示，避免行业采集、商品采集等不同任务类型在任务页被误读。

建议后续迁移到 `product_business_snapshots` 后：

- `normalized_count` 表示经营快照入库数。
- `record_count` 表示当前任务核心业务结果数量。

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
```

`source_jobs` 不直接保存商品明细，只保存任务元信息和统计摘要。
