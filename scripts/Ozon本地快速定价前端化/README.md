# Ozon本地快速定价前端化

## 脚本
- `pricing-calculator-test.mjs`：直接导入前端定价纯函数，验证默认定价、手动覆盖和异常费率边界。

## 运行
```bash
node scripts/Ozon本地快速定价前端化/pricing-calculator-test.mjs
```

## 说明
- 本功能不写数据库，脚本不做查库。
- 数据快照来自 `frontend/menglar-workbench/src/modules/ozon-pricing/data/`。
