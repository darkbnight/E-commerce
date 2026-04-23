# PostgreSQL 数据库替代方案

## 模块一：【需求概述与交互】

### 1. 背景

当前项目仍以 SQLite 文件作为主要数据库载体，核心数据库访问点包括：

- `backend/menglar-workbench-api/server.mjs`
- `scripts/migrate-ecommerce-workbench-db.mjs`
- `scripts/inspect-menglar-db.mjs`
- `scripts/test-ecommerce-db-migration.mjs`
- `scripts/menglar-capture/hot-products.mjs`
- `scripts/menglar-capture/lib/job-store.mjs`
- `scripts/menglar-capture/lib/constants.mjs`

SQLite 适合单机开发和临时调试，但不适合作为多人共享真实业务数据的协作数据库。后续需要逐步替换为 PostgreSQL，形成：

```text
feature 分支 / 本地开发：
连接本地 PostgreSQL 或临时测试库

dev 分支：
负责多人集成、migration 冲突处理、功能验证

main 分支：
连接云端 PostgreSQL，查看和操作真实业务数据
```

### 2. 一句话需求描述

将项目数据库从 SQLite 文件模式逐步替换为 PostgreSQL 模式，并建立 `dev -> main` 的数据库迁移、验证和云端升级流程。

### 3. 解决方案大纲

本次 PostgreSQL 替代分两阶段推进。

阶段 1：数据库基础设施替代

- 引入 PostgreSQL 连接能力。
- 新增统一数据库访问层，避免业务代码直接绑定 `node:sqlite`。
- 建立 `DATABASE_URL` 配置机制。
- 建立本地 Docker PostgreSQL 复用方案，方便合作伙伴快速搭建一致的开发数据库。
- 建立 `db/migrations/` 目录和 migration 执行记录表。
- 提供本地、dev、cloud 三类 migration 命令形态。
- 暂不要求一次性改完所有业务表写入逻辑。

阶段 2：业务读写切换到 PostgreSQL

- 将当前 SQLite 表结构迁移为 PostgreSQL schema。
- 将采集任务、商品结果、商品内容资产等核心表迁移到 PostgreSQL。
- 将后端 API 和采集脚本改为通过统一数据库访问层读写 PostgreSQL。
- 提供 SQLite 到 PostgreSQL 的一次性数据迁移脚本。
- 完成本地/dev 验证后，再对云端 PostgreSQL 执行增量升级。

### 4. 用户核心体验链路

开发者链路：

```text
从 dev 拉功能分支
-> 本地开发功能
-> 如涉及数据库，新增 migration
-> 本地 PostgreSQL 执行 migration
-> 功能自测
-> 合并到 dev
-> dev 数据库执行 migration 并验证
-> dev 稳定后合并到 main
-> 云端 PostgreSQL 执行已验证 migration
-> main 连接云端真实数据运行
```

业务查看链路：

```text
切换到 main
-> 使用云端 DATABASE_URL
-> 启动工作台或采集脚本
-> 读取云端真实业务数据
-> 用于筛选、分析和决策
```

### 5. 本方案不包含

- 不在本阶段部署完整云端服务。
- 不在本阶段引入队列、定时任务平台或复杂 CI/CD。
- 不把真实业务数据提交到 Git。
- 不继续把 SQLite 文件作为多人协作数据源。

## 模块二：【前端与组件设计】

### 1. 前端路由

本阶段不新增前端路由。

现有页面继续通过后端 API 获取数据。前端不应感知底层数据库从 SQLite 切换到 PostgreSQL。

### 2. React 组件

本阶段不新增专门 React 组件。

可能受影响页面：

- 采集任务页。
- 结果展示页。
- 商品筛选页。
- 商品数据整理工作台。

前端影响原则：

- API 响应结构保持兼容。
- 不因数据库替代改变页面字段语义。
- 若后端字段名称必须变化，需要同步维护 `docs/API接口文档.md`。

### 3. 页面状态

本阶段不改变页面结构，因此不强制产出页面结构与线框方案。

