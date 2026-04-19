# Todo

- [x] 将工作台 API 服务从 `tools/` 迁移到 `backend/`，统一目录结构
- [x] 清理 `tools/menglar-data-viewer` 历史残留目录与旧入口
- [x] 验证 `backend + frontend + db + scripts` 四层目录链路可正常启动
- [ ] 验证紫鸟浏览器登录态下的萌拉数据页自动化可行性
- [ ] 识别目标页面的真实数据来源：接口响应、XHR、DOM 或混合模式
- [ ] 设计并创建第一阶段 SQLite 数据表：`source_jobs`、`products_raw`、`products_normalized`
- [ ] 实现基础商品数据抓取脚本
- [ ] 实现原始数据落库与标准化落库
- [ ] 编写技术自测脚本，覆盖页面抓取、原始入库、标准化入库
- [ ] 补齐正式测试文档与执行记录
- [ ] 第二阶段再建设筛选规则与筛选结果输出
- [ ] 新增萌拉采集结果前端展示页，展示最新任务摘要与商品列表
- [ ] 提供本地只读接口读取 `source_jobs` 与 `products_normalized`
- [ ] 完成展示页基础筛选、分页、排序与自测截图
- [ ] 将前端展示升级为工作台，拆分 `采集任务页` 与 `结果展示页`
- [ ] 接入 React Router、TanStack Query 和 Motion，形成可扩展前端壳
