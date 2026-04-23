import {
  buildDescriptionCategoryLevels,
  getDescriptionCategoryNodeName,
  getDescriptionCategorySelection,
  isDescriptionCategoryTypeNode,
} from '../data/descriptionCategoryTree';

function getLevelLabel(levelIndex, nodes) {
  const hasTypeNodes = nodes.some((node) => isDescriptionCategoryTypeNode(node));
  if (levelIndex === 0) return '一级描述类目';
  return hasTypeNodes ? '商品类型 type_id' : `${levelIndex + 1} 级描述类目`;
}

export function ProductPrepDescriptionCategorySelect({
  treePayload,
  selectedIndexes,
  onSelectedIndexesChange,
  disabled = false,
}) {
  const levels = buildDescriptionCategoryLevels(treePayload, selectedIndexes);
  const selection = getDescriptionCategorySelection(treePayload, selectedIndexes);

  if (!levels.length) {
    return (
      <div className="product-prep-category-empty">
        暂无可选择的描述类目树数据
      </div>
    );
  }

  function updateLevel(levelIndex, value) {
    const nextIndexes = selectedIndexes.slice(0, levelIndex);
    if (value !== '') nextIndexes[levelIndex] = value;
    onSelectedIndexesChange(nextIndexes);
  }

  return (
    <div className="product-prep-category-selector">
      <div className="product-prep-category-select-grid">
        {levels.map((level) => (
          <label className="product-prep-category-select" key={level.levelIndex}>
            <span>{getLevelLabel(level.levelIndex, level.nodes)}</span>
            <select
              value={level.selectedIndex}
              disabled={disabled}
              onChange={(event) => updateLevel(level.levelIndex, event.target.value)}
            >
              <option value="">请选择</option>
              {level.nodes.map((node, index) => {
                const name = getDescriptionCategoryNodeName(node) || `未命名节点 ${index + 1}`;
                const id = node.type_id ?? node.description_category_id ?? '';
                const suffix = node.type_id ? `type_id: ${node.type_id}` : `description_category_id: ${id}`;
                return (
                  <option value={String(index)} disabled={Boolean(node.disabled)} key={`${id}-${index}`}>
                    {name} ({suffix})
                  </option>
                );
              })}
            </select>
          </label>
        ))}
      </div>

      <div className={`product-prep-category-selection ${selection.isComplete ? 'is-complete' : ''}`}>
        <strong>{selection.isComplete ? '已选定可发布类型' : '继续选择到 type_id'}</strong>
        <span>
          {selection.path.length ? selection.path.join(' > ') : '尚未选择描述类目'}
        </span>
      </div>
    </div>
  );
}