后续如新增数据库环境切换页面、数据源管理页面或 migration 管理后台，再另行产出页面结构与线框方案。

## 模块三：【后端与架构设计】

### 1. 环境变量设计

数据库连接只依赖一个核心参数：

```text
DATABASE_URL=postgresql://user:password@host:5432/ecommerce
```

可选：

```text
DATABASE_ENV=local|dev|cloud
SQLITE_DB_PATH=db/ecommerce-workbench.sqlite
```

规则：

- `.env` 不提交 Git。
- 提交 `.env.example`。
- `DATABASE_URL` 存储 PostgreSQL 连接串。
- 业务代码只使用 `DATABASE_URL` 连接数据库。
- `DATABASE_ENV` 不是连接参数，不参与普通业务读写。
- `DATABASE_ENV` 只用于脚本保护和动作分支，例如 migration、backup、seed、reset。
- `SQLITE_DB_PATH` 仅用于阶段 2 的历史数据迁移或兼容读取。

`DATABASE_URL` 和 `DATABASE_ENV` 的职责区别：

| 参数 | 是否必需 | 作用 |
| --- | --- | --- |
| `DATABASE_URL` | 必需 | 指定实际连接哪个 PostgreSQL 数据库 |
| `DATABASE_ENV` | 脚本建议必需 | 告诉脚本当前数据库环境，用于决定是否允许执行、是否必须备份、是否禁止危险操作 |

示例：

```text
本地开发：
DATABASE_URL=postgresql://ecommerce:ecommerce@localhost:5432/ecommerce_dev
DATABASE_ENV=local

云端真实业务库：
DATABASE_URL=postgresql://app_user:***@cloud-host:5432/ecommerce
DATABASE_ENV=cloud
```

为什么保留 `DATABASE_ENV`：

- URL 确实已经能区分连接目标，但脚本不能只靠 URL 推断环境。
- 云端数据库可能使用内网地址、代理地址或临时域名，单靠 host 判断不稳定。
- `DATABASE_ENV` 用来让执行者显式声明“我认为这是 local/dev/cloud”，脚本再据此做保护。

典型保护逻辑：

```text
db:migrate:local：
要求 DATABASE_ENV=local，否则拒绝执行

db:migrate:dev：
要求 DATABASE_ENV=dev，否则拒绝执行

db:migrate:cloud：
要求 DATABASE_ENV=cloud，并且执行前输出目标数据库信息；高风险 migration 必须先备份或带确认参数

db:seed：
默认禁止在 DATABASE_ENV=cloud 时执行，除非显式允许

db:reset：
只允许 DATABASE_ENV=local，禁止 dev/cloud 执行
```

因此，`DATABASE_ENV` 的价值不是“帮程序连接数据库”，而是“防止脚本把危险操作打到错误数据库”。

### 2. 本地 Docker PostgreSQL 方案

本地开发建议使用 Docker 运行 PostgreSQL，方便合作伙伴复用一致的数据库版本、账号、端口和初始化配置。

目标体验：

```text
复制 .env.example 为 .env
-> docker compose up -d postgres
-> npm install
-> npm run db:migrate:local
-> npm run dev
```

建议新增：

```text
docker-compose.yml
.env.example
```

`docker-compose.yml` 建议包含：

```yaml
services:
  postgres:
    image: postgres:16
    container_name: ecommerce-postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: ecommerce
      POSTGRES_PASSWORD: ecommerce
      POSTGRES_DB: ecommerce_dev
    volumes:
      - ecommerce-postgres-data:/var/lib/postgresql/data

volumes:
  ecommerce-postgres-data:
```

`.env.example` 建议包含：

```text
DATABASE_URL=postgresql://ecommerce:ecommerce@localhost:5432/ecommerce_dev
DATABASE_ENV=local
```

合作伙伴本地启动流程：

```text
1. 安装 Docker Desktop
2. 复制 .env.example 为 .env
3. 执行 docker compose up -d postgres
4. 执行 npm install
5. 执行 npm run db:migrate:local
6. 执行 npm run dev
```

边界：

