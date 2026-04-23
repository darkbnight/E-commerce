import { ProductPrepFieldBoard } from './components/ProductPrepFieldBoard';
import { ProductPrepBoundaryPanel } from './components/ProductPrepBoundaryPanel';
import { ProductPrepWorkflowPanel } from './components/ProductPrepWorkflowPanel';
import {
  productPrepSafetyRules,
  productPrepWorkflowSteps,
} from './data/productDataPrepPlan';
import { buildProductPrepFieldViewModel } from './data/productDataPrepFieldViews';
import { productPrepMockCandidates, productPrepMockDrafts } from './mock/productDataPrepMock';

export function ProductDataPrepWorkbench() {
  const activeCandidate = productPrepMockCandidates[0];
  const activeDraft = productPrepMockDrafts[0];
  const { upstreamGroups, downstreamGroups } = buildProductPrepFieldViewModel({
    candidate: activeCandidate,
    draft: activeDraft,
  });
  const readyDraftCount = productPrepMockDrafts.filter((draft) => draft.draftStatus === 'ready').length;

  return (
    <div className="wb-page product-prep-page">
      <section className="wb-page-hero split">
        <div>
          <p className="wb-kicker">Product Data Prep Module</p>
          <h2>商品数据整理</h2>
          <p>
            页面主体现在先聚焦“字段工作台”：左侧展示上游已拿到的数据，右侧展示整理后准备输送到下游的数据。
            字段数据先用演示样例承载，后面我们可以再逐项把真实生成逻辑补进去。
          </p>
        </div>
        <div className="wb-hero-card wb-hero-card-stack">
          <span className="wb-pill">独立模块</span>
          <strong>{productPrepMockCandidates.length} 个候选样例</strong>
          <small className="cell-sub">
            当前演示候选 #{activeCandidate.id}，{productPrepMockDrafts.length} 个草稿样例里有 {readyDraftCount} 个 ready
          </small>
        </div>
      </section>

      <section className="product-prep-dashboard-grid">
        <ProductPrepFieldBoard
          title="上游已拿到的字段"
          subtitle="先把当前能稳定继承的数据清晰摊开，后续做候选导入、字段映射和自动填充时会更顺。"
          tone="upstream"
          groups={upstreamGroups}
        />
        <ProductPrepFieldBoard
          title="下游准备输出的字段"
          subtitle="先把要发往 Ozon 的目标字段展示出来，之后再逐个补生成逻辑、校验和导出。"
          tone="downstream"
          groups={downstreamGroups}
        />
      </section>

      <section className="product-prep-grid">
        <ProductPrepWorkflowPanel steps={productPrepWorkflowSteps} />
        <ProductPrepBoundaryPanel rules={productPrepSafetyRules} />
      </section>
    </div>
  );
}
