# products_raw 表文档

## 用途

保存抓取到的原始商品载荷，便于回溯和重新解析。

## 建议字段

| 字段名 | 类型 | 说明 |
| --- | --- | --- |
| id | integer | 主键 |
| job_id | integer | 抓取任务 ID，关联 `source_jobs.id` |
| record_key | text | 原始记录唯一标识 |
| raw_payload | text | 原始 JSON 文本 |
| parse_status | text | 解析状态，如 `pending`、`parsed`、`failed` |
| parse_error | text | 解析错误摘要 |
| captured_at | datetime | 抓取时间 |
| created_at | datetime | 创建时间 |

