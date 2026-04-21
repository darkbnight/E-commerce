# Shipping Config

## 用途
`rules.json` 和 `fx.json` 是本地物流费用计算器的当前生效规则源。

## 维护方式
1. 从 Ozon 官方文档或费率文件整理当前有效规则。
2. 更新 `rules.json`。
3. 更新 `fx.json`。
4. 运行校验脚本。
5. 自测通过后提交 Git。

## 约束
- 当前只维护“当前可用规则”，不做系统内版本管理。
- 历史变更依赖 Git 追踪。
- 新增方法前，先补齐对应测试用例。
- `rules.json` 只能写入 Ozon 官方文档或 Ozon Global 官方计算器中出现的真实物流服务。
- 禁止写入 `OZON_PARTNER`、`STANDARD_SMALL`、`ECONOMY_PUDO` 这类占位服务名。
- 如果某个服务只来自计算器截图，必须在 `officialSource.sample` 写清楚校准样本。
