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
| error_message | text | 错误摘要 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

