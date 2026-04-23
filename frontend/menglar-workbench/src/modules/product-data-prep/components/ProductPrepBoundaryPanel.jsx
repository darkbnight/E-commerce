import { Panel } from '../../../components/Panel';

export function ProductPrepBoundaryPanel({ rules }) {
  return (
    <Panel
      title="安全开发边界"
      subtitle="先把冲突面压到最小，后续再分别接入真实候选池、草稿表和 Ozon 导出。"
    >
      <ul className="wb-notes product-prep-notes">
        {rules.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
    </Panel>
  );
}
