const workflowSteps = [
  {
    title: '导入筛选商品',
    description: '承接商品筛选页输出的候选商品，保留来源批次、商品 ID 和人工筛选状态。',
  },
  {
    title: '整理发布字段',
    description: '处理标题、描述、类目属性、规格参数、图片和物流发布所需字段。',
  },
  {
    title: '发布前校验',
    description: '按目标平台规则校验必填项、枚举值、图片数量、尺寸重量和价格库存。',
  },
  {
    title: '生成上货草稿',
    description: '输出给 Ozon 上货工具可读取的草稿数据，避免直接改动真实发布链路。',
  },
];

const safetyRules = [
  '前端先只做新路由和本地页面骨架，不改结果页表格、不改 Ozon 上货工具主流程。',
  '后端新增接口统一放在 /api/product-data-prep 命名空间，不复用 /api/products 写入语义。',
  '数据库先新增草稿表，严禁直接覆盖 products_normalized 原始筛选结果。',
  '前后端通过 JSON Schema 或 TypeScript 类型约定草稿字段，接口未稳定前使用 mock 数据联调。',
  '图片处理、属性映射、标题生成拆成独立任务，避免多人同时修改同一个大组件或大接口。',
];

export function ProductDataPrepPage() {
  return (
    <div className="wb-page product-prep-page">
      <section className="wb-page-hero split">
        <div>
          <p className="wb-kicker">Product Data Prep</p>
          <h2>商品数据整理</h2>
          <p>
            承接筛选后的候选商品，集中整理标题、描述、属性、图片和上货字段，
            让商品在进入 Ozon 上货工具前先形成可校验、可回滚的发布草稿。
          </p>
        </div>
        <div className="wb-hero-card">
          <span className="wb-pill">开发交接页</span>
          <strong>筛选商品到发布草稿</strong>
          <small className="cell-sub">本页先固定入口和职责边界，具体处理能力由后续开发接入。</small>
        </div>
      </section>

      <section className="product-prep-grid">
        <div className="wb-panel">
          <div className="wb-panel-head">
            <div>
              <h2>建议工作流</h2>
              <p>按阶段拆分，减少前端、后端、脚本和上货工具之间的互相覆盖。</p>
            </div>
          </div>
          <div className="product-prep-steps">
            {workflowSteps.map((step, index) => (
              <article className="product-prep-step" key={step.title}>
                <span>{index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="wb-panel">
          <div className="wb-panel-head">
            <div>
              <h2>安全开发边界</h2>
              <p>先把冲突面压到最小，再让多人并行开发具体能力。</p>
            </div>
          </div>
          <ul className="wb-notes product-prep-notes">
            {safetyRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
