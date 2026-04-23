function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumberOrNull(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeAttribute(attribute) {
  const id = toNumberOrNull(attribute?.id ?? attribute?.attribute_id);
  const complexId = toNumberOrNull(attribute?.attribute_complex_id ?? attribute?.complex_id) ?? 0;
  const dictionaryId = toNumberOrNull(attribute?.dictionary_id);

  return {
    id,
    complexId,
    name: attribute?.name || `Attribute ${id || ''}`.trim(),
    description: attribute?.description || '',
    type: attribute?.type || '',
    isRequired: toBoolean(attribute?.is_required ?? attribute?.isRequired),
    isCollection: toBoolean(attribute?.is_collection ?? attribute?.isCollection),
    isAspect: toBoolean(attribute?.is_aspect ?? attribute?.isAspect),
    maxValueCount: toNumberOrNull(attribute?.max_value_count ?? attribute?.maxValueCount),
    groupName: attribute?.group_name || attribute?.groupName || '',
    groupId: toNumberOrNull(attribute?.group_id ?? attribute?.groupId),
    dictionaryId,
    categoryDependent: toBoolean(attribute?.category_dependent ?? attribute?.categoryDependent),
  };
}

export function getDescriptionCategoryAttributes(payload) {
  const result = payload?.result;
  if (Array.isArray(result?.attributes)) {
    return result.attributes.map(normalizeAttribute).filter((attribute) => attribute.id);
  }

  if (!Array.isArray(result)) return [];

  const wrappedAttributes = result.flatMap((item) => ensureArray(item?.attributes));
  const sourceAttributes = wrappedAttributes.length ? wrappedAttributes : result;
  return sourceAttributes.map(normalizeAttribute).filter((attribute) => attribute.id);
}

export function getDescriptionCategoryAttributeValues(payload) {
  const result = payload?.result;
  const values = Array.isArray(result) ? result : ensureArray(result?.values);

  return values.map((value) => ({
    dictionaryValueId: toNumberOrNull(value?.id ?? value?.dictionary_value_id ?? value?.dictionaryValueId),
    value: value?.value || value?.name || '',
    info: value?.info || '',
    picture: value?.picture || '',
  })).filter((value) => value.dictionaryValueId || value.value);
}

export function getAttributeKey(attribute) {
  const id = attribute?.id ?? attribute?.attributeId;
  const complexId = attribute?.complexId ?? attribute?.complex_id ?? 0;
  return `${complexId}:${id}`;
}

export function normalizeDraftAttribute(attribute) {
  const id = toNumberOrNull(attribute?.attributeId ?? attribute?.id);
  const complexId = toNumberOrNull(attribute?.complexId ?? attribute?.complex_id) ?? 0;
  return {
    attributeId: id,
    id,
    complexId,
    name: attribute?.name || `Attribute ${id || ''}`.trim(),
    isRequired: Boolean(attribute?.isRequired),
    dictionaryId: toNumberOrNull(attribute?.dictionaryId ?? attribute?.dictionary_id),
    values: ensureArray(attribute?.values).map((value) => {
      if (value && typeof value === 'object') {
        return {
          value: value.value == null ? '' : String(value.value),
          dictionaryValueId: toNumberOrNull(value.dictionaryValueId ?? value.dictionary_value_id),
        };
      }
      return { value: value == null ? '' : String(value) };
    }),
  };
}

export function findDraftAttribute(draftAttributes, attribute) {
  const targetKey = getAttributeKey(attribute);
  return ensureArray(draftAttributes)
    .map(normalizeDraftAttribute)
    .find((item) => getAttributeKey(item) === targetKey);
}

function normalizeFormValues(formEntry) {
  return ensureArray(formEntry?.values)
    .map((value) => ({
      value: value?.value == null ? '' : String(value.value).trim(),
      dictionaryValueId: toNumberOrNull(value?.dictionaryValueId),
    }))
    .filter((value) => value.value || value.dictionaryValueId);
}

export function buildDraftAttributesFromRequirements({
  attributes,
  draftAttributes,
  formValues,
}) {
  if (!attributes.length) return ensureArray(draftAttributes);

  const normalizedDraftAttributes = ensureArray(draftAttributes).map(normalizeDraftAttribute);
  const outputByKey = new Map();

  normalizedDraftAttributes.forEach((attribute) => {
    outputByKey.set(getAttributeKey(attribute), attribute);
  });

  attributes.filter((attribute) => attribute.isRequired).forEach((attribute) => {
    const key = getAttributeKey(attribute);
    const formEntry = formValues[key];
    const values = normalizeFormValues(formEntry);
    const existing = outputByKey.get(key);

    outputByKey.set(key, {
      attributeId: attribute.id,
      id: attribute.id,
      complexId: attribute.complexId,
      name: attribute.name,
      isRequired: attribute.isRequired,
      dictionaryId: attribute.dictionaryId,
      values: values.length ? values : ensureArray(existing?.values),
    });
  });

  return [...outputByKey.values()].map((attribute) => ({
    attributeId: attribute.attributeId ?? attribute.id,
    name: attribute.name,
    isRequired: Boolean(attribute.isRequired),
    dictionaryId: attribute.dictionaryId ?? null,
    complexId: attribute.complexId ?? 0,
    values: ensureArray(attribute.values),
  }));
}
