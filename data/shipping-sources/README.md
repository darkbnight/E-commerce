# Ozon Shipping Sources

## 用途
该目录存放 Ozon 官方物流规则源文件，用于生成本地物流计算器规则。

## 当前文件
- `China_scoring_ENG_CN_7_04_26.xlsx`
  - 来源：Ozon Partner Delivery 主入口
  - 用途：中国发货 realFBS 商业承运商规则
  - 关键 sheet：`CHINA rFBS`
- `China_post_HELP_ePacket_AM_AZ_UZ.xlsx`
  - 来源：Ozon Partner Delivery 主入口 / China Post 帮助页
  - 用途：中国邮政到俄罗斯和 CIS 规则
  - 关键 sheet：`China to Russia by CP`
- `Drop_off_China_17_04_2026.xlsx`
  - 来源：Ozon Partner Delivery 主入口
  - 用途：揽收点、地址、联系方式
  - 注意：不直接参与运费计算
- `CIS_Delivery_methods_7_04_26.xlsx`
  - 来源：Ozon Partner Delivery 主入口
  - 用途：中国到 CIS 国家配送规则

## 更新方式
1. 打开 Ozon Partner Delivery 主入口：
   `https://docs.ozon.com/global/fulfillment/rfbs/logistic-settings/partner-delivery-ozon/`
2. 下载最新的 `Тарифы и сроки` / `Rates and delivery times` XLSX。
3. 替换本目录中的同类文件。
4. 运行导入脚本：

```powershell
npm run shipping:import
```

5. 检查生成文件：

```text
config/shipping/rules.generated.json
```

6. 校验生成文件结构：

```powershell
npm run shipping:validate:generated
```

7. 抽样检查关键承运商是否已导入：

```powershell
node -e "const r=require('./config/shipping/rules.generated.json'); console.log(r.methods.length); console.log(r.methods.filter(x=>x.carrierCode==='CEL').length); console.log(r.methods.filter(x=>x.carrierCode==='CHINA_POST').length)"
```

8. 人工确认后再覆盖：

```text
config/shipping/rules.json
```

## 脚本说明
- `npm run shipping:import` 会读取本目录中的官方 XLSX，生成 `config/shipping/rules.generated.json`。
- `npm run shipping:validate:generated` 只校验生成文件的结构和关键字段，不会替换线上使用的 `rules.json`。
- 当前导入覆盖中国发货到俄罗斯的商业承运商规则和 China Post 规则。
- `Drop_off_China_17_04_2026.xlsx` 当前只作为揽收点数据源保留，暂不参与费用计算。
- `config/shipping/calculator-calibration.json` 会在导入时合并进生成规则，用于补充官方计算器展示的 `variants`、时效、标签和边界样本。

## 约束
- 不要把截图样例当成长期规则源。
- 不要手工维护 100+ 服务规则。
- 官方 XLSX 是主数据源，官方计算器只用于抽样校验。
