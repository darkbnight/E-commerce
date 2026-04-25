---
name: menglar-product-content-assets
description: Capture and verify Menglar/Ozon product content assets for a specific product ID by reusing the repository's Menglar scripts, browser session, and SQLite storage. Use when Codex needs to fetch or validate a product's title, description, tags, dimensions, images, SKU assets, or troubleshoot why content-asset capture is incomplete or unstable.
---

# 萌啦商品内容资产采集

用这个技能把“指定商品 ID 的内容资产采集”沉淀成固定闭环，而不是每次都重新猜页面、接口和字段。

## 默认流程

1. 先读 `references/workflow.md`，按其中顺序执行前置检查、采集、查库和结果输出。
2. 涉及字段来源、接口路径、表结构校验口径时，再读 `references/fields-and-validation.md`。
3. 只有用户明确要求改脚本或修稳定性时，才进入 `scripts/menglar-capture/content-assets.mjs`、`lib/content-assets-store.mjs` 进行实现。

## 快速执行

### 1. 检查采集前置状态

优先执行：

```bash
node scripts/menglar-capture/login-health.mjs --target hot_products --refresh --json
```

判断口径：
- `ok=true`：可以继续采集。
- `login_required` / `guest_blocked` / `api_auth_missing` / `api_unauthorized`：先处理登录态和授权，不要直接判定脚本失败。
- 如果只是判断是否可采，优先复用 `.cache/menglar-capture/login-health-last.json`，避免无意义重复操作。

### 2. 采集指定商品内容资产

执行：

```bash
node scripts/menglar-capture/content-assets.mjs --product-id <商品ID> --json
```

预期行为：
- 先通过采集箱 `pageQuery` 定位商品。
- 再通过 `improveEditing/{libraryId}` 拉取编辑详情。
- 将标准化后的结果写入 `product_content_assets` 和 `product_content_skus`。
- 将最近一次运行结果写入 `.cache/menglar-capture/content-assets-last.json`。

### 3. 直连数据库核验

至少核验：
- `source_jobs`：本轮任务是否 `success`
- `product_content_assets`：是否写入目标商品的最新内容版本
- `product_content_skus`：是否写入该内容版本下的 SKU 资产

如果脚本返回成功但数据库未落库，不得判定为完成。

## 输出要求

对用户的结论至少包含：
- 商品 ID
- 是否采集成功
- 命中的 `libraryId`
- 内容资产主记录数量和 SKU 数量
- 标题、描述长度、标签数、图片数等核心摘要
- `source_jobs`、`product_content_assets`、`product_content_skus` 的查库结论
- 如果失败，明确卡在“登录态 / 商品未命中 / 编辑详情接口 / 标准化 / 落库”哪一层

## 边界

- 不把 Authorization、Cookie、Token 直接写进文档或长期缓存。
- 不因为页面能打开就默认接口可用，必须以授权请求和接口返回为准。
- 不在未核对数据库的情况下宣称“已稳定返回内容资产数据”。
