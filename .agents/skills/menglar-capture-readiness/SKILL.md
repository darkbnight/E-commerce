---
name: menglar-capture-readiness
description: Reuse the Menglar capture-readiness workflow for pre-collection confirmation and troubleshooting. Use when Codex needs to judge whether Menglar/Ozon data capture is actually ready, explain why a session looks logged in but still cannot collect, follow the repo SOP for guest/login/auth/profile issues, or hand off the next AI with a stable capture-readiness diagnosis.
---

# Menglar Capture Readiness

Use this skill to handle 萌拉采集前可用性确认和登录态排障，不要把这类问题默认做成新的产品功能。

## 工作方式

1. 先读 `references/sop.md`，按其中的决策树判断问题类型。
2. 优先复用仓库现有能力，不重复造轮子：
   - `scripts/menglar-capture/login-health.mjs`
   - `scripts/menglar-capture/preflight.mjs`
   - `POST /api/menglar/login-health`
   - `.cache/menglar-capture/login-health-last.json`
3. 如果用户只是要排障、确认、交接、沉淀方法：
   - 输出 SOP 结论
   - 更新文档
   - 不新增页面功能、不新增接口、不改数据库
4. 只有用户明确要求改系统能力时，才进入产品开发。

## 默认流程

### 1. 先判断是不是真的要排障

优先回答三个问题：

- 当前是要“确认能不能采”，还是要“真正修代码”？
- 当前问题是一次性登录状态波动，还是系统链路设计缺陷？
- 仓库里是否已经有检查结果或缓存，不需要重新跑？

如果只是要给后续 AI 复用，默认输出文档和 SOP，不进入功能开发。

### 2. 复用现有检查结果

先看：

- `.cache/menglar-capture/login-health-last.json`
- 最近一次用户截图
- 最近一次采集任务状态

如果结果已经足够说明问题，直接给结论，不重复执行浏览器操作。

### 3. 需要重检时才执行

优先使用：

```bash
node scripts/menglar-capture/login-health.mjs --target hot_products --refresh --json
```

根据返回值判断：

- `ok=true`：可采
- `login_required`：登录失效
- `guest_blocked`：游客态或权限不足
- `api_auth_missing`：页面可开，但没拿到可用业务授权
- `api_unauthorized`：接口 401/403
- `profile_locked`：profile 副本或源目录被占用

### 4. 输出必须结构化

至少要写清楚：

- 当前状态：可采 / 不可采
- 证据：页面 URL、`authorizedRequestCount`、`401/403`、`errorType`
- 根因判断
- 下一步动作

不要只说“登录有问题”。

## 写文档时怎么落

优先更新：

- `docs/需求文档/萌拉登录态排障SOP.md`

如果是给 AI 复用的方法论，内容重点放在：

1. 问题定义
2. 判断口径
3. 标准 SOP
4. 常见误判
5. 交接格式

## 什么时候要挑战用户

如果用户把“登录排障”误当成“必须继续堆功能”，要直接指出：

- 这类问题首先是运行流程问题，不是产品缺功能
- 先沉淀 SOP，减少未来重复诊断成本
- 只有 SOP 无法覆盖时，才值得改系统

## 边界

- 不把 Authorization、token、cookie 等敏感信息写进文档
- 不因为一次游客态就默认改系统
- 不在没有明确要求时把排障流程产品化
