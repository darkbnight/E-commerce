# 商品内容资产与SKU资产建模

## 模块一：【需求概述与交互】

### 需求背景

当前数据库已经区分了采集任务、经营快照和内容资产，但内容资产口径仍偏旧，存在两个问题：

- `product_content_assets` 同时承接产品级字段和部分历史扩展语义，边界不够清楚。
- 当前缺少稳定的 SKU 资产表，无法明确表达“一个商品下面有哪些 SKU，以及这些 SKU 属于哪一版内容资产”。

同时，本轮已经明确一个设计原则：数据库表应该围绕业务对象建模，而不是围绕某一个具体采集来源建模。今天可以通过萌拉采集内容资产，后续也应允许通过其它脚本或来源写入同一套表结构。

### 一句话需求描述

将商品内容数据收敛为“产品级内容资产表 + SKU 级资产表”两层结构，并保留轻量采集任务摘要，使同一商品的经营快照、内容资产和 SKU 资产都能通过统一商品身份稳定关联。

### 解决方案大纲

1. 保留 `source_jobs` 作为轻量采集行为摘要，不新增来源专属任务表。
2. 调整 `product_content_assets`，只承接产品级内容字段，如标题、描述、标签、主图、多图。
3. 新增 `product_content_skus`，承接 SKU 级字段，如平台 SKU ID、SKU 名称、价格、图片数组。
4. 商品身份统一采用 `platform + platform_product_id`。
5. 内容版本用 `content_hash` 判断是否变化，用 `captured_at` 判断最新版本，当前阶段不强制保存显式 `version_no`。

### 本轮开发范围

本轮只落地数据库和内容采集底座，不直接扩展上货草稿和复杂属性整理能力：

- 落地 `product_content_assets`
- 落地 `product_content_skus`
- 约束 `source_jobs` 在内容采集场景下的摘要口径
- 提供内容资产入库和读取的后端基础能力
- 提供最小查询口径，支持读取某商品最新内容版本及其 SKU

本轮明确不做：

- 不新增来源专属任务表
- 不把属性、品牌、包装尺寸、视频等字段提前塞进当前最小模型
- 不改造 Ozon 上货执行链路
- 不在本轮强制引入显式 `version_no`

### 用户的核心体验链路

1. 用户执行一次商品内容资产采集。
2. 系统在 `source_jobs` 中记录这次采集行为及摘要结果。
3. 系统将产品级内容写入 `product_content_assets`。
4. 系统将该内容版本下的 SKU 集合写入 `product_content_skus`。
5. 后续无论是展示商品最新内容、查看历史内容，还是准备上货草稿，都通过统一商品身份和内容版本关系读取。

## 模块二：【前端与组件设计】

本轮主要是数据建模与数据库文档收敛，不直接新增前端页面。

后续读取口径建议如下：

- 商品最新内容：读取 `product_content_assets` 中同商品 `captured_at` 最新的一条。
- 商品最新 SKU：读取该最新内容版本对应的 `product_content_skus`。
- 商品经营数据：继续读取 `product_business_snapshots` 中同商品最新或指定批次快照。

后续如新增内容资产详情页或商品整理页，组件层应明确区分：

- 产品级字段区：标题、描述、标签、主图、多图
- SKU 列表区：SKU 名称、价格、图片数组

## 模块三：【后端与架构设计】

### 数据模型

#### 1. `source_jobs`

继续作为轻量采集任务摘要表使用，记录：

- 来源
- 状态
- 时间
- 结果数量
- 错误摘要

不引入来源专属状态机，不因为萌拉的采集流程单独创建 `menglar_*` 任务表。

#### 2. `product_content_assets`

产品级内容资产表，核心字段包括：

- `source_job_id`
- `platform`
- `platform_product_id`
- `product_url`
- `title`
- `description`
- `tags_json`
- `main_image_url`
- `image_urls_json`
- `content_hash`
- `captured_at`

约束：

```text
UNIQUE(platform, platform_product_id, content_hash)
```

#### 3. `product_content_skus`

SKU 级资产表，核心字段包括：

- `content_asset_id`
- `source_job_id`
- `platform`
- `platform_product_id`
- `platform_sku_id`
- `sku_name`
- `price`
- `currency_code`
- `images_json`
- `sort_order`
- `captured_at`

约束：

```text
UNIQUE(content_asset_id, platform_sku_id)
```

### 开发阶段拆分

#### 阶段一：数据库迁移与文档收敛

目标：

- 新增 `product_content_skus`
- 调整 `product_content_assets` 的字段口径
- 同步数据库说明和表文档

落地产物：

