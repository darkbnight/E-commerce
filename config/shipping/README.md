# Shipping Config

## 用途

`rules.json` 和 `fx.json` 是本地物流费用计算器的当前生效规则源。

`rules.generated.json` 是从 Ozon 官方 XLSX 源文件和官方计算器校准数据生成的候选规则。当前 `rules.json` 已切换为同一批官方生成规则，包含 149 条服务规则，并针对 50g、500g、5000g 官方计算器样本做了默认排序校准。

## 维护方式

1. 把 Ozon 官方 XLSX 源文件放到 `data/shipping-sources/`。
2. 运行 `npm run shipping:import` 生成 `rules.generated.json`。
3. 运行 `npm run shipping:validate:generated` 校验生成文件结构。
4. 抽样对比 Ozon 官方计算器的关键服务、价格、时效、排序和边界。
5. 确认后用 `rules.generated.json` 覆盖 `rules.json`，再运行 `npm run shipping:validate`。
6. 若汇率变化，更新 `fx.json`。
7. 运行 `npm run shipping:api:test` 和 `npm run shipping:page:test` 后再提交。

## 约束

- 当前只维护“当前可用规则”，不做系统内版本管理。
- 历史变更依赖 Git 追踪。
- `rules.json` 只能写入 Ozon 官方文档或 Ozon Global 官方计算器中出现的真实物流服务。
- 禁止写入 `OZON_PARTNER`、`STANDARD_SMALL`、`ECONOMY_PUDO` 这类占位服务名。
- XLSX 费率表是候选规则来源，不等于官方计算器最终可用服务列表。
- 对官方计算器样本明确未展示、但会干扰默认排序的服务，必须写入 `excludedDeliveryMethodCodes`。

## 官方计算器校准

- `calculator-calibration.json` 记录 Ozon Global 官方计算器的抽样校准结果。
- `variants` 按官方计算器展示格式记录 `Courier`、`PUDO` 等服务变体，不把它们误建模成独立承运商。
- `excludedDeliveryMethodCodes` 按样本输入排除官方计算器没有展示的候选服务；前端默认不展示这些服务，勾选“显示未校准 XLSX 候选服务”后才会放开。
- `sourceConfidence=official_calculator_verified` 表示该服务在官方计算器样本中出现过；`sourceConfidence=xlsx_only` 表示只来自 XLSX 费率表。
- 费用公式以官方 XLSX 为主，官方计算器用于校准价格样本、时效、标签、电池限制、排序和样本级排除。
- 当前关键样本覆盖：`50g`、`500g`、`5000g`；边界样本覆盖：`500g`、`501g`、`2000g`、`2001g`、`5000g`。
- `maxDimensionSumCm` 当前按 `reference` 处理，因为官方计算器对三边和没有表现为严格硬拦截；`maxSideCm`、重量、CNY 价格上下限按 `hard` 处理。
