# 萌拉登录态排障 SOP

## 1. 适用范围

用于萌拉行业数据、热销商品等采集前的登录态确认和问题排障。目标不是新增系统功能，而是沉淀一套后续 AI 和人工都能复用的标准流程。

## 2. 核心原则

**紫鸟里能看到页面，不等于采集链路已经可用。**

判断是否可采，必须看这些证据：

- `ok`
- `status`
- `page.url`
- `storage.runtimeStorageLoaded`
- `api.authorizedRequestCount`
- `api.unauthorizedResponseCount`
- `errorType`

## 3. 标准检查命令

```bash
node scripts/menglar-capture/login-health.mjs --target hot_products --refresh --json
```

检查结果缓存：

```text
.cache/menglar-capture/login-health-last.json
```

## 4. 可采标准

只有满足以下条件，才允许进入正式采集：

- `ok = true`
- `status = ready`
- `authorizedRequestCount > 0`
- `unauthorizedResponseCount = 0`
- 页面停留在业务页，不是登录页，不是游客/权限页

## 5. 错误类型与处理

### 5.1 `login_required`

说明：登录失效或跳转登录页  
处理：

1. 在紫鸟中重新登录萌拉
2. 关闭紫鸟窗口让状态落盘
3. 重新执行检查命令

### 5.2 `guest_blocked`

说明：游客态或没有页面权限  
处理：

1. 不继续采集
2. 确认账号是否具备目标页面权限
3. 必要时切换账号
4. 重新执行检查命令

### 5.3 `api_auth_missing`

说明：页面能打开，但没有可用业务授权  
处理：

1. 确认打开的是正确业务页
2. 必要时在紫鸟中手动打开目标页
3. 再次执行检查命令

### 5.4 `api_unauthorized`

说明：业务接口返回 401/403  
处理：

1. 优先判断账号授权失效
2. 在紫鸟里重新登录
3. 关闭紫鸟窗口让状态落盘
4. 再次执行检查命令

### 5.5 `profile_locked`

说明：profile 被占用或拷贝时遇到锁文件  
处理：

1. 关闭占用 profile 的浏览器进程
2. 再次执行检查命令
3. 如果检查结果已是 `ready`，不要因为单个锁文件告警阻塞采集

## 6. 标准排障顺序

1. 先看最近一次 `login-health-last.json`
2. 如果信息不足，再执行检查命令
3. 根据 `errorType` 分类
4. 输出当前状态、证据、根因判断、下一步动作
5. 只有恢复为 `ready` 后，才继续正式采集

## 7. 给后续 AI 的交接格式

建议统一写成四段：

1. 当前状态：可采 / 不可采
2. 证据：`ok`、`errorType`、授权请求数、401/403、页面 URL
3. 根因判断
4. 下一步动作

示例：

```text
当前状态：不可采
证据：ok=false，errorType=guest_blocked，authorizedRequestCount=0，401/403=0，页面 URL 为热销商品页
根因判断：当前账号权限不足，不是采集参数问题
下一步动作：切换到有权限账号，在紫鸟中重新登录后关闭窗口，再执行 login-health --refresh
```