- Docker PostgreSQL 只作为本地开发库。
- Docker PostgreSQL 中的数据可以重建、清空、插入测试数据。
- 云端 PostgreSQL 仍然是真实业务数据来源。
- 云端 `DATABASE_URL` 不写入 Git，也不写入 `.env.example`。
- 合作伙伴需要查看真实业务数据时，单独提供云端连接串和权限。

### 3. 数据库访问层设计

新增统一数据库访问层，建议路径：

```text
backend/menglar-workbench-api/lib/db/
```

建议文件：

```text
backend/menglar-workbench-api/lib/db/client.mjs
backend/menglar-workbench-api/lib/db/migrations.mjs
backend/menglar-workbench-api/lib/db/sqlite-legacy.mjs
backend/menglar-workbench-api/lib/db/postgres.mjs
```

职责：

- `client.mjs`：根据环境变量创建数据库连接。
- `postgres.mjs`：封装 PostgreSQL 连接池和查询方法。
- `sqlite-legacy.mjs`：仅保留历史 SQLite 迁移读取能力。
- `migrations.mjs`：执行 migration、记录 migration 版本。

业务代码要求：

- 不再直接在业务代码中 `import { DatabaseSync } from 'node:sqlite'`。
- 后端 API、采集脚本、测试脚本统一通过数据库访问层执行 SQL。

### 4. 依赖选择

建议优先使用 `pg` 作为 PostgreSQL 驱动。

原因：

- 依赖轻。
- 与原生 SQL migration 结合直接。
- 适合当前已有脚本化项目结构。
- 不强制引入 ORM 抽象。

后续如项目进入更复杂的数据模型阶段，再评估 Prisma、Drizzle 或 Knex。

### 5. Migration 目录设计

新增目录：

```text
db/migrations/
```

命名规则：

```text
YYYYMMDD_NNN_简短英文描述.sql
```

示例：

```text
db/migrations/20260423_001_init_postgres_schema.sql
db/migrations/20260423_002_add_source_job_stats.sql
db/migrations/20260424_001_add_product_content_assets.sql
```

要求：

- migration 必须可重复识别是否已执行。
- 已执行到云端的 migration 禁止修改内容。
- 如需调整，新增下一个 migration。

### 6. Migration 记录表

PostgreSQL 中新增：

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `id` | migration 文件名或唯一 ID |
| `checksum` | migration 内容校验值，用于识别已执行文件是否被篡改 |
| `executed_at` | 执行时间 |

### 7. 核心业务表迁移范围

阶段 2 至少覆盖以下表：

| SQLite 当前表 | PostgreSQL 目标表 | 说明 |
| --- | --- | --- |
| `source_jobs` | `source_jobs` | 采集任务记录 |
| `products_raw` | `products_raw` | 原始采集载荷 |
| `product_business_snapshots` | `product_business_snapshots` | 商品经营快照 |
| `product_content_assets` | `product_content_assets` | 商品内容资产 |

如果当前 SQLite 中仍存在旧表：

| 旧表 | 处理 |
| --- | --- |
| `products_normalized` | 作为历史迁移来源，不再作为新业务表 |

### 8. API 设计影响

本阶段原则上不新增 API。

如果仅替换数据库实现，API 文档不需要新增接口，但需要确认现有接口响应结构不变。

如果替换过程中新增数据库健康检查或环境检查接口，例如：

```text
GET /api/health/db
```

则必须同步维护：

```text
docs/API接口文档.md
```

建议阶段 1 可以先不新增 API，通过脚本完成数据库验证。

### 9. 脚本设计

建议新增脚本目录：

```text
scripts/PostgreSQL数据库替代/
```

目录中必须包含：

```text
README.md
migrate-local.mjs
migrate-dev.mjs
migrate-cloud.mjs
sqlite-to-postgres.mjs
verify-postgres-schema.mjs
```

`README.md` 需要说明：

- 用途。
- 前置环境变量。
- 执行顺序。
- 本地、dev、cloud 的区别。
- 禁止事项。

### 10. package.json 命令建议

新增命令形态：

