# Ozon官方物流费用规则引擎

## 模块一：【需求概述与交互】
### 需求背景
当前项目已经具备萌拉数据采集、入库和工作台展示能力，但物流费用仍依赖第三方平台或临时规则。对于大规模选品、批量利润测算和本地成本分析，这种方式存在几个问题：
- 口径不稳定，第三方平台和 Ozon 官方口径可能不一致。
- 不利于批量调用，外部页面工具无法稳定支撑高频本地接口调用。
- 不利于维护，规则变更后无法形成统一、清晰、可复用的本地计算能力。

Ozon 官方帮助中心已经公开了运费构成、体积重规则、承运商费率文件和方法限制，因此可以建设一套本地规则引擎，以 Ozon 官方规则为主数据源，输出相对精准且便于维护的物流费用。

### 一句话需求描述
建设一个本地 Ozon 官方物流费用计算器，以单份 JSON 规则文件维护当前有效费率，通过本地 API 输出物流费用结果，服务于大规模选品阶段的相对精准物流成本测算。

### 解决方案大纲
1. 以 Ozon 官方文档和费率文件作为规则来源，不依赖 `globalcalculator.ozon.ru` 作为主调用链路。
2. 使用单份当前生效的 `rules.json` 和 `fx.json` 作为本地规则源，不做系统内版本管理。
3. 建设本地规则引擎，输入商品尺寸、重量、价格、订单日期、承运商方法等信息，输出标准化物流费用结果。
4. 在工作台中新增“物流费用计算器”页面，左侧输入单条商品参数，右侧展示当前可用物流服务列表。
5. 对外提供本地 API，供选品流程和后续批量测算调用；批量能力保留在后端，不在第一版前端页面中实现。

### 用户的核心体验链路
1. 维护者从 Ozon 官方帮助中心下载承运商费率文件，并更新本地 JSON 规则。
2. 用户在工作台打开“物流费用计算器”，输入商品尺寸、重量、价格、方法、订单日期等参数。
3. 系统自动计算实重、体积重、计费重、配送费、Ozon 每票费用、附加费用和最终物流成本。
4. 用户可在页面右侧查看多个可用服务，重点比较服务名称、价格和配送时间。
5. 后续选品、定价、利润测算通过本地 API 批量调用该能力，不再依赖萌拉运费或官方网页黑盒。

## 模块二：【前端与组件设计】
### 新增或修改的路由
- 新增路由：`/shipping-calculator`

### 页面结构
- 顶部说明区
  - 展示当前规则来源、最近更新时间、当前汇率日期
- 单条试算表单区
  - 输入字段：
    - 发货国家/仓库
    - 销售模式
    - 承运商
    - 配送方法
    - 商品价格
    - 包裹长宽高
    - 实重
    - 订单日期
- 服务结果区
  - 输出字段：
    - 服务名称
    - 官方副标题
    - 物流价格
    - 配送时间
    - 配送目标
    - 电池限制
- 规则说明区
  - 展示当前规则文件摘要、数据来源、最近更新时间、维护说明

### 需要编写/复用的 React 组件
- `ShippingCalculatorPage`
- `ShippingCalculatorForm`
- `ShippingCostBreakdownCard`
- `ShippingRuleInfoPanel`
- 复用已有工作台壳：
  - `AppShell`
  - `Panel`

## 模块三：【后端与架构设计】
### 后端模块划分
- `backend/menglar-workbench-api/`
  - 新增物流费用计算接口
- `scripts/`
  - 新增规则导入/整理脚本
  - 新增规则校验脚本

### 规则文件设计
规则不存数据库，第一期使用单份 JSON 文件：

- `config/shipping/rules.json`
  - 存当前生效的物流规则
- `config/shipping/fx.json`
  - 存当前使用的汇率数据
- `config/shipping/README.md`
  - 存规则来源、维护方式、更新步骤、字段说明

建议 `rules.json` 顶层结构至少包含：
- `meta`
  - `updatedAt`
  - `source`
  - `notes`
- `methods`
  - 每个物流方法的规则配置

建议每个 `method` 至少包含：
- `carrierCode`
- `deliveryMethodCode`
- `displayName`
- `originCountry`
- `salesScheme`
- `chargeBasis`
- `volumetricDivisor`
- `fixedFee`
- `incrementUnitG`
- `incrementFee`
- `minFee`
- `maxFee`
- `extraFee`
- `constraints`
- `notes`

