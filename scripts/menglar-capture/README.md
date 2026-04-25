# 萌拉采集脚本

这个目录集中管理萌拉数据采集脚本，目标是把“环境是否可采”和“正式采集”拆开，减少因为登录态、权限、浏览器 profile 或接口参数不稳定导致的无效任务。

## 目录

| 文件 | 用途 |
| --- | --- |
| `login-health.mjs` | 萌拉登录态稳定性检查：独立判断 profile、页面登录态、业务接口授权和 401/403 |
| `preflight.mjs` | 采集前置检查：Chrome、profile 副本、登录态、业务接口 Authorization |
| `industry-deep-dive.mjs` | 行业数据二次分析采集，采到 3 级类目层级 |
| `hot-products.mjs` | 热销商品采集，保留原始商品和经营快照入库 |
| `content-assets.mjs` | 单商品内容资产采集：按商品 ID 定位采集箱记录，拉取编辑详情并写入 `product_content_assets / product_content_skus` |
| `lib/` | Profile、浏览器、数据库任务记录等公共能力 |

## 常用命令

```bash
node scripts/menglar-capture/login-health.mjs --target hot_products --json
node scripts/menglar-capture/login-health.mjs --target hot_products --refresh --json
node scripts/menglar-capture/preflight.mjs --target industry_general --json
node scripts/menglar-capture/preflight.mjs --target hot_products --json
node scripts/menglar-capture/industry-deep-dive.mjs
node scripts/menglar-capture/hot-products.mjs
node scripts/menglar-capture/content-assets.mjs --product-id 2755299450 --json
```

## 登录态稳定性检查

正式采集前先问登录态模块，不直接启动采集：

```bash
node scripts/menglar-capture/login-health.mjs --target hot_products --json
```

如果你刚在紫鸟里重新登录过，先关闭紫鸟窗口让登录态落盘，再强制刷新 profile 副本：

```bash
node scripts/menglar-capture/login-health.mjs --target hot_products --refresh --json
```

检查结果会写入：

```text
.cache/menglar-capture/login-health-last.json
```

核心判断口径：

| 字段 | 说明 |
| --- | --- |
| `ok` | 是否可以进入正式采集 |
| `storage.runtimeStorageLoaded` | 是否从紫鸟 profile 读到本地登录缓存 |
| `api.authorizedRequestCount` | 是否捕获到带 Authorization 的业务接口请求 |
| `api.unauthorizedResponseCount` | 业务接口是否返回 401/403 |
| `page.url` | 检查时实际停留页面；如果是 `/workbench/login`，说明登录态不可采 |
| `errorType` | 阻塞类型，如 `login_required`、`guest_blocked`、`api_unauthorized` |
| `nextAction` | 下一步处理建议 |

采集脚本后续只应该依赖这个模块的 `ok=true` 结果。`ok=false` 时不进入正式采集，避免出现“任务成功但入库 0 条”的误判。

## 热销商品标准采集

热销商品采集的标准口径：

- 统计周期：28 天，接口参数 `dateType=TWENTY_EIGHT_DAY`
- 采集数量：50 条，接口参数 `pageSize=50`
- 类目采集：优先使用强制类目参数，避免页面自动请求出现空 `catId` 导致误采全站热销数据

清洁抹布示例：

```bash
$env:MENGLAR_TARGET_URL='https://ozon.menglar.com/workbench/selection/hot?catId=17030280&typeId=96018'
$env:MENGLAR_HOT_CAT_ID='17030280'
$env:MENGLAR_HOT_TYPE_ID='96018'
$env:MENGLAR_HOT_CAT_LEVEL='3'
node scripts/menglar-capture/hot-products.mjs
```

