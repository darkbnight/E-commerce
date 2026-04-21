# Ozon物流规则数据源整理

## 1. 结论
Ozon 官方物流规则不是只能靠 `globalcalculator.ozon.ru` 截图采样，官方帮助中心已经提供了更适合作为规则源的数据：

- 官方 XLSX：适合批量导入服务、费率、时效、重量/尺寸/价格限制。
- 官方帮助页 HTML 表格：适合补充单个承运商说明、计费规则和限制解释。
- 官方计算器：适合抽样校验，不适合作为主数据源。

后续应把本地规则来源从“手工样例录入”升级为：

```text
官方 XLSX / 官方 HTML 表格 -> 解析脚本 -> 标准化中间 JSON -> config/shipping/rules.json
```

## 2. 已确认的官方数据源

### 2.1 Partner Delivery 主入口
- 页面：https://docs.ozon.com/global/fulfillment/rfbs/logistic-settings/partner-delivery-ozon/
- 用途：获取 Ozon Partner Delivery 的最新 XLSX 文件入口。
- 重要性：最高。

已从页面提取到的关键文件：

| 文件 | 用途 | 本地状态 |
| --- | --- | --- |
| `China_scoring_ENG_CN_7_04_26_1775544002.xlsx` | 中国发货商业承运商规则，包含 3PL、服务名、时效、费率、限制 | 已下载 |
| `China_post_HELP_ePacket_AM_AZ_UZ_1776238342.xlsx` | 中国邮政规则，包含 Russia / CIS 线路 | 已下载 |
| `Drop_off_China_17_04_2026_1776408368.xlsx` | 中国揽收点、承运商地址、联系方式 | 已下载 |
| `CIS_Delivery_methods_7_04_26_1775544004.xlsx` | 中国到 CIS 国家配送规则 | 已下载 |
| `hongkong_7_04_26_ENG_CN_1775544001.xlsx` | 香港发货规则 | 未下载 |
| `other_17_04_26_1776408370.xlsx` | 其他国家发货规则 | 未下载 |

本地下载目录：

```text
data/shipping-sources/
```

已下载文件：

```text
data/shipping-sources/China_scoring_ENG_CN_7_04_26.xlsx
data/shipping-sources/China_post_HELP_ePacket_AM_AZ_UZ.xlsx
data/shipping-sources/Drop_off_China_17_04_2026.xlsx
data/shipping-sources/CIS_Delivery_methods_7_04_26.xlsx
```

### 2.2 China Post 官方页
- 英文页：https://docs.ozon.com/global/en/fulfillment/rfbs/logistic-settings/china-post/
- 中文页：https://docs.ozon.com/global/zh-hans/fulfillment/rfbs/logistic-settings/china-post/
- 用途：补充 China Post to PUDO、ePacket、eParcel、eEMS 的规则说明。

已确认字段：

| 字段 | 说明 |
| --- | --- |
| `Delivery Method` | 服务名称 |
| `Price` | 公式，例如 `¥1.90 + ¥0.026/1g` |
| `Time-limits delivery to Moscow` | 送达时效 |
| `Batteries` | 是否可运输电池 |
| `Liquids` | 是否可运输液体 |
| `Measurements, max cm` | 尺寸限制 |
| `Shipment weight limits / min g` | 最小重量 |
| `Shipment weight limits / max g` | 最大重量 |
| `Shipment cost limit / min/max RUB` | 申报价值限制 |

### 2.3 商业承运商规则 XLSX
文件：

```text
data/shipping-sources/China_scoring_ENG_CN_7_04_26.xlsx
```

关键 sheet：

| Sheet | 用途 |
| --- | --- |
| `CHINA rFBS` | 中国发货 realFBS 商业承运商规则，英文 |
| `中国 rFBS` | 中国发货 realFBS 商业承运商规则，中文 |
| `CHINA rFBS routing SLA` | 路由 SLA |
| `中国 rFBS 路由 SLA` | 路由 SLA 中文 |

`CHINA rFBS` 中已确认表头：

| 字段 | 说明 |
| --- | --- |
| `Scoring Group` | 分组，如 `Extra Small`、`Small`、`Big` |
| `Service Level` | 服务等级，如 `Express`、`Standard`、`Economy` |
| `3PL` | 承运商，如 `ATC`、`CEL`、`GUOO` |
| `Delivery Method` | 官方服务名称 |
| `Ozon rating` | Ozon 排序/评分 |
| `Time-limits ... days` | 时效 |
| `Rates (PUDO / Courier)` | 费率公式 |
| `Batteries` | 电池限制 |
| `Liquids` | 液体限制 |
| `Measurements, max cm` | 尺寸限制 |
| `Shipment weight limits / min g` | 最小重量 |
| `Shipment weight limits / max g` | 最大重量 |

示例行：

```text
Extra Small | Express | ATC | ATC Express Extra Small | 5-14 | ¥3 + ¥0,045/1g | Forbidden | Forbidden | Sum of sides ≤ 90 cm, length ≤ 60 cm | 1 | 500
Extra Small | Express | CEL | CEL Express Extra Small | 5-14 | ￥3.12 + ￥0.0468/1 g | Forbidden | Allowed | Sum of sides ≤ 90 cm, length ≤ 60 cm | 1 | 500
```

这个文件应作为商业承运商规则导入的主数据源。

### 2.4 China Post 规则 XLSX
文件：

```text
data/shipping-sources/China_post_HELP_ePacket_AM_AZ_UZ.xlsx
```

关键 sheet：

| Sheet | 用途 |
| --- | --- |
| `China to Russia by CP` | 中国邮政到俄罗斯，英文 |
| `中国至俄罗斯-邮政` | 中国邮政到俄罗斯，中文 |
| `China to CIS by CP` | 中国邮政到 CIS，英文 |
| `中国至独联体-邮政` | 中国邮政到 CIS，中文 |