### API 设计
- `POST /api/shipping/calculate`
  - 作用：单条物流费用试算
  - 输入：
    - `originCountry`
    - `warehouseType`
    - `salesScheme`
    - `carrierCode`
    - `deliveryMethodCode`
    - `price`
    - `lengthCm`
    - `widthCm`
    - `heightCm`
    - `weightG`
    - `orderDate`
  - 输出：
    - `physicalWeightG`
    - `volumetricWeightG`
    - `chargeableWeightG`
    - `carrierDeliveryCost`
    - `ozonHandlingFee`
    - `extraFee`
    - `exchangeRate`
    - `totalLogisticsCost`
    - `currency`
    - `ruleMeta`
    - `calculationMeta`

- `POST /api/shipping/calculate-batch`
  - 作用：批量物流费用计算
  - 说明：后端保留能力，第一版前端页面不实现对应 UI
  - 输入：数组
  - 输出：
    - `items`
    - `successCount`
    - `failedCount`
    - `errors`

- `GET /api/shipping/methods`
  - 作用：查询当前可用物流方法列表

- `GET /api/shipping/rule-info`
  - 作用：查询当前规则文件摘要、最近更新时间、来源说明

- `POST /api/shipping/compare`
  - 作用：根据同一组商品参数，返回所有可用官方物流服务并按价格升序排序
  - 说明：前端物流计算器页面使用该接口展示右侧服务列表
  - 输出：
    - `items`
    - `items[].service.displayName`
    - `items[].service.officialSubtitle`
    - `items[].service.deliveryDays`
    - `items[].result.totalLogisticsCost`
    - `unavailableItems`
    - `total`

### 核心计算设计
本地引擎的稳定输出应遵循以下顺序：
1. 读取当前 `rules.json`
2. 选择匹配的承运商方法
3. 计算实重 `physicalWeightG`
4. 根据尺寸与体积重系数计算 `volumetricWeightG`
5. 按规则确定 `chargeableWeightG`
6. 根据固定费 + 续重/阶梯规则算出 `carrierDeliveryCost`
7. 根据 Ozon 官方规则增加每票服务费/附加费用
8. 根据订单日期命中的汇率算出 `exchangeRate`
9. 输出统一结构结果

### 稳定性判断
该方案可稳定输出“适用于本地选品与利润测算的物流费用”，但不应承诺逐单与 Ozon 财务结算单 100% 完全一致。稳定性边界如下：
- 可稳定：批量选品、利润测算、成本比较、定价辅助
- 不承诺绝对一致：逐单结算、未同步的最新费率、未同步的订单日汇率、特殊附加规则变化

### 维护方式
第一期不做系统内版本管理，维护方式固定为：
1. 更新 `rules.json`
2. 更新 `fx.json`
3. 运行校验脚本
4. 提交 Git

历史变更依赖 Git，不在系统内做版本切换、历史版本选择、版本表管理。

## 模块四：【📝 联合自动化验收用例 (TDD核心)】
### 第一阶段用例（Node 接口与本地规则闭环）
- [ ] `POST /api/shipping/calculate` 输入一条合法样本，返回 200；并校验返回结果中的 `physicalWeightG`、`volumetricWeightG`、`chargeableWeightG`、`totalLogisticsCost` 结构齐全。
- [ ] `POST /api/shipping/calculate` 输入超出限制的重量/尺寸，返回 400；并校验错误结果中明确指出是重量超限、尺寸超限或规则不匹配。
- [ ] `POST /api/shipping/calculate-batch` 输入多条数据，返回 `successCount` 和 `failedCount`；并校验成功项和失败项结构正确。
- [ ] `POST /api/shipping/compare` 输入官方样例参数，返回按价格排序的服务列表；并校验 `China Post to PUDO Economy` 为最低价服务。
- [ ] 修改 `config/shipping/rules.json` 中某个方法费率后重新调用 `POST /api/shipping/calculate`，校验输出结果随规则变化而变化。
- [ ] 汇率计算用例：给定固定订单日期，校验 `fx.json` 中命中的汇率与输出结果中的 `exchangeRate` 一致。

### 第二阶段用例（E2E 端到端浏览器闭环）
- [ ] 打开 `/shipping-calculator` 后，页面左侧展示输入选项，右侧展示服务列表区域。
- [ ] 输入一条合法参数后提交，页面显示多个服务卡片，且每张卡片包含名称、价格、时间。
- [ ] 输入超限参数后提交，页面显示无可用服务空态。
- [ ] 页面能够显示当前规则来源、最近更新时间和汇率日期。
