# API接口文档

## 萌拉采集结果展示页

### POST /api/menglar/login-health
#### 说明
检查萌拉登录态和业务接口授权是否可用于正式采集。该接口只执行检查，不创建采集任务，不写入业务数据库；检查结果会写入 `.cache/menglar-capture/login-health-last.json`。

#### 请求体字段
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `target` | string | 否 | 检查目标，支持 `hot_products`、`industry_general`，默认 `hot_products` |
| `refresh` | boolean | 否 | 是否强制刷新紫鸟 profile 副本，默认 `false` |
| `headless` | boolean | 否 | 是否无头检查，默认 `true` |

#### 返回字段
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `ok` | boolean | 是否可进入正式采集 |
| `status` | string | `ready` 或 `blocked` |
| `target` | string | 检查目标 |
| `targetUrl` | string | 检查页面 |
| `browser` | object | 浏览器可用性 |
| `profile` | object | 紫鸟 profile 副本状态 |
| `storage.runtimeStorageLoaded` | boolean | 是否读取到本地登录缓存 |
| `page.title` | string\|null | 实际页面标题 |
| `page.url` | string\|null | 实际页面 URL |
| `api.requestCount` | number | 捕获到的萌拉业务接口请求数 |
| `api.authorizedRequestCount` | number | 带 Authorization 的业务接口请求数 |
| `api.unauthorizedResponseCount` | number | 401/403 响应数 |
| `errorType` | string\|null | 阻塞类型，如 `login_required`、`guest_blocked`、`api_auth_missing`、`api_unauthorized` |
| `message` | string\|null | 检查说明 |
| `nextAction` | string\|null | 下一步处理建议 |

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
| `normalized_count` | number | 历史字段，当前对应经营快照入库数 |
| `warning_count` | number | 警告数 |
| `request_count` | number | 采集请求数。行业任务表示请求的类目数，商品任务表示捕获的业务接口响应数 |
| `success_count` | number | 成功请求数 |
| `record_count` | number | 采集结果记录数。行业任务表示类目记录数，商品任务表示经营快照入库数 |
| `error_type` | string\|null | 标准错误类型，如 `login_required`、`guest_blocked`、`profile_locked`、`browser_blocked`、`api_auth_missing`、`db_error` |
| `error_message` | string\|null | 错误信息 |

### GET /api/products
#### 说明
读取最新有商品经营快照的成功任务，或读取指定任务下的商品经营快照，支持基础筛选与分页。

#### 请求参数
| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `jobId` | number | 否 | 指定任务ID，默认最新有商品经营快照的成功任务 |
| `page` | number | 否 | 页码，默认 `1` |
| `pageSize` | number | 否 | 每页条数，默认 `20`，最大 `100` |
| `keyword` | string | 否 | 关键词，匹配平台商品 ID / 标题 / 品牌 / 店铺 / 类目 |
| `productType` | string | 否 | 商品类型 |
| `categoryLevel1` | string | 否 | 一级类目 |
| `minSales` | number | 否 | 最低销售量，对应 `sales_volume` |
| `minRevenue` | number | 否 | 最低销售金额，对应 `sales_amount` |
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
| `actualProductCount` | number | 当前任务实际关联的商品经营快照总数，不受筛选条件影响 |

#### `items[]` 关键字段
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `platform_product_id` | string | 平台商品 ID |
| `product_url` | string\|null | 商品链接 |
| `product_image_url` | string\|null | 商品主图链接 |
| `title` | string\|null | 商品标题 |
| `brand` | string\|null | 品牌 |
| `shop_id` | string\|null | 店铺 ID |
| `shop_name` | string\|null | 店铺名称 |
| `product_type` | string\|null | 商品类型 |
| `product_created_date` | string\|null | 商品卡创建日期 |
| `sales_volume` | number\|null | 销量 |
| `sales_growth` | number\|null | 销量增长率 |
| `sales_amount` | number\|null | 销售额卢布口径 |
| `sales_amount_cny` | number\|null | 销售额人民币口径，优先使用萌拉返回值 |
| `avg_price_rub` | number\|null | 平均单价卢布口径 |
| `avg_price_cny` | number\|null | 平均单价人民币口径，优先使用萌拉返回值 |
| `impressions` | number\|null | 曝光量 |
| `clicks` | number\|null | 点击或访问数 |
| `view_rate` | number\|null | 点击率 |
| `ad_cost` | number\|null | 广告费卢布口径 |
| `ad_cost_cny` | number\|null | 广告费人民币口径 |
| `ad_cost_rate` | number\|null | 广告费占比 |

### GET /api/product-selection/items
#### 说明
读取当前已进入“商品筛选”工作台的商品列表。返回结果会合并来源批次和原始经营快照字段，用于前端直接展示“全部 / 待初筛 / 待测价 / 待找供应链 / 待整理竞品 / 可流转”工作区。

#### 返回结构
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `items` | array | 商品筛选工作台条目列表 |
| `total` | number | 当前工作台总条数 |

