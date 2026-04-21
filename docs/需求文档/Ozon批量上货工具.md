# Ozon批量上货工具

## 模块一：【需求概述与交互】
### 需求背景
当前仓库已经沉淀了 Ozon 选品、上架 SOP、图片和单品填写稿，但真正把商品批量推送到 Ozon Seller API 的执行工具还缺失。现状是资料有了，真正提交仍依赖人工进后台逐条填写，效率低且容易在属性、价格、库存、批次追踪上出错。

### 一句话需求描述
建设一个本地可执行的 Ozon 批量上货 CLI 工具，支持商品导入、导入状态查询、类目属性查询、价格更新和库存更新。

### 解决方案大纲
1. 使用 Node.js 内置 `fetch` 对接 Ozon Seller API，不引入额外第三方依赖。
2. 以 JSON 作为输入模板，统一批量商品、价格、库存的数据结构。
3. 对商品数据做本地结构校验，阻断明显脏数据进入 Ozon。
4. 商品上传时自动按 Ozon 单次最多 100 条分片提交。
5. 输出本地 JSON 报告，记录输入文件、执行时间、分片结果和任务信息。

### 用户核心体验链路
1. 运营或开发先执行模板命令生成示例文件。
2. 按模板填入商品数据、价格数据或库存数据。
3. 先执行本地校验，确认没有明显缺项。
4. 再执行上传命令，工具自动分批调用 Ozon API。
5. 如需排查审核状态，再用 `import-info` 查询导入任务结果。

## 模块二：【前端与组件设计】
本需求不新增前端页面，不新增 React 路由与组件。

本阶段只提供 CLI 工具，后续如果要接工作台或后台页面，直接复用同一套 Ozon client 模块和输入输出结构。

## 模块三：【后端与架构设计】
### 新增脚本
- `scripts/ozon-batch-tool.mjs`
  - CLI 入口
  - 支持 `template / validate / upload / import-info / category-tree / category-attributes / attribute-values / prices / stocks`
- `scripts/lib/ozon-seller-client.mjs`
  - 封装 Ozon Seller API 请求
  - 处理鉴权、分片、JSON 文件读写和本地校验
- `scripts/test-ozon-batch-tool.mjs`
  - 启动本地 mock server
  - 对 CLI 做闭环自测

### 输入设计
1. 商品上货 JSON
   - 顶层 `items`
   - 每项至少包含 `offer_id`、`name`、`category_id`、`price`、`vat`、`images`、`attributes`
2. 价格 JSON
   - 顶层 `items`
   - 每项至少包含 `offer_id` 或 `product_id`，以及 `price`
3. 库存 JSON
   - 顶层 `items`
   - 每项至少包含 `offer_id` 或 `product_id`、`warehouse_id`、`stock`

### Ozon API 对接设计
- 商品创建或更新：`POST /v2/product/import`
- 导入状态查询：`POST /v1/product/import/info`
- 类目树：`POST /v2/category/tree`
- 类目属性：`POST /v3/category/attribute`
- 属性字典值：`POST /v2/category/attribute/values`
- 价格更新：`POST /v1/product/import/prices`
- 库存更新：`POST /v2/products/stocks`

### 批量策略
1. 单次商品导入按 100 条分批。
2. 每个批次单独请求并记录返回值。
3. 如果本地校验不通过，直接终止上传，不进入远程请求。

### 错误处理
1. Ozon API 非 2xx 时抛出错误并打印响应体。
2. 输入文件 JSON 解析失败时直接报错。
3. 模板缺少关键字段时通过本地校验阻断。

### 数据库与埋点
本需求不新增数据库表，不修改现有数据库文档。

本需求不新增埋点。

## 模块四：【📝 联合自动化验收用例 (TDD核心)】
### 第一阶段用例（Node 接口与数据库闭环）
- [ ] 生成商品模板文件，断言输出文件存在且包含 `items[0].offer_id`
- [ ] 使用合法商品 JSON 执行 `validate`，断言返回 `ok=true`
- [ ] 使用缺失 `images` 的商品 JSON 执行 `validate`，断言返回 `ok=false` 且错误信息包含 `images`
- [ ] 使用 101 条商品执行 `upload`，断言本地 mock server 收到 2 次 `POST /v2/product/import`，分片数量分别为 100 和 1
- [ ] 执行 `import-info --task-id=<id>`，断言返回导入任务状态
- [ ] 执行 `prices`，断言 mock server 收到 `POST /v1/product/import/prices`
- [ ] 执行 `stocks`，断言 mock server 收到 `POST /v2/products/stocks`
- [ ] 数据库字段级验证：本需求不涉及数据库写入，本项不适用

### 第二阶段用例（E2E 端到端浏览器闭环）
- [ ] 本需求为 CLI 工具，不涉及浏览器端到端链路，本项不适用
