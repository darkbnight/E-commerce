# 工作流

## 1. 适用场景

在以下情况使用本技能：
- 用户给出一个或多个商品 ID，要求采集萌啦商品内容资产
- 用户要求验证 `content-assets.mjs` 是否真的稳定返回数据
- 用户要求追查“页面里能看到商品，但脚本没有拿到标题/描述/SKU 图片”这类问题
- 用户要求把采集结果与数据库记录做闭环核对

## 2. 执行顺序

### 步骤 A：确认是否需要重采

优先查看：
- `.cache/menglar-capture/content-assets-last.json`
- `.cache/menglar-capture/login-health-last.json`
- 最近一次用户提供的截图或商品 ID

如果用户明确要求“当前重新采集”或“最新结果”，必须重跑脚本，不要直接复述旧缓存。

### 步骤 B：做前置检查

命令：

```bash
node scripts/menglar-capture/login-health.mjs --target hot_products --refresh --json
```

预期：
- `ok=true`
- 页面可访问采集箱或相关工作台
- 存在授权请求，且无 401/403

### 步骤 C：采集指定商品

命令：

```bash
node scripts/menglar-capture/content-assets.mjs --product-id <商品ID> --json
```

标准链路：
1. 打开萌啦采集箱页面
2. 通过 `productLibrary/pageQuery` 精确查询商品
3. 用命中的 `libraryId` 请求 `improveEditing/{libraryId}`
4. 标准化字段
5. 写入 SQLite
6. 更新 `source_jobs`

### 步骤 D：查库自证

至少核验三张表：
- `source_jobs`
- `product_content_assets`
- `product_content_skus`

最低核验字段：
- `source_jobs.id`, `page_type`, `job_status`, `record_count`
- `product_content_assets.id`, `source_job_id`, `platform_product_id`, `title`, `content_hash`, `captured_at`
- `product_content_skus.content_asset_id`, `platform_product_id`, `platform_sku_id`, `images_json`

## 3. 常见故障定位

### 商品未命中

优先判断：
- 商品是否真的在当前账号采集箱中
- `pageQuery` 是否按 `sourceDataId` 命中
- 用户给的是商品 ID 还是 SKU/货号

### 详情接口失败

优先判断：
- `libraryId` 是否正确
- 授权头是否从真实请求中获取到
- 登录态是否页面可见但接口不可用

### 采到数据但字段缺失

优先判断：
- 上游 `improveEditing` 返回里是否本来就没有该字段
- 标准化映射是否只取了固定属性 ID
- 标题是否被上游直接返回成商品 ID，而不是脚本丢字段

### 落库异常

优先判断：
- 任务是否已写入 `source_jobs`
- `content_hash` 去重是否挡住了重复写入
- `product_content_skus` 是否因唯一键冲突被忽略

## 4. 推荐输出模板

建议按下面结构汇报：

1. 当前结果：成功 / 失败
2. 采集证据：商品 ID、`libraryId`、接口命中情况
3. 内容摘要：标题、描述长度、标签数、图片数、SKU 数
4. 数据库验证：三张表的主键和关键字段摘要
5. 问题与下一步：如需补字段或修脚本，明确指出层级
