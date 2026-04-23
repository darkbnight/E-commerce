import { Panel } from '../../../components/Panel';

function FieldValue({ value, isPending }) {
  if (Array.isArray(value)) {
    return (
      <div className="product-prep-display-value-list">
        {value.map((item) => (
          <span className={`product-prep-display-token ${isPending ? 'is-pending' : ''}`} key={item}>
            {item}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className={`product-prep-display-value ${isPending ? 'is-pending' : ''}`}>
      {value}
    </div>
  );
}

export function ProductPrepFieldBoard({ title, subtitle, tone, groups }) {
  return (
    <Panel
      title={title}
      subtitle={subtitle}
      actions={<span className={`product-prep-board-badge is-${tone}`}>{groups.length} 组字段</span>}
    >
      <div className="product-prep-display-groups">
        {groups.map((group) => (
          <section className="product-prep-display-group" key={group.title}>
            <div className="product-prep-display-group-head">
              <strong>{group.title}</strong>
              <p>{group.description}</p>
            </div>

            <div className={`product-prep-display-table is-${tone}`}>
              <div className="product-prep-display-table-head">
                <span>字段名</span>
                <span>说明</span>
                <span>数据</span>
              </div>

              <div className="product-prep-display-table-body">
                {group.items.map((item) => (
                  <article
                    className={`product-prep-display-row is-${tone} ${item.control ? 'has-control' : ''}`}
                    key={item.key}
                  >
                    <div className="product-prep-display-col is-name">
                      <strong>{item.label}</strong>
                      <code>{item.key}</code>
                    </div>

                    <div className="product-prep-display-col is-description">
                      {item.description}
                    </div>

                    <div className="product-prep-display-col is-data">
                      {item.control ? (
                        <div className="product-prep-display-control">
                          {item.control}
                        </div>
                      ) : null}
                      <FieldValue value={item.value} isPending={Boolean(item.isPending)} />
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </Panel>
  );
}