已确认可直接导入的俄罗斯线路：

| 服务 | 公式 | 时效 | 重量限制 |
| --- | --- | --- | --- |
| `China Post to PUDO Standard` | `¥1.90 + ¥0.067/1g` | `10-15` | `0-500g` |
| `China Post to PUDO Economy` | `¥1.90 + ¥0.026/1g` | `20-25` | `0-500g` |
| `China Post ePacket Super Express` | `¥15.00 + ¥0.095/1g` | `9-20` | `0-5000g` |
| `China Post ePacket` | `¥15.00 + ¥0.065/1g` | `10-22` | `0-5000g` |
| `China Post ePacket Economy Track` | `¥15.00 + ¥0.03475/1g` | `20-32` | `0-5000g` |
| `China Post eParcel Economy` | `¥52.50 + ¥0.15/500g` | `18-35` | `500-31000g` |
| `China Post eEMS` | `¥102.00 + ¥2.55/50g` | `9-20` | `50-31000g` |

### 2.5 Drop-off 揽收点 XLSX
文件：

```text
data/shipping-sources/Drop_off_China_17_04_2026.xlsx
```

用途：
- 不用于计算运费。
- 用于后续补充发货城市、揽收点、承运商联系方式。
- 可以作为前端“发货城市/揽收点”下拉来源。

关键 sheet：

| Sheet | 用途 |
| --- | --- |
| `From China` | 中国发货揽收点，英文 |
| `从中国` | 中国发货揽收点，中文 |
| `From China to CIS` | 中国到 CIS 揽收点 |
| `从中国到CIS` | 中国到 CIS 揽收点中文 |

## 3. 数据源优先级

### P0：必须接入
- `China_scoring_ENG_CN_7_04_26.xlsx`
- `China_post_HELP_ePacket_AM_AZ_UZ.xlsx`

原因：
- 包含计算费用必须的服务名、费率、时效、限制。
- 能解决“改价格、尺寸、重量后是否仍然准确”的核心问题。

### P1：应该接入
- `Drop_off_China_17_04_2026.xlsx`

原因：
- 不影响费用计算，但影响发货城市、揽收点和服务可用性。

### P2：后续接入
- `CIS_Delivery_methods_7_04_26.xlsx`
- `hongkong_7_04_26_ENG_CN_1775544001.xlsx`
- `other_17_04_26_1776408370.xlsx`

原因：
- 用于扩展中国到 CIS、香港发货、其他国家发货。
- 当前选品主链路暂时可以先聚焦中国到俄罗斯。

## 4. 导入脚本设计建议

建议新增脚本：

```text
scripts/import-shipping-rules.mjs
```

输入：

```text
data/shipping-sources/*.xlsx
```

输出：

```text
config/shipping/rules.generated.json
```

人工确认后覆盖：

```text
config/shipping/rules.json
```

## 5. 标准化字段建议

每条服务规则统一为：

```json
{
  "carrierCode": "CEL",
  "deliveryMethodCode": "CEL_EXPRESS_EXTRA_SMALL",
  "displayName": "CEL Express Extra Small",
  "officialSubtitle": "CEL Express Extra Small",
  "originCountry": "CN",
  "destinationCountry": "RU",
  "warehouseType": "seller_warehouse",
  "salesScheme": "realFBS",
  "deliveryTarget": "pickup_point",
  "chargeBasis": "physical",
  "currency": "CNY",
  "fixedFee": 3.12,
  "incrementUnitG": 1,
  "incrementFee": 0.0468,
  "deliveryDays": {
    "min": 5,
    "max": 14
  },
  "constraints": {
    "minWeightG": 1,
    "maxWeightG": 500,
    "maxDimensionSumCm": 90,
    "maxSideCm": 60,
    "batteryPolicy": "forbidden",
    "liquidPolicy": "forbidden"
  },
  "source": {
    "file": "China_scoring_ENG_CN_7_04_26.xlsx",
    "sheet": "CHINA rFBS"
  }
}
```

## 6. 下一步执行建议

第一阶段已落地为自动导入脚本：

```powershell
npm run shipping:import
npm run shipping:validate:generated
```

当前输出：

```text
config/shipping/rules.generated.json
```

截至本次解析，已从官方 XLSX 生成 149 条服务规则，其中 CEL 16 条、China Post 7 条。

当前已补充官方计算器校准层：

```text
config/shipping/calculator-calibration.json
```

处理原则：
- `Courier`、`PUDO` 按官方计算器格式写入 `variants`，不拆成独立承运商。
- 价格公式、重量、尺寸、价格限制仍来自官方 XLSX。
- 官方计算器用于校准时效、标签、电池限制、边界样本。
- 边界样本已覆盖到 `5000g`：`500g`、`501g`、`2000g`、`2001g`、`5000g`。
- `maxDimensionSumCm` 暂按参考限制处理，避免本地比官方计算器更严格。

后续接入正式计算前，应先人工抽样确认生成规则，再覆盖：

```text
config/shipping/rules.json
```

建议抽样校验：

1. 解析 `China_post_HELP_ePacket_AM_AZ_UZ.xlsx`
2. 解析 `China_scoring_ENG_CN_7_04_26.xlsx`
3. 生成 `rules.generated.json`
4. 对比官方计算器样例：
   - `1x1x1cm / 50g / price=1`
   - `1x1x1cm / 100g / price=1`
   - `1x1x1cm / 300g / price=1`
   - `1x1x1cm / 500g / price=1`
5. 人工确认后替换当前手工维护的 `rules.json`

不建议继续大规模手工录入 `rules.json`。手工录入可以做临时校准，但不能作为长期维护方式。