#### `items[]` 关键字段
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | number | 筛选工作台条目 ID |
| `stage` | string | 当前阶段，如 `pool_pending`、`pricing_pending`、`source_pending`、`prep_ready` |
| `sourceJobId` | number | 来源任务 ID |
| `sourcePageType` | string | 来源任务类型 |
| `sourceFinishedAt` | string\|null | 来源任务完成时间 |
| `pricingDecision` | string | 测价结论：`pending`、`continue`、`reject` |
| `supplyMatchStatus` | string | 供应链状态：`pending`、`matched` |
| `competitorPacketStatus` | string | 竞品整理状态：`pending`、`ready` |
| `transferToPrepAt` | string\|null | 流转到商品数据整理的时间 |
| `item` | object | 来源经营快照对象，字段结构兼容 `GET /api/products` 的单条商品结果 |

### POST /api/product-selection/items
#### 说明
把来源商品加入“商品筛选”工作台。支持当前页批量加入，也支持单个商品加入。

#### 请求体字段
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `items` | array | 是 | 待加入商品数组 |
| `items[].sourceSnapshotId` | number | 是 | 来源经营快照 ID，对应 `product_business_snapshots.id` |

#### 返回结构
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `insertedCount` | number | 本次成功新增条数 |
| `duplicateCount` | number | 已存在未重复加入条数 |
| `skippedCount` | number | 未找到来源快照的跳过条数 |
| `items` | array | 加入后的完整工作台列表 |

### PATCH /api/product-selection/items/:id
#### 说明
更新商品筛选工作台中的单条商品状态，可用于推进阶段、写入测价结果、利润判断、供应链信息和竞品整理状态。

#### 请求体字段
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `stage` | string | 否 | 当前阶段，支持 `pool_pending`、`screening_rejected`、`pricing_pending`、`pricing_rejected`、`source_pending`、`competitor_pending`、`prep_ready` |
| `selectionNote` | string | 否 | 备注 |
| `initialCostPrice` | number | 否 | 初步成本价 |
| `initialDeliveryCost` | number | 否 | 初步物流成本 |
| `initialTargetPrice` | number | 否 | 初步预估售价 |
| `initialProfitRate` | number | 否 | 初步利润率 |
| `pricingDecision` | string | 否 | 测价结论，支持 `pending`、`continue`、`reject` |
| `supplyMatchStatus` | string | 否 | 供应链状态，支持 `pending`、`matched` |
| `supplyReferenceUrl` | string | 否 | 货源链接 |
| `supplyVendorName` | string | 否 | 供应商名称 |
| `competitorPacketStatus` | string | 否 | 竞品整理状态，支持 `pending`、`ready` |
| `transferToPrepAt` | string\|null | 否 | 流转时间，通常由服务端在流转接口中写入 |

#### 返回结构
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `item` | object\|null | 更新后的筛选工作台条目 |

### POST /api/product-selection/items/:id/transfer-to-prep
#### 说明
将单条筛选工作台商品标记为“可流转商品数据整理”，并写入流转时间。

#### 返回结构
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `item` | object\|null | 流转后的筛选工作台条目 |

### GET /api/result-jobs
#### 说明
返回结果工作台可选择的数据批次。默认只返回成功且实际商品数大于 0 的批次，用于避免行业数据或空商品批次抢占结果页。

#### 请求参数
| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `includeEmpty` | boolean | 否 | 是否包含实际商品数为 0 的批次，默认 `false` |
| `includeFailed` | boolean | 否 | 是否包含失败或未完成批次，默认 `false` |
| `limit` | number | 否 | 返回条数，默认 `50`，最大 `100` |

#### 返回结构
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `filters` | object | 回显后的批次筛选条件 |
| `jobs` | array | 可选批次数组 |

#### `jobs[]` 字段
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | number | 任务 ID |
| `page_name` | string | 任务名称 |
| `page_type` | string | 任务类型 |
| `job_status` | string | 任务状态 |
| `raw_count` | number | 原始记录数 |
| `normalized_count` | number | 任务记录的标准化数量 |
| `product_count` | number | 通过 `product_business_snapshots.job_id` 实际关联出来的商品经营快照数量 |
| `finished_at` | string\|null | 任务结束时间 |

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
| `includeXlsxCandidates` | boolean | 否 | 是否展示被官方计算器样本排除的 XLSX 候选服务，默认 `false`。默认值用于避免未校准候选服务干扰最低价排序 |

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
| `items[].service.sourceConfidence` | string | 规则来源可信度：`official_calculator_verified` 表示官方计算器样本已出现，`xlsx_only` 表示仅来自官方 XLSX 费率表 |
| `items[].service.calculatorPriceSamples` | array | 官方计算器价格样本，未校准服务为空数组 |
| `items[].result.totalLogisticsCost` | number | 当前输入下的物流费用 |
| `unavailableItems` | array | 因限制条件不可用，或被匹配的官方计算器样本排除的服务 |
| `total` | number | 可用服务数量 |
| `unavailableCount` | number | 不可用服务数量 |
