# API接口文档

## 萌拉采集结果展示页

### GET /api/jobs
#### 说明
返回最近 20 条萌拉采集任务记录。

#### 返回字段
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | number | 任务ID |
| `page_name` | string | 页面名称 |
| `page_url` | string | 页面地址 |
| `page_type` | string | 页面类型 |
| `pagination_mode` | string | 分页方式 |
| `job_status` | string | 任务状态 |
| `started_at` | string | 开始时间 |
| `finished_at` | string | 结束时间 |
| `raw_count` | number | 原始记录数 |
| `normalized_count` | number | 标准化记录数 |
| `warning_count` | number | 警告数 |
| `error_message` | string\|null | 错误信息 |

### GET /api/products
#### 说明
读取最新成功任务或指定任务下的标准化商品数据，支持基础筛选与分页。

#### 请求参数
| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `jobId` | number | 否 | 指定任务ID，默认最新成功任务 |
| `page` | number | 否 | 页码，默认 `1` |
| `pageSize` | number | 否 | 每页条数，默认 `20`，最大 `100` |
| `keyword` | string | 否 | 关键词，匹配商品ID / 品牌 / 类目 |
| `productType` | string | 否 | 商品类型 |
| `categoryLevel1` | string | 否 | 一级类目 |
| `minSales` | number | 否 | 最低销量 |
| `minRevenue` | number | 否 | 最低销售额 |
| `sort` | string | 否 | 排序方式，可选值：`sales_desc`、`sales_growth_desc`、`revenue_desc`、`margin_desc`、`impressions_desc` |

#### 返回结构
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `latestJob` | object\|null | 当前使用的任务信息 |
| `filters` | object | 回显后的筛选条件 |
| `options` | object | 页面筛选下拉选项 |
| `summary` | object\|null | 当前任务汇总指标 |
| `items` | array | 当前页商品列表 |
| `total` | number | 匹配总数 |
