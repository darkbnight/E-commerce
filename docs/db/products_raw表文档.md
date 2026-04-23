# products_raw 表文档

## 1. 用途

`products_raw` 保存采集过程中得到的原始载荷，用于排错、回放和重新解析。

本次数据库重构中，`products_raw` 暂时不调整字段结构。它不是核心业务表，不直接服务结果筛选和商品处理页面，但保留它可以降低采集字段变化时的排查成本。

## 2. 建议字段

| 字段名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | integer | 是 | 主键 |
| `job_id` | integer | 是 | 采集任务 ID，关联 `source_jobs.id` |
| `record_key` | text | 是 | 原始记录唯一标识 |
| `raw_payload` | text | 是 | 原始 JSON 文本 |
| `parse_status` | text | 是 | 解析状态，如 `pending`、`parsed`、`failed` |
| `parse_error` | text | 否 | 解析错误摘要 |
| `captured_at` | text | 是 | 采集时间 |
| `created_at` | text | 是 | 创建时间 |

## 3. 唯一性规则

建议继续保留：

```text
UNIQUE(job_id, record_key)
```

同一次采集任务中，同一条原始记录只保留一份，避免重复响应导致重复入库。

## 4. 表关系

```text
source_jobs.id
  -> products_raw.job_id

products_raw.id
  -> product_business_snapshots.raw_record_id
```

一条原始记录可能成功解析为一条经营快照，也可能因为字段缺失、页面结构变化或解析失败而没有对应快照。

## 5. 使用边界

`products_raw` 仅用于技术追溯，不建议业务页面直接依赖它。

结果展示、商品初筛和商品二次处理应优先读取：

```text
product_business_snapshots
product_content_assets
```
