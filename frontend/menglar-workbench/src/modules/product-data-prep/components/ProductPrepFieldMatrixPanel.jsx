import { Panel } from '../../../components/Panel';

const statusLabels = {
  existing: '上游可继承',
  derived: '可规则生成',
  manual: '需人工整理',
  missing: '当前缺口',
};

export function ProductPrepFieldMatrixPanel({ groups }) {
  return (
    <Panel
      title="下游字段矩阵"
      subtitle="以 Ozon 建品、价格、库存链路为目标，把草稿字段先定下来，避免后续反复改表和改接口。"
    >
      <div className="product-prep-field-sections">
        {groups.map((group) => (
          <section className="product-prep-field-section" key={group.title}>
            <div className="product-prep-field-section-head">
              <strong>{group.title}</strong>
              <p>{group.description}</p>
            </div>
            <div className="product-prep-field-list">
              {group.items.map((item) => (
                <article className="product-prep-field-row" key={item.key}>
                  <div className="product-prep-field-main">
                    <div className="product-prep-field-title-row">
                      <strong>{item.label}</strong>
                      <code>{item.key}</code>
                    </div>
                    <p>{item.note}</p>
                  </div>
                  <div className="product-prep-field-meta">
                    <span className={`product-prep-state-pill is-${item.status}`}>
                      {statusLabels[item.status]}
                    </span>
                    <small>{item.required}</small>
                    <small>{item.source}</small>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Panel>
  );
}
