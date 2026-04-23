import { ProductPrepBoundaryPanel } from './components/ProductPrepBoundaryPanel';
import { ProductPrepFieldMatrixPanel } from './components/ProductPrepFieldMatrixPanel';
import { ProductPrepReadinessPanel } from './components/ProductPrepReadinessPanel';
import { ProductPrepWorkflowPanel } from './components/ProductPrepWorkflowPanel';
import {
  productPrepFieldGroups,
  productPrepReadinessChecklist,
  productPrepSafetyRules,
  productPrepUpstreamGapSections,
  productPrepWorkflowSteps,
} from './data/productDataPrepPlan';
import { productPrepMockCandidates, productPrepMockDrafts } from './mock/productDataPrepMock';

export function ProductDataPrepWorkbench() {
  const readyDraftCount = productPrepMockDrafts.filter((draft) => draft.draftStatus === 'ready').length;

  return (
    <div className="wb-page product-prep-page">
      <section className="wb-page-hero split">
        <div>
          <p className="wb-kicker">Product Data Prep Module</p>
          <h2>商品数据整理</h2>
          <p>
            这里不再只放交接说明，而是作为独立模块骨架开始收敛候选商品、发布草稿、字段契约和校验入口。
            下一步可以直接在这个目录里补真实列表、编辑器、校验和导出能力。
          </p>
        </div>
        <div className="wb-hero-card wb-hero-card-stack">
          <span className="wb-pill">独立模块</span>
          <strong>{productPrepMockCandidates.length} 个候选样例</strong>
          <small className="cell-sub">
            {productPrepMockDrafts.length} 个草稿样例，{readyDraftCount} 个达到 ready 状态
          </small>
        </div>
      </section>

      <section className="product-prep-grid">
        <ProductPrepWorkflowPanel steps={productPrepWorkflowSteps} />
        <ProductPrepBoundaryPanel rules={productPrepSafetyRules} />
      </section>

      <section className="product-prep-section-grid">
        <ProductPrepFieldMatrixPanel groups={productPrepFieldGroups} />
        <ProductPrepReadinessPanel
          candidates={productPrepMockCandidates}
          drafts={productPrepMockDrafts}
          checklist={productPrepReadinessChecklist}
          upstreamGapSections={productPrepUpstreamGapSections}
        />
      </section>
    </div>
  );
}
