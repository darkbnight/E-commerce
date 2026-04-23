import { Panel } from '../../../components/Panel';
import { formatNumber } from '../../../lib/format';

export function ProductPrepReadinessPanel({ candidates, drafts, checklist, upstreamGapSections }) {
  const manualFieldCount = upstreamGapSections.reduce((count, section) => count + section.items.length, 0);

  return (
    <div className="product-prep-side-stack">
      <Panel
        title="启动清单"
        subtitle="这几个条件先到位，下一步就可以直接往真实能力推进。"
      >
        <div className="product-prep-readiness-grid">
          <article className="product-prep-mini-stat">
            <span>候选样例</span>
            <strong>{formatNumber(candidates.length)}</strong>
          </article>
          <article className="product-prep-mini-stat">
            <span>草稿样例</span>
            <strong>{formatNumber(drafts.length)}</strong>
          </article>
          <article className="product-prep-mini-stat">
            <span>待补上游字段</span>
            <strong>{formatNumber(manualFieldCount)}</strong>
          </article>
        </div>

        <ul className="product-prep-checklist">
          {checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="上游缺口判断"
        subtitle="当前商品经营快照更像候选研究源，还不够直接变成可发布草稿。"
      >
        <div className="product-prep-gap-sections">
          {upstreamGapSections.map((section) => (
            <section className="product-prep-gap-card" key={section.title}>
              <strong>{section.title}</strong>
              <p>{section.description}</p>
              <ul className="wb-notes">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Panel>
    </div>
  );
}
