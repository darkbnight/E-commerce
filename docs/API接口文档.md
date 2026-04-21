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
读取最新有标准化商品数据的成功任务，或读取指定任务下的标准化商品数据，支持基础筛选与分页。

#### 请求参数
| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `jobId` | number | 否 | 指定任务ID，默认最新有标准化商品数据的成功任务 |
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

## Ozon批量上货工作台
### GET /api/ozon/template
#### 说明
按 `kind` 返回 Ozon 上货示例模板，供前端页面和本地工具直接装载。
#### 请求参数
| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `kind` | string | 否 | `products`、`prices`、`stocks`、`all`，默认 `products` |

### POST /api/ozon/validate
#### 说明
对前端提交的 JSON 数据做本地结构校验，不请求 Ozon。
#### 请求体字段
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `mode` | string | 是 | `products`、`prices`、`stocks` |
| `payload` | object | 是 | 待校验 JSON，支持顶层 `items` |

### POST /api/ozon/execute
#### 说明
执行上货、价格更新或库存更新；支持 `dryRun` 仅模拟。
#### 请求体字段
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `action` | string | 是 | `upload`、`prices`、`stocks` |
| `clientId` | string | 否 | Ozon Client ID |
| `apiKey` | string | 否 | Ozon Api Key |
| `baseUrl` | string | 否 | Ozon API 地址，默认 `https://api-seller.ozon.ru` |
| `payload` | object | 是 | 执行数据，支持顶层 `items` |
| `dryRun` | boolean | 否 | 是否仅本地模拟 |

### POST /api/ozon/import-info
#### 说明
查询 Ozon 商品导入任务状态。
#### 请求体字段
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `taskId` | number | 是 | 导入任务 ID |
| `clientId` | string | 否 | Ozon Client ID |
| `apiKey` | string | 否 | Ozon Api Key |
| `baseUrl` | string | 否 | Ozon API 地址 |

### POST /api/ozon/category-attributes
#### 说明
查询指定类目的属性定义，用于填写商品 `attributes`。
#### 请求体字段
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `categoryId` | number | 是 | Ozon 类目 ID |
| `clientId` | string | 否 | Ozon Client ID |
| `apiKey` | string | 否 | Ozon Api Key |
| `baseUrl` | string | 否 | Ozon API 地址 |

### POST /api/ozon/attribute-values
#### 说明
查询指定类目下某个属性的可选字典值。
#### 请求体字段
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `categoryId` | number | 是 | Ozon 类目 ID |
| `attributeId` | number | 是 | 属性 ID |
| `clientId` | string | 否 | Ozon Client ID |
| `apiKey` | string | 否 | Ozon Api Key |
| `baseUrl` | string | 否 | Ozon API 地址 |

## Ozon官方物流费用规则引擎

### GET /api/shipping/methods
#### 说明
返回当前本地 `rules.json` 中可用的物流方法列表，供页面下拉和本地调用使用。

#### 返回结构
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `methods` | array | 可用物流方法列表 |
| `methods[].variants` | array | 官方计算器展示的服务变体，例如 `Courier`、`PUDO`；没有校准时为空数组或不存在 |

### GET /api/shipping/rule-info
#### 说明
返回当前物流规则文件、汇率文件和规则元信息摘要。

#### 返回结构
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `rulesPath` | string | 当前规则文件路径 |
| `fxPath` | string | 当前汇率文件路径 |
| `meta` | object | 规则来源、更新时间、备注 |
| `methodCount` | number | 当前可用方法数量 |
| `fx` | object | 汇率基础信息 |

### POST /api/shipping/calculate
#### 说明
对单个商品参数执行本地物流费用试算，返回费用拆解结果。

#### 请求体字段
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `originCountry` | string | 是 | 发货国家，例如 `CN` |
| `warehouseType` | string | 是 | 仓库类型，例如 `seller_warehouse` |
| `salesScheme` | string | 是 | 销售模式，例如 `realFBS` |
| `carrierCode` | string | 是 | 承运商代码 |
| `deliveryMethodCode` | string | 是 | 配送方法代码 |
| `price` | number | 是 | 商品价格 |
| `lengthCm` | number | 是 | 包裹长度（cm） |
| `widthCm` | number | 是 | 包裹宽度（cm） |
| `heightCm` | number | 是 | 包裹高度（cm） |
| `weightG` | number | 是 | 商品重量（g） |
| `orderDate` | string | 是 | 订单日期，格式 `YYYY-MM-DD` |

#### 返回结构
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `physicalWeightG` | number | 实重 |
| `volumetricWeightG` | number | 体积重 |
| `chargeableWeightG` | number | 计费重 |
| `carrierDeliveryCost` | number | 承运商运费 |
| `ozonHandlingFee` | number | Ozon 每票费用 |
| `extraFee` | number | 附加费用 |
| `totalLogisticsCost` | number | 最终物流成本 |
| `currency` | string | 费用币种 |
| `ruleMeta` | object | 命中的规则摘要 |
| `ruleMeta.variants` | array | 命中规则的官方计算器变体信息 |
| `ruleMeta.constraintPolicies` | object | 限制字段策略，`hard` 表示本地硬拦截，`reference` 表示仅参考展示 |
| `calculationMeta` | object | 输入、限制校验、汇率命中等计算元信息 |

### POST /api/shipping/calculate-batch
#### 说明
对多条商品参数执行本地物流费用试算。该接口供后端批量调用，第一版前端页面不提供对应 UI。

#### 请求体字段
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `items` | array | 是 | 待计算的商品参数数组，每项结构与 `POST /api/shipping/calculate` 一致 |

#### 返回结构
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `items` | array | 每条计算结果，包含成功和失败项 |
| `successCount` | number | 成功数 |
| `failedCount` | number | 失败数 |
| `errors` | array | 失败项摘要 |

### POST /api/shipping/compare
#### 说明
根据同一组商品参数，返回当前本地规则中所有可用 Ozon Global 官方物流服务，并按总物流成本升序排列。该接口用于前端“左侧输入参数、右侧展示服务列表”的交互。

#### 请求体字段
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `originCountry` | string | 是 | 发货国家，例如 `CN` |
| `warehouseType` | string | 是 | 仓库类型，例如 `seller_warehouse` |
| `salesScheme` | string | 是 | 销售模式，例如 `realFBS` |
| `price` | number | 是 | 商品价格 |
| `lengthCm` | number | 是 | 包裹长度（cm） |
| `widthCm` | number | 是 | 包裹宽度（cm） |
| `heightCm` | number | 是 | 包裹高度（cm） |
| `weightG` | number | 是 | 商品重量（g） |
| `orderDate` | string | 是 | 订单日期，格式 `YYYY-MM-DD` |

#### 返回结构
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `input` | object | 标准化后的输入 |
| `items` | array | 可用服务列表，已按 `totalLogisticsCost` 升序 |
| `items[].service.displayName` | string | 官方服务名称 |
| `items[].service.officialSubtitle` | string | 官方服务副标题 |
| `items[].service.deliveryDays` | object | 时效范围 |
| `items[].service.variants` | array | 官方计算器服务变体，包含 `officialName`、`deliveryTarget`、`deliveryDays`、`batteryPolicy`、`badges` |
| `items[].result.totalLogisticsCost` | number | 当前输入下的物流费用 |
| `unavailableItems` | array | 因限制条件不可用的服务 |
| `total` | number | 可用服务数量 |
| `unavailableCount` | number | 不可用服务数量 |
