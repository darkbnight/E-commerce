# product_selection_items 表文档

## 1. 用途

`product_selection_items` 记录商品进入“商品筛选”工作台后的处理状态。

它不是原始经营快照，也不是最终上架草稿。它的核心职责是承接：

- 初步筛选
- 测价与利润判断
- 供应链寻找
- 竞品数据整理
- 流转商品数据整理

## 2. 核心规则

- 每个来源商品在同一来源任务中只保留一条筛选工作台记录。
- 来源信息必须保留，不能因为页面主视角改为商品就丢失来源批次。
- `selection_stage` 表示当前阶段。
- `pricing_decision` 表示测价后的利润判断。
- 原始经营数据不回写到 `product_business_snapshots`。

## 3. 建议建表语句

```sql
CREATE TABLE IF NOT EXISTS product_selection_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  source_job_id INTEGER NOT NULL,
  source_snapshot_id INTEGER NOT NULL,
  source_platform TEXT NOT NULL DEFAULT 'ozon',
  source_platform_product_id TEXT NOT NULL,

  selection_stage TEXT NOT NULL DEFAULT 'pool_pending',
  selection_result TEXT,
  selection_note TEXT,

  initial_cost_price REAL,
  initial_delivery_cost REAL,
  initial_target_price REAL,
  initial_profit_rate REAL,
  pricing_decision TEXT NOT NULL DEFAULT 'pending',

  supply_match_status TEXT NOT NULL DEFAULT 'pending',
  supply_reference_url TEXT,
  supply_vendor_name TEXT,

  competitor_packet_status TEXT NOT NULL DEFAULT 'pending',
  transfer_to_prep_at TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  UNIQUE(source_job_id, source_platform, source_platform_product_id),
  FOREIGN KEY(source_job_id) REFERENCES source_jobs(id),
  FOREIGN KEY(source_snapshot_id) REFERENCES product_business_snapshots(id)
);
```

## 4. 建议索引

```sql
CREATE INDEX IF NOT EXISTS idx_product_selection_items_job
ON product_selection_items(source_job_id);

CREATE INDEX IF NOT EXISTS idx_product_selection_items_snapshot
ON product_selection_items(source_snapshot_id);

CREATE INDEX IF NOT EXISTS idx_product_selection_items_stage
ON product_selection_items(selection_stage);

CREATE INDEX IF NOT EXISTS idx_product_selection_items_product
ON product_selection_items(source_platform, source_platform_product_id);
```

## 5. 字段说明

| 字段名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | integer | 是 | 主键 |
| `source_job_id` | integer | 是 | 来源任务 ID，关联 `source_jobs.id` |
| `source_snapshot_id` | integer | 是 | 来源经营快照 ID，关联 `product_business_snapshots.id` |
| `source_platform` | text | 是 | 来源平台，如 `ozon` |
| `source_platform_product_id` | text | 是 | 来源平台商品 ID |
| `selection_stage` | text | 是 | 当前筛选阶段 |
| `selection_result` | text | 否 | 当前筛选结果摘要，如 `pending`、`active`、`rejected`、`ready_for_prep` |
| `selection_note` | text | 否 | 人工备注 |
| `initial_cost_price` | real | 否 | 初步成本价 |
| `initial_delivery_cost` | real | 否 | 初步物流成本 |
| `initial_target_price` | real | 否 | 初步预估售价 |
| `initial_profit_rate` | real | 否 | 初步利润率 |
| `pricing_decision` | text | 是 | 测价结论，如 `pending`、`continue`、`reject` |
| `supply_match_status` | text | 是 | 供应链匹配状态，如 `pending`、`matched` |
| `supply_reference_url` | text | 否 | 货源链接，例如 1688 商品链接 |
| `supply_vendor_name` | text | 否 | 供应商名称 |
| `competitor_packet_status` | text | 是 | 竞品整理状态，如 `pending`、`ready` |
| `transfer_to_prep_at` | text | 否 | 流转到商品数据整理的时间 |
| `created_at` | text | 是 | 记录创建时间 |
| `updated_at` | text | 是 | 记录更新时间 |

## 5.1 测价字段计算口径

商品筛选工作台的测价弹窗复用前端 Ozon 快速定价计算模块生成结果，不新增字段。

- `initial_cost_price`：写回用户在测价弹窗中确认使用的采购成本。
- `initial_delivery_cost`：写回用户在测价弹窗中确认使用的跨境物流成本，默认可沿用入池时自动测算值，也可手动覆盖。
- `initial_target_price`：写回快速定价计算出的预估折后售价。
- `initial_profit_rate`：写回快速定价计算出的利润率，单位为百分数。
- 总成本和利润金额为页面即时展示值，由采购、物流、佣金、提现、退货损耗等费用计算得到，当前不单独落库。

## 6. 建议枚举

### 6.1 `selection_stage`

| 值 | 说明 |
| --- | --- |
| `pool_pending` | 已入池，待初筛 |
| `screening_rejected` | 初筛淘汰 |
| `pricing_pending` | 待测价与利润判断 |
| `pricing_rejected` | 测价后利润不成立 |
| `source_pending` | 利润成立，待找供应链 |
| `competitor_pending` | 供应链已找到，待整理竞品 |
| `prep_ready` | 可流转到商品数据整理 |

### 6.2 `pricing_decision`

| 值 | 说明 |
| --- | --- |
| `pending` | 尚未完成测价 |
| `continue` | 利润成立，继续推进 |
| `reject` | 利润不成立，停止推进 |

## 7. 典型查询

读取所有待测价商品：

```sql
SELECT *
FROM product_selection_items
WHERE selection_stage = 'pricing_pending'
ORDER BY updated_at DESC, id DESC;
```

读取可流转到商品数据整理的商品：

```sql
SELECT *
FROM product_selection_items
WHERE selection_stage = 'prep_ready'
ORDER BY updated_at DESC, id DESC;
```

回溯某个筛选商品的来源批次和原始经营快照：

```sql
SELECT
  product_selection_items.*,
  source_jobs.page_name,
  source_jobs.finished_at,
  product_business_snapshots.title,
  product_business_snapshots.sales_volume,
  product_business_snapshots.sales_amount
FROM product_selection_items
JOIN source_jobs
  ON source_jobs.id = product_selection_items.source_job_id
JOIN product_business_snapshots
  ON product_business_snapshots.id = product_selection_items.source_snapshot_id
WHERE product_selection_items.id = ?;
```
