# 萌拉采集脚本

这个目录集中管理萌拉采集相关脚本，目标是把“环境是否可采”和“正式采集”拆开，减少反复启动后才发现登录、权限或浏览器不可用的问题。

## 目录

| 文件 | 用途 |
| --- | --- |
| `preflight.mjs` | 采集前置检查：Chrome、Profile 副本、登录态、业务接口 Authorization |
| `industry-deep-dive.mjs` | 行业数据二次分析采集，采到 3 级类目层级 |
| `hot-products.mjs` | 热销商品采集，保留原商品级入库逻辑 |
| `lib/` | Profile、浏览器、数据库任务记录等公共能力 |

## 常用命令

```bash
node scripts/menglar-capture/preflight.mjs --target industry_general --json
node scripts/menglar-capture/industry-deep-dive.mjs
node scripts/menglar-capture/hot-products.mjs
```

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
| `profile.usable` | 稳定 Profile 副本是否可用 |
| `auth.runtimeStorageLoaded` | 是否提取到本地登录态缓存 |
| `auth.authorizationCaptured` | 是否捕获到萌拉业务接口 Authorization |
| `errorType` | 阻塞类型 |
| `nextAction` | 下一步处理建议 |

## 错误类型

| 类型 | 含义 | 建议 |
| --- | --- | --- |
| `login_required` | 页面提示未登录或登录过期 | 重新登录萌拉后再执行采集 |
| `guest_blocked` | 账号处于游客态或权限不足 | 确认账号权限 |
| `profile_locked` | Profile 副本不可用或源 Profile 被占用 | 关闭占用浏览器，必要时加 `--refresh` |
| `browser_blocked` | Chrome 路径缺失或启动失败 | 检查 Chrome 路径、权限、杀掉残留进程 |
| `api_auth_missing` | 页面能打开，但未出现带 Authorization 的业务接口请求 | 手动打开目标页确认接口正常加载 |
| `db_error` | 数据库不可写或迁移失败 | 检查 `db/menglar-mvp.sqlite` |

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ZINIAO_PROFILE_DIR` | 紫鸟默认用户目录 | 登录态来源 |
| `CHROME_EXECUTABLE_PATH` | `C:\Program Files\Google\Chrome\Application\chrome.exe` | 采集浏览器 |
| `MENGLAR_REFRESH_PROFILE=1` | 未启用 | 强制刷新 `.cache/ziniao-profile-copy-stable` |
| `MENGLAR_TARGET_URL` | 热销商品默认页 | 仅影响 `hot-products.mjs` |

## 任务记录口径

脚本会更新 `source_jobs`：

| 字段 | 行业采集 | 商品采集 |
| --- | --- | --- |
| `request_count` | 请求的二级类目数 | 捕获的萌拉业务接口响应数 |
| `success_count` | 成功返回的二级类目数 | 成功返回的萌拉业务接口响应数 |
| `record_count` | 去重后的行业记录数 | 标准化入库商品数 |
| `error_type` | 标准错误类型 | 标准错误类型 |

行业机会分析阶段只采到类目层级；商品级、卖家级、物流售后等分析应放到后续专门的商品采集技能里处理。
