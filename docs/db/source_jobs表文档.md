# source_jobs 表文档

## 用途

记录每次抓取任务的执行状态、来源页面和结果摘要。

## 建议字段

| 字段名 | 类型 | 说明 |
| --- | --- | --- |
| id | integer | 主键 |
| page_name | text | 来源页面名称 |
| page_url | text | 抓取页面 URL |
| page_type | text | 页面类型，如列表页 |
| pagination_mode | text | 分页模式，如 `page`、`scroll` |
| job_status | text | 任务状态，如 `running`、`success`、`failed` |
| started_at | datetime | 开始时间 |
| finished_at | datetime | 结束时间 |
| raw_count | integer | 原始记录数 |
| normalized_count | integer | 标准化记录数 |
| warning_count | integer | 警告数 |
| request_count | integer | 采集请求数。行业任务表示请求的类目数，商品任务表示捕获的业务接口响应数 |
| success_count | integer | 成功请求数 |
| record_count | integer | 采集结果记录数。行业任务表示类目记录数，商品任务表示标准化入库商品数 |
| error_type | text | 标准错误类型，如 `login_required`、`guest_blocked`、`profile_locked`、`browser_blocked`、`api_auth_missing`、`db_error` |
| error_message | text | 错误摘要 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

## 统计口径

- `raw_count` / `normalized_count` / `warning_count` 继续服务商品级采集结果，兼容热销商品入库链路。
- `request_count` / `success_count` / `record_count` 用于跨任务类型的统一展示，避免行业数据被误读成商品入库数。
- `error_type` 用于任务页给出可操作的问题类型和处理建议，`error_message` 保留原始错误摘要。
