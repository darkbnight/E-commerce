# Ozon批量上货工作台

## 模块一：【需求概述与交互】
### 需求背景
当前仓库已有 Ozon 批量上货 CLI 工具，但命令行入口不适合日常运营。早期页面把凭证、JSON、执行、任务查询和类目查询一次性平铺，虽然能完成联调，但主线不清晰，真实执行风险也不够突出。

### 一句话需求描述
在 Menglar Workbench 中建设一个步骤式 Ozon 批量上货页面，让用户按“选择动作 -> 导入数据 -> 校验数据 -> 确认执行”的顺序完成商品、价格和库存批量操作。

### 解决方案大纲
1. 复用本地 `/api/ozon/*` 接口和 Ozon client，不重复实现 API 调用逻辑。
2. 前端 `/ozon-upload` 改为步骤化工作流。
3. 凭证和环境抽象为“连接配置”二级面板，使用浏览器 `localStorage` 本地保存，不落后端数据库。
4. 支持操作卡片切换、当前模板载入、JSON 文件导入、JSON 高级编辑。
5. 本地校验和 dry-run 作为默认安全路径。
6. 真实执行必须勾选确认项，明确当前环境和影响条数。
7. 执行结果优先展示摘要卡、错误/预警列表，原始 JSON 默认折叠。
8. 类目属性助手从当前商品 JSON 自动带出 `category_id`，减少重复输入。

### 用户核心体验链路
1. 打开“ Ozon上货工具”页面。
2. 首次使用时打开“连接配置”，保存 Client ID、Api Key 和环境。
3. 后续进入页面时自动读取本机连接配置，不再重复填写。
4. 选择商品上货、价格更新或库存更新。
5. 载入当前模板或上传 JSON 文件。
6. 执行本地校验，修复错误后执行 dry-run。
7. 确认无误后勾选真实执行确认项，再提交真实请求。
8. 拿到 `task_id` 后在右侧查询导入状态。

## 模块二：【前端与组件设计】
### 新增路由
- `/ozon-upload`

### 页面结构
- 顶部 Hero：说明工具定位、显示连接配置状态，并提供“打开连接配置”入口。
- 步骤条：`选择动作 -> 导入数据 -> 校验数据 -> 确认执行`。
- 主操作区：
  - 操作模式卡片：商品上货、更新价格、更新库存。
  - 导入与编辑：载入当前模板、上传 JSON 文件、清空、格式化、JSON 编辑区。
  - 校验与执行：本地校验、仅模拟分片、真实执行、执行确认勾选。
  - 结果区：摘要卡、问题列表、原始返回折叠。
- 右侧辅助区：
  - 连接状态摘要与二级配置入口。
  - 任务查询。
  - 类目属性助手。
  - 属性值查询。
  - 运营提示。
- 二级连接配置抽屉：
  - Client ID。
  - Api Key。
  - Base URL。
  - 保存到本机。
  - 清除本机配置。

### 组件复用与新增
- 复用 `Panel`。
- 复用现有 `AppShell`。
- 页面组件：`frontend/menglar-workbench/src/pages/OzonUploadPage.jsx`。

## 模块三：【后端与架构设计】
### 本地 API
- `GET /api/ozon/template`
- `POST /api/ozon/validate`
- `POST /api/ozon/execute`
- `POST /api/ozon/import-info`
- `POST /api/ozon/category-attributes`
- `POST /api/ozon/attribute-values`

### 设计说明
1. 后端仅做本地代理和结构校验，不保存 Ozon 凭证。
2. 页面从浏览器 `localStorage` 读取连接配置，每次请求仍显式传入凭证和环境。
3. 商品导入继续沿用 100 条自动分片策略。
4. `dryRun=true` 时只返回本地推演结果，不发真实 Ozon 请求。

### 数据库与埋点
本需求不新增数据库表，不修改现有数据库文档。

本需求不新增埋点。

## 模块四：【📝 联合自动化验收用例 (TDD核心)】
### 第一阶段用例（Node 接口与数据库闭环）
- [ ] 调用 `GET /api/ozon/template?kind=products`，断言返回 `items[0].offer_id`。
- [ ] 调用 `POST /api/ozon/validate` 并传入合法商品 JSON，断言 `ok=true`。
- [ ] 调用 `POST /api/ozon/execute` 执行 `upload` 且 `dryRun=true`，断言返回分片结果且未发远程请求。
- [ ] 调用 `POST /api/ozon/execute` 执行 `prices` 与 `stocks`，断言 mock server 收到对应 API 请求。
- [ ] 调用 `POST /api/ozon/import-info`，断言返回任务状态。
- [ ] 调用 `POST /api/ozon/category-attributes`，断言返回类目属性列表。
- [ ] 调用 `POST /api/ozon/attribute-values`，断言返回字典值列表。
- [ ] 数据库字段级验证：本需求不涉及数据库写入，本项不适用。

### 第二阶段用例（E2E 端到端浏览器闭环）
- [ ] 打开 `/ozon-upload` 页面，断言步骤条、操作卡片、JSON 编辑区和执行按钮存在。
- [ ] 打开连接配置抽屉，填写并保存 Client ID、Api Key、Base URL，刷新后断言配置自动带出。
- [ ] 点击“载入当前模板”，断言编辑区出现 `offer_id`。
- [ ] 点击“本地校验”，断言页面显示“本地校验通过，可以继续 dry-run”。
- [ ] 点击“仅模拟分片”，断言页面显示“模拟执行完成，未请求 Ozon”。
- [ ] 输入 `task_id` 并点击任务查询，断言页面展示导入状态。
- [ ] 输入类目 ID 并查询，断言页面展示类目属性结果。
