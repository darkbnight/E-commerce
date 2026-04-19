# products_normalized 表文档

## 用途

保存标准化后的商品基础数据，用于后续筛选和分析。

## 建议字段

| 字段名 | 类型 | 说明 |
| --- | --- | --- |
| id | integer | 主键 |
| job_id | integer | 抓取任务 ID，关联 `source_jobs.id` |
| ozon_product_id | text | Ozon 商品 ID |
| product_type | text | 商品类型，如 `cross_border`、`local` |
| brand | text | 品牌，可为空 |
| category_level_1 | text | 一级类目 |
| category_level_2 | text | 二级类目 |
| category_level_3 | text | 三级类目 |
| sales | numeric | 销量 |
| sales_growth | numeric | 销量增长 |
| potential_index | numeric | 潜力指数 |
| revenue | numeric | 销售额 |
| add_to_cart_rate | numeric | 商品卡加购物车率 |
| impressions | numeric | 曝光数 |
| clicks | numeric | 点击数 |
| view_rate | numeric | 浏览率 |
| ad_cost | numeric | 广告费 |
| ad_cost_rate | numeric | 广告费占比 |
| order_conversion_rate | numeric | 订单转化率 |
| estimated_gross_margin | numeric | 预估毛利率 |
| shipping_mode | text | 发货模式 |
| delivery_time | text | 配送时间 |
| average_sales_amount | numeric | 平均销售额 |
| length_cm | numeric | 长 |
| width_cm | numeric | 宽 |
| height_cm | numeric | 高 |
| weight_g | numeric | 重量 |
| raw_record_id | integer | 对应原始记录 ID，可关联 `products_raw.id` |
| parse_status | text | 标准化状态，如 `complete`、`partial` |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

