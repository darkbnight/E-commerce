function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export function getDescriptionCategoryRoots(payload) {
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.result?.items)) return payload.result.items;
  if (Array.isArray(payload?.result?.children)) return payload.result.children;
  return [];
}

export function getDescriptionCategoryNodeName(node) {
  return (
    node?.type_name ||
    node?.category_name ||
    node?.title ||
    node?.description_category_name ||
    node?.name ||
    ''
  );
}

export function getDescriptionCategoryNodeChildren(node) {
  return ensureArray(node?.children);
}

export function getDescriptionCategoryNodeDescriptionId(node) {
  return node?.description_category_id ?? node?.category_id ?? node?.id;
}

export function isDescriptionCategoryTypeNode(node) {
  return node?.type_id != null;
}

export function buildDescriptionCategoryLevels(payload, selectedIndexes = []) {
  const levels = [];
  let nodes = getDescriptionCategoryRoots(payload);

  for (let levelIndex = 0; nodes.length > 0; levelIndex += 1) {
    const selectedIndex = selectedIndexes[levelIndex] ?? '';
    levels.push({
      levelIndex,
      nodes,
      selectedIndex,
    });

    if (selectedIndex === '') break;

    const selectedNode = nodes[Number(selectedIndex)];
    if (!selectedNode) break;

    nodes = getDescriptionCategoryNodeChildren(selectedNode);
  }

  return levels;
}

export function getDescriptionCategorySelection(payload, selectedIndexes = []) {
  let nodes = getDescriptionCategoryRoots(payload);
  let descriptionCategoryId = null;
  let typeId = null;
  let typeName = '';
  const path = [];
  const nodesPath = [];

  for (const selectedIndex of selectedIndexes) {
    if (selectedIndex === '') break;

    const selectedNode = nodes[Number(selectedIndex)];
    if (!selectedNode) break;

    nodesPath.push(selectedNode);

    const nodeName = getDescriptionCategoryNodeName(selectedNode);
    if (nodeName) path.push(nodeName);

    const nodeDescriptionCategoryId = getDescriptionCategoryNodeDescriptionId(selectedNode);
    if (nodeDescriptionCategoryId != null) {
      descriptionCategoryId = nodeDescriptionCategoryId;
    }

    if (selectedNode.type_id != null) {
      typeId = selectedNode.type_id;
      typeName = selectedNode.type_name || nodeName;
    }

    nodes = getDescriptionCategoryNodeChildren(selectedNode);
  }

  return {
    descriptionCategoryId,
    typeId,
    typeName,
    path,
    nodesPath,
    isComplete: descriptionCategoryId != null && typeId != null,
  };
}

export function findDescriptionCategoryNode(
  nodes,
  descriptionCategoryId,
  typeId,
  path = [],
  inheritedDescriptionCategoryId = null
) {
  let fallbackMatch = null;

  for (const node of ensureArray(nodes)) {
    const nodeName = getDescriptionCategoryNodeName(node);
    const nextPath = nodeName ? [...path, nodeName] : path;
    const nodeDescriptionId = getDescriptionCategoryNodeDescriptionId(node);
    const currentDescriptionCategoryId = nodeDescriptionId ?? inheritedDescriptionCategoryId;
    const descriptionMatches = Number(currentDescriptionCategoryId) === Number(descriptionCategoryId);
    const typeMatches = Number(node?.type_id) === Number(typeId);

    if (descriptionMatches && typeMatches) {
      return { node, path: nextPath, exact: true };
    }

    if (descriptionMatches && !fallbackMatch) {
      fallbackMatch = { node, path: nextPath, exact: false };
    }

    const childMatch = findDescriptionCategoryNode(
      getDescriptionCategoryNodeChildren(node),
      descriptionCategoryId,
      typeId,
      nextPath,
      currentDescriptionCategoryId
    );

    if (childMatch?.exact) return childMatch;
    if (childMatch && !fallbackMatch) fallbackMatch = childMatch;
  }

  return fallbackMatch;
}
