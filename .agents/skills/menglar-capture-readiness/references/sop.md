# 萌拉登录态排障 SOP

## 1. 目标

这个 SOP 用来回答两个问题：

1. 当前萌拉采集到底能不能执行？
2. 如果不能执行，问题属于哪一类，下一步该怎么处理？

它的价值不是“帮系统加功能”，而是让后续 AI 和人都可以复用同一套判断标准。

## 2. 先认清一个核心事实

**紫鸟里能看到页面，不等于采集链路已经可用。**

常见误判：

- 紫鸟当前窗口里已经登录
- 但复制出来的 profile 没拿到有效授权
- 或者页面是游客态 / 权限页
- 或者业务接口根本没有带 Authorization
- 继续采集时就会出现 0 条、401/403、误判成功

所以必须看“可采证据”，不能只看“页面像不像登录了”。

## 3. 标准判断口径

优先看 `login-health` 结果：

- `ok`
- `status`
- `page.url`
- `storage.runtimeStorageLoaded`
- `api.authorizedRequestCount`
- `api.unauthorizedResponseCount`
- `errorType`
- `nextAction`

### 可采

满足以下条件才算可采：

- `ok = true`
- `status = ready`
- `authorizedRequestCount > 0`
- `unauthorizedResponseCount = 0`
- 页面停留在业务页，不是登录页，不是游客/权限页

### 不可采

任意一个条件不满足，都按不可采处理。

## 4. 错误类型与处理

### A. `login_required`

含义：

- 登录失效
- 跳到了登录页
- 页面出现重新登录提示

处理：

1. 在紫鸟中重新登录萌拉
2. 关闭紫鸟窗口，让状态落盘
3. 重新执行 `login-health --refresh`

### B. `guest_blocked`

含义：

- 当前账号是游客态
- 或者没有目标页面权限

处理：

1. 不继续采集
2. 确认当前账号是否具备热销商品/行业页权限
3. 必要时切换账号
4. 再执行 `login-health --refresh`

### C. `api_auth_missing`

含义：

- 页面能打开
- 但没有捕获到带 Authorization 的业务接口请求

处理：

1. 先确认打开的是正确业务页
2. 判断当前页是否只是静态展示，未触发真实接口
3. 必要时在紫鸟里手动打开目标页，再重检

### D. `api_unauthorized`

含义：

- 接口已经发出
- 但返回 401/403

处理：

1. 优先判断账号授权失效
2. 在紫鸟里重新登录
3. 关闭紫鸟窗口让状态落盘
4. 再执行 `login-health --refresh`

### E. `profile_locked`

含义：

- profile 副本或源 profile 被占用
- 或拷贝过程遇到锁文件

处理：

1. 关闭占用 profile 的浏览器进程
2. 再执行 `login-health --refresh`
3. 如果只是单个锁文件告警，但检查结果已 `ready`，按可采处理，不要过度拦截

## 5. 标准排障顺序

1. 先看最近一次 `login-health-last.json`
2. 如果信息不足，再执行：

```bash
node scripts/menglar-capture/login-health.mjs --target hot_products --refresh --json
```

3. 根据 `errorType` 分类
4. 给出明确下一步
5. 只有恢复到 `ready` 后，才进入正式采集

## 6. 什么时候不要写代码

以下场景默认不要改系统：

- 用户只是问“为什么采不了”
- 用户想要一个以后能复用的判断标准
- 当前问题能通过标准 SOP 解释清楚
- 系统已经有 `login-health` 能力，只是没被文档化

## 7. 交接模板

交接给后续 AI 时，建议用这四段：

1. 当前状态：可采 / 不可采
2. 证据：`ok`、`errorType`、授权请求数、401/403、页面 URL
3. 根因判断
4. 下一步动作

示例：

```text
当前状态：不可采
证据：ok=false，errorType=guest_blocked，authorizedRequestCount=0，401/403=0，page.url 为热销商品页但页面提示游客态
根因判断：当前账号权限不足，不是脚本采集参数问题
下一步动作：切换到有权限账号，在紫鸟中重新登录后关闭窗口，再执行 login-health --refresh
```