可选覆盖参数：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MENGLAR_DATE_TYPE` | `TWENTY_EIGHT_DAY` | 热销商品统计周期。已确认 `SEVEN_DAY` 为 7 天，`TWENTY_EIGHT_DAY` 为 28 天 |
| `MENGLAR_PAGE_SIZE` | `50` | 接口请求条数 |
| `MENGLAR_MAX_RECORDS` | 等于 `MENGLAR_PAGE_SIZE` | 入库上限；如只想试采 10 条，可设为 `10` |
| `MENGLAR_HOT_CAT_ID` | 空 | 指定热销商品类目 `catId` |
| `MENGLAR_HOT_TYPE_ID` | 空 | 指定热销商品 `typeId` |
| `MENGLAR_HOT_CAT_LEVEL` | `3` | 指定类目层级 |
| `MENGLAR_TARGET_URL` | 热销商品默认页 | 打开的页面 URL，用于触发前端登录态和接口请求头 |

## 前置检查输出

前置检查会写入：

```text
.cache/menglar-capture/preflight-last.json
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `ok` | 是否可以进入正式采集 |
| `target` | 检查目标，当前支持 `industry_general`、`hot_products` |
| `browser.exists` | 系统 Chrome 是否可用 |
| `profile.usable` | 稳定 profile 副本是否可用 |
| `auth.runtimeStorageLoaded` | 是否提取到本地登录态缓存 |
| `auth.authorizationCaptured` | 是否捕获到萌拉业务接口 Authorization |
| `errorType` | 阻塞类型 |
| `nextAction` | 下一步处理建议 |

## 错误类型

| 类型 | 含义 | 建议 |
| --- | --- | --- |
| `login_required` | 页面提示未登录或登录过期 | 重新登录萌拉后再执行采集 |
| `guest_blocked` | 账号处于游客态或权限不足 | 确认账号权限 |
| `profile_locked` | Profile 副本不可用或源 profile 被占用 | 关闭占用浏览器，必要时加 `MENGLAR_REFRESH_PROFILE=1` |
| `browser_blocked` | Chrome 路径缺失或启动失败 | 检查 Chrome 路径、权限、残留进程 |
| `api_auth_missing` | 页面可打开，但没有出现带 Authorization 的业务接口请求 | 手动打开目标页确认接口正常加载 |
| `api_unauthorized` | 已出现业务接口请求，但接口返回 401/403 | 重新登录萌拉，关闭紫鸟窗口让登录态落盘后，执行 `login-health --refresh` |
| `db_error` | 数据库不可写或迁移失败 | 检查 `db/ecommerce-workbench.sqlite` |

## 入库位置

脚本会写入 `db/ecommerce-workbench.sqlite`：

| 表 | 说明 |
| --- | --- |
| `source_jobs` | 采集任务记录 |
| `products_raw` | 原始商品 JSON |
| `product_business_snapshots` | 标准化商品经营快照 |
| `product_content_assets` | 商品内容资产表，当前热销采集不主动写入 |
| `product_content_skus` | 商品内容资产版本下的 SKU 集合 |

## 商品内容资产采集

用于稳定拉取采集箱中某个商品的标题、描述、主题标签、包装尺寸、重量和 SKU 图片集合，并写入内容资产表：

```bash
node scripts/menglar-capture/content-assets.mjs --product-id 2755299450 --json
```

脚本流程：

1. 先执行登录态检查，确认萌拉业务授权可用。
2. 打开采集箱页面并复用授权请求头。
3. 调用 `productLibrary/pageQuery` 定位商品库记录。
4. 调用 `improveEditing/{id}` 获取商品编辑详情。
5. 标准化后写入 `product_content_assets / product_content_skus`。

最近一次执行结果会写入：

```text
.cache/menglar-capture/content-assets-last.json
```

任务记录统计口径：

| 字段 | 行业采集 | 商品采集 |
| --- | --- | --- |
| `request_count` | 请求的二级类目数 | 捕获的萌拉业务接口响应数 |
| `success_count` | 成功返回的二级类目数 | 成功返回的萌拉业务接口响应数 |
| `record_count` | 去重后的行业记录数 | 经营快照入库商品数 |
| `raw_count` | 通常不作为行业主口径 | 原始商品记录数 |
| `normalized_count` | 通常不作为行业主口径 | 标准化商品记录数 |
| `error_type` | 标准错误类型 | 标准错误类型 |

行业机会分析阶段只采到类目层级；商品级、卖家级、物流售后等分析应放到后续专门的商品采集技能里处理。
