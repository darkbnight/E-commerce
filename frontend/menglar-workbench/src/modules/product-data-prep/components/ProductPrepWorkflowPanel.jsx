import { Panel } from '../../../components/Panel';

export function ProductPrepWorkflowPanel({ steps }) {
  return (
    <Panel
      title="建议工作流"
      subtitle="按阶段拆分文件和职责，让候选导入、草稿编辑、校验、导出可以并行推进。"
    >
      <div className="product-prep-steps">
        {steps.map((step, index) => (
          <article className="product-prep-step" key={step.title}>
            <span>{index + 1}</span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.description}</p>
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}
