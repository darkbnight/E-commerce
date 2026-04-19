# .cache 目录说明

## 1. 目录定位

`.cache/` 是**运行时缓存目录**，不是正式业务数据目录，也不是需要长期保存的核心资产目录。

它的主要作用是：
- 给采集脚本提供一个**紫鸟浏览器用户目录副本**
- 在不直接占用原始紫鸟运行目录的前提下，复用登录态、扩展状态、Local Storage、Session Storage、IndexedDB 等运行时信息
- 让 Playwright/Chromium 可以基于这个副本启动自动化浏览器，访问萌拉并抓取数据

结论：
- `db/` 里的 SQLite 才是正式业务数据
- `data/` 里的报告、截图、测试产物才是正式运行产物
- `.cache/` 只是辅助执行用的缓存和中间副本

## 2. 当前保留策略

`.cache/` 目录现在只建议保留两类内容：
- `README.md`
- `ziniao-profile-copy-stable/`

说明：
- `ziniao-profile-copy-stable/` 是当前**稳定浏览器副本**
- 旧的测试副本、时间戳副本、实验副本都应删除
- 如果后续再次出现 `ziniao-profile-copy-test-*` 或 `ziniao-profile-copy-*` 这类历史目录，默认都属于可清理对象

## 3. stable 副本的作用

`ziniao-profile-copy-stable/` 的作用不是保存业务数据，而是给自动化采集提供一个**可重复使用的浏览器运行态副本**。

它会包含这类内容：
- `Local State`
- `Default/Preferences`
- `Default/Network`
- `Default/Local Storage`
- `Default/Session Storage`
- `Default/IndexedDB`
- `Default/WebStorage`
- `Default/Extensions`
- `Default/Extension State`

这些文件共同决定了自动化浏览器是否能尽可能复用紫鸟里的有效登录态。

## 4. 它是不是每次采集都必须人工维护

不是。

正常逻辑是：
1. 你维护紫鸟原始浏览器里的有效登录态
2. 采集脚本在运行时自动创建或刷新 `ziniao-profile-copy-stable/`
3. 自动化浏览器基于这个 stable 副本启动
4. 抓取结束后 stable 副本保留，供下次直接复用

所以：
- `.cache/` 不是你手工维护登录态的地方
- 真正的登录态来源仍然是紫鸟浏览器原始用户目录
- `.cache/ziniao-profile-copy-stable/` 是自动化执行层的副本，不是源头

## 5. 与采集脚本的关系

当前项目的采集脚本是：
- `scripts/menglar-mvp.mjs`

脚本会做这些事：
1. 读取紫鸟原始用户目录
2. 检查 `.cache/ziniao-profile-copy-stable/` 是否存在且可用
3. 若不存在或你要求强制刷新，则重新复制关键目录
4. 从副本中提取 Local Storage / Session Storage 等运行时状态
5. 启动自动化浏览器访问萌拉页面
6. 抓取接口数据并写入：
   - `db/menglar-mvp.sqlite`
7. 把运行报告和截图写入：
   - `data/menglar-mvp/`

所以 `.cache/` 的职责只有一个：辅助自动化运行。

## 6. 生成方式

### 默认生成方式

在项目根目录执行：

```powershell
npm run mvp:probe
```

脚本会自动：
- 创建 `.cache/`
- 创建或复用 `ziniao-profile-copy-stable/`
- 基于 stable 副本启动自动化浏览器

### 强制刷新 stable 副本

如果你怀疑 stable 副本过期，或者紫鸟登录态刚更新，可以强制重建：

```powershell
$env:MENGLAR_REFRESH_PROFILE='1'
npm run mvp:probe
```

这会强制删除并重建：
- `.cache/ziniao-profile-copy-stable/`

### 自定义紫鸟原始用户目录

如果后续紫鸟目录变了，可以这样指定：

```powershell
$env:ZINIAO_PROFILE_DIR='C:\Users\Administrator\AppData\Roaming\ziniaobrowser\userdata\chrome_xxx'
npm run mvp:probe
```

### 自定义浏览器内核路径

如果紫鸟或系统 Chrome 路径变了，可以这样指定：

```powershell
$env:ZINIAO_EXECUTABLE_PATH='C:\path\to\ziniaobrowser.exe'
$env:CHROME_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run mvp:probe
```

## 7. 清理策略

### 应保留

- `README.md`
- `ziniao-profile-copy-stable/`

### 可删除

- `ziniao-profile-copy/`
- `ziniao-profile-copy-test-*`
- `ziniao-profile-copy-*` 的历史时间戳目录
- 已明确不用的实验性副本

### 不要在这些场景下删除

- 正在运行 `npm run mvp:probe`
- 正在有自动化浏览器进程占用 stable 副本

## 8. 推荐使用方式

如果你只是正常采集，直接运行：

```powershell
npm run mvp:probe
```

如果你刚重新登录紫鸟，或者怀疑副本和当前登录态不一致，运行：

```powershell
$env:MENGLAR_REFRESH_PROFILE='1'
npm run mvp:probe
```

## 9. 推荐理解方式

- `db/`
  - 正式业务数据
- `data/`
  - 运行报告、截图、测试产物
- `.cache/`
  - 自动化运行时缓存
- `frontend/`
  - 前端工作台代码
- `backend/`
  - 后端 API 服务代码
- `scripts/`
  - 采集与辅助脚本