```json
{
  "db:migrate:local": "node scripts/PostgreSQL数据库替代/migrate-local.mjs",
  "db:migrate:dev": "node scripts/PostgreSQL数据库替代/migrate-dev.mjs",
  "db:migrate:cloud": "node scripts/PostgreSQL数据库替代/migrate-cloud.mjs",
  "db:sqlite-to-postgres": "node scripts/PostgreSQL数据库替代/sqlite-to-postgres.mjs",
  "db:verify:postgres": "node scripts/PostgreSQL数据库替代/verify-postgres-schema.mjs"
}
```

### 11. 分支和发布流程

功能分支：

```text
feature/*
```

合并到：

```text
dev
```

验证通过后：

```text
dev -> main
```

数据库升级顺序：

```text
feature 本地 migration 验证
-> dev migration 验证
-> dev 功能验证
-> main 合并
-> 云端数据库备份
-> 云端执行 migration
-> main 连接云端验证真实数据读取
```

### 12. 数据库文档维护要求

阶段 1 如果只新增 `schema_migrations` 表，需要新增：

```text
docs/db/schema_migrations表文档.md
```

阶段 2 迁移业务表时，需要同步检查并维护：

```text
docs/db/source_jobs表文档.md
docs/db/products_raw表文档.md
docs/db/product_business_snapshots表文档.md
docs/db/product_content_assets表文档.md
docs/db/数据库说明文档.md
```

## 模块四：【📝 联合自动化验收用例 (TDD核心)】

### 第一阶段用例（Node 接口与数据库闭环）

- [ ] 本地 PostgreSQL 连接验证：设置 `DATABASE_URL` 后执行连接脚本，断言可以连接数据库并查询 `SELECT 1`。
- [ ] migration 记录表验证：执行 migration 后，查库确认 `schema_migrations.id` 写入目标 migration 文件名，`checksum` 非空。
- [ ] 重复执行 migration 验证：连续执行两次 migration，第二次不重复建表、不重复插入 `schema_migrations`。
- [ ] migration 篡改保护验证：修改已执行 migration 内容后再次执行，脚本应拒绝继续执行并输出明确错误。
- [ ] Docker 本地库验证：执行 `docker compose up -d postgres` 后，使用 `.env.example` 中的 `DATABASE_URL` 可以连接本地 PostgreSQL。
- [ ] 合作伙伴复用验证：在干净环境中按 README 执行 Docker 启动、依赖安装、local migration，最终本地库具备完整 schema。
- [ ] 本地命令隔离验证：`db:migrate:local` 只能在 `DATABASE_ENV=local` 时执行，避免误连 cloud。
- [ ] dev 命令隔离验证：`db:migrate:dev` 执行前输出目标数据库 host/dbname，并要求脚本层校验 `DATABASE_ENV=dev`。
- [ ] cloud 命令保护验证：`db:migrate:cloud` 执行前必须输出目标数据库信息，并在 `DATABASE_ENV` 不是 `cloud` 时拒绝执行；高风险 migration 在无备份标记或确认参数时拒绝执行。
- [ ] seed/reset 保护验证：`db:reset` 只允许 `DATABASE_ENV=local`，`db:seed` 默认禁止在 `DATABASE_ENV=cloud` 执行。
- [ ] 数据库字段级验证：表名 `schema_migrations`，字段 `id` 等于已执行 migration 文件名，字段 `checksum` 为 migration 内容摘要，字段 `executed_at` 不为空。

### 第二阶段用例（Node 接口与数据库闭环）