- migration 脚本
- 表文档
- 数据库说明文档

#### 阶段二：内容采集入库服务

目标：

- 输入一批商品内容采集结果
- 计算 `content_hash`
- 判断是否需要新增内容版本
- 写入 `product_content_assets`
- 写入该版本对应的 `product_content_skus`

核心约束：

- 相同 `content_hash` 不重复创建内容版本
- SKU 通过 `content_asset_id` 归属到对应内容版本
- SKU 图片统一使用 `images_json`

#### 阶段三：内容资产读取服务

目标：

- 查询指定商品最新内容版本
- 查询指定内容版本历史
- 查询某条内容版本下的 SKU 集合

推荐读取口径：

- 最新版本：`ORDER BY captured_at DESC, id DESC LIMIT 1`
- 历史版本：按 `captured_at DESC`
- SKU：按 `sort_order ASC, id ASC`

#### 阶段四：后续页面或下游模块接入

目标：

- 商品整理页读取最新内容资产
- 后续上货草稿模块读取产品级内容和 SKU 集合

边界：

- 页面接入放在数据库与服务层稳定之后
- 不反向修改经营快照表结构

### 关联规则

#### 商品身份

统一采用：

```text
platform + platform_product_id
```

#### 内容版本

- 同一商品允许存在多条内容版本
- `content_hash` 用于判断内容是否变化
- `captured_at` 用于判断最新版本
- 当前阶段不强制落库 `version_no`

#### SKU 关系

- 一条 `product_content_assets` 对应多条 `product_content_skus`
- SKU 跟随内容版本走，不直接挂经营快照

### API 设计

本轮建议先实现内部服务和最小读取接口，再决定是否开放给前端。

如果新增以下 API，则需要同步维护 `docs/API接口文档.md`：

- `GET /api/product-content`：查询某商品最新或历史内容版本
- `GET /api/product-content/:id/skus`：查询某条内容版本下的 SKU 集合

如果本轮只做内部服务层与脚本调用，则暂不改动 `docs/API接口文档.md`。

### 数据库文档范围

本轮需要同步维护：

- `docs/db/数据库说明文档.md`
- `docs/db/source_jobs表文档.md`
- `docs/db/product_content_assets表文档.md`
- `docs/db/product_content_skus表文档.md`

### 开发风险与约束

1. `platform_product_id` 必须尽量稳定，不能退化成标题或临时字符串。
2. `content_hash` 的计算字段必须固定，否则同样内容会被误判为新版本。
3. SKU 去重口径必须限定在 `content_asset_id` 下面，不能全局只按 `platform_sku_id` 去重。
4. 如果某次采集只拿到产品级内容、没拿到完整 SKU，应明确落库策略，避免出现半成品版本污染最新版本读取。
5. 当前阶段不提前引入复杂属性表，避免把最小内容模型再次做重。

## 模块四：【📝 联合自动化验收用例 (TDD核心)】

- [ ] 第一阶段用例：执行数据库迁移后，查库确认新增表 `product_content_skus` 存在，且字段至少包含 `content_asset_id`、`platform_product_id`、`platform_sku_id`、`price`、`images_json`。
- [ ] 第一阶段用例：写入一条 `product_content_assets` 后，查库确认表 `product_content_assets` 字段 `platform`、`platform_product_id`、`content_hash`、`captured_at` 正确落库。
- [ ] 第一阶段用例：对同一商品重复写入相同 `content_hash` 的内容时，断言 `product_content_assets` 不产生重复版本。
- [ ] 第一阶段用例：写入一条内容资产及其两条 SKU 后，查库确认表 `product_content_skus.content_asset_id` 正确关联 `product_content_assets.id`，并确认 `platform_sku_id`、`price`、`images_json` 正确。
- [ ] 第一阶段用例：对同一条内容资产重复写入相同 `platform_sku_id` 时，断言 `UNIQUE(content_asset_id, platform_sku_id)` 生效，不产生重复 SKU。
- [ ] 第一阶段用例：同一商品先后写入两版不同 `content_hash` 的内容时，查库确认 `product_content_assets` 产生两条记录，且每条记录下的 `product_content_skus` 集合互相独立。
- [ ] 第一阶段用例：查库确认 `source_jobs.id` 可以关联到 `product_content_assets.source_job_id` 和 `product_content_skus.source_job_id`，并能统计本次内容采集产生的产品数和 SKU 数。
- [ ] 第二阶段用例：后续页面读取某商品内容资产时，默认展示 `captured_at` 最新的一条 `product_content_assets`，并展示其对应 `product_content_skus` 列表。