- [ ] 初始 schema 验证：执行 PostgreSQL 初始化 migration 后，查库确认 `source_jobs`、`products_raw`、`product_business_snapshots`、`product_content_assets` 均存在。
- [ ] `source_jobs` 字段级验证：插入采集任务后，查库确认 `source_jobs.id` 为主键，`job_status` 为预期状态，`request_count`、`success_count`、`record_count` 为预期数值。
- [ ] `products_raw` 字段级验证：写入原始采集载荷后，查库确认 `products_raw.job_id` 关联 `source_jobs.id`，原始 JSON 字段保留完整内容。
- [ ] `product_business_snapshots` 字段级验证：写入商品经营快照后，查库确认 `job_id`、`platform`、`platform_product_id`、`sales_amount`、`parse_status` 与输入一致。
- [ ] `product_content_assets` 字段级验证：写入商品内容资产后，查库确认 `platform`、`platform_product_id`、`content_hash`、`content_status` 与输入一致。
- [ ] SQLite 到 PostgreSQL 数据迁移验证：执行迁移脚本后，对比 SQLite 源表和 PostgreSQL 目标表记录数，关键主键/关联键不丢失。
- [ ] 脏数据拦截验证：构造缺失 `platform_product_id` 的商品快照写入请求，断言写入失败，并查库确认目标表没有新增脏记录。
- [ ] 采集脚本闭环验证：运行一次最小采集任务，断言 PostgreSQL 中 `source_jobs` 新增记录，且任务状态从 `running` 更新为最终状态。

### 第二阶段用例（E2E 端到端浏览器闭环）

- [ ] 启动后端连接本地 PostgreSQL，打开工作台页面，确认采集任务列表可以正常加载。
- [ ] 打开结果展示页，确认来自 PostgreSQL 的商品经营快照正常展示。
- [ ] 打开商品筛选或商品数据整理页面，确认候选商品数据可读，页面无接口 500。
- [ ] 执行一次页面主链路操作后，查库确认对应业务表写入或更新发生在 PostgreSQL，而不是 SQLite。

### UI 截图回归要求

本方案本身不改变页面结构，不强制触发 UI 截图回归。

如果阶段 2 实施过程中出现以下变化，则需要按对应功能补充截图：

- 页面空态变化。
- 加载态变化。
- 结果态字段展示变化。
- 表格结构变化。
- 主交互表单变化。

截图目录按实际功能放置：

```text
docs/测试文档/[功能名称]/UI/
```

## 阶段拆分与交付边界

### 阶段 1：PostgreSQL 基础设施

目标：

- 项目可以连接 PostgreSQL。
- 项目可以执行 SQL migration。
- 项目可以记录 migration 执行状态。
- 本地/dev/cloud 命令语义明确。

交付物：

- PostgreSQL 连接层。
- Docker 本地 PostgreSQL 配置。
- `.env.example`。
- migration runner。
- `schema_migrations` 表。
- migration 命令。
- 脚本 README。
- `schema_migrations` 表文档。
- 阶段 1 测试文档。

阶段 1 不要求：

- 所有业务 API 立即切 PostgreSQL。
- 云端真实业务数据立即迁移。
- 前端页面改造。

### 阶段 2：业务数据读写切换

目标：

- 核心业务表迁移到 PostgreSQL。
- 采集脚本和后端 API 通过 PostgreSQL 读写。
- SQLite 只作为历史迁移来源或本地临时备份。
- dev 验证通过后，可以对云端 PostgreSQL 增量升级。

交付物：

- PostgreSQL 初始 schema migration。
- SQLite 到 PostgreSQL 数据迁移脚本。
- 后端 API 数据访问替换。
- 采集脚本数据访问替换。
- 数据库表文档更新。
- 正式测试用例文档。
- 技术自测报告。

阶段 2 不要求：

- 完整云端服务部署。
- CI/CD 自动发布。
- 队列化采集。

## 风险与约束

- PostgreSQL 和 SQLite 的 SQL 语法、字段类型、时间函数、JSON 支持存在差异，不能只替换连接串。
- 已经执行到云端的 migration 禁止修改，只能追加新 migration。
- 云端真实数据迁移前必须备份。
- `main` 连接云端真实数据前，必须确认云端 migration 已执行。
- 所有真实连接串、账号、Token、Cookie 禁止提交 Git。
- 阶段 2 实施前，应先确认 PostgreSQL 云端供应商、连接方式和备份策略。
- `DATABASE_ENV` 不代表连接目标，连接目标永远以 `DATABASE_URL` 为准；`DATABASE_ENV` 只用于脚本保护。
- Docker PostgreSQL 只作为本地开发和合作伙伴复现环境，不作为真实业务数据源。
