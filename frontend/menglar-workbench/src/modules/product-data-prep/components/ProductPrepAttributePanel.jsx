import {
  findDraftAttribute,
  getAttributeKey,
} from '../data/descriptionCategoryAttributes';

function formatValue(value) {
  if (!value) return '待填写';
  const text = value.value || '';
  const dictionaryId = value.dictionaryValueId ? `#${value.dictionaryValueId}` : '';
  return [text, dictionaryId].filter(Boolean).join(' ');
}

function getCurrentValues({ attribute, draftAttributes, formValues }) {
  const formEntry = formValues[getAttributeKey(attribute)];
  if (Array.isArray(formEntry?.values) && formEntry.values.length) {
    return formEntry.values;
  }
  return findDraftAttribute(draftAttributes, attribute)?.values || [];
}

function getAttributeTypeLabel(attribute) {
  if (attribute.dictionaryId) return `字典值 dictionary_id: ${attribute.dictionaryId}`;
  return attribute.type ? `自由填写 value，类型: ${attribute.type}` : '自由填写 value';
}

function AttributeValueEditor({
  attribute,
  dictionaryValues,
  draftAttributes,
  formValues,
  onFormValueChange,
}) {
  const attributeKey = getAttributeKey(attribute);
  const currentValues = getCurrentValues({ attribute, draftAttributes, formValues });
  const currentDictionaryIds = currentValues
    .map((value) => value.dictionaryValueId)
    .filter(Boolean)
    .map(String);
  const currentText = currentValues.map((value) => value.value).filter(Boolean).join('\n');
  const canHaveMultiple = attribute.isCollection ||
    attribute.maxValueCount == null ||
    attribute.maxValueCount === 0 ||
    attribute.maxValueCount > 1;

  if (attribute.dictionaryId) {
    const selectValue = canHaveMultiple ? currentDictionaryIds : (currentDictionaryIds[0] || '');
    return (
      <label className="product-prep-attribute-fill">
        <span>填写值</span>
        <select
          multiple={canHaveMultiple}
          size={canHaveMultiple ? Math.min(Math.max(dictionaryValues.length, 3), 6) : undefined}
          value={selectValue}
          onChange={(event) => {
            const selectedOptions = Array.from(event.target.selectedOptions);
            const nextValues = selectedOptions.map((option) => ({
              dictionaryValueId: Number(option.value),
              value: option.dataset.label || option.textContent || '',
            }));
            onFormValueChange(attributeKey, { values: nextValues });
          }}
        >
          {!canHaveMultiple ? <option value="">请选择字典值</option> : null}
          {dictionaryValues.map((value) => (
            <option
              value={String(value.dictionaryValueId)}
              data-label={value.value}
              key={value.dictionaryValueId || value.value}
            >
              {value.value || `#${value.dictionaryValueId}`} ({value.dictionaryValueId})
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (canHaveMultiple) {
    return (
      <label className="product-prep-attribute-fill">
        <span>填写值</span>
        <textarea
          rows={3}
          value={currentText}
          placeholder="每行一个 value"
          onChange={(event) => {
            const values = event.target.value
              .split('\n')
              .map((value) => value.trim())
              .filter(Boolean)
              .map((value) => ({ value }));
            onFormValueChange(attributeKey, { values });
          }}
        />
      </label>
    );
  }

  return (
    <label className="product-prep-attribute-fill">
      <span>填写值</span>
      <input
        value={currentText}
        placeholder="请输入 value"
        onChange={(event) => onFormValueChange(attributeKey, {
          values: event.target.value.trim() ? [{ value: event.target.value.trim() }] : [],
        })}
      />
    </label>
  );
}

function AttributeCard({
  attribute,
  dictionaryValues,
  valueQuery,
  draftAttributes,
  formValues,
  onFormValueChange,
}) {
  const currentValues = getCurrentValues({ attribute, draftAttributes, formValues });
  const isFilled = currentValues.some((value) => value?.value || value?.dictionaryValueId);

  return (
    <article className={`product-prep-attribute-card ${attribute.isRequired ? 'is-required' : ''}`}>
      <div className="product-prep-attribute-card-head">
        <div>
          <strong>{attribute.name}</strong>
          <span>{attribute.description || 'Ozon 未返回填写说明'}</span>
        </div>
        <em className={attribute.isRequired ? 'is-required' : ''}>
          {attribute.isRequired ? '必填' : '可选'}
        </em>
      </div>

      <div className="product-prep-attribute-meta">
        <code>id: {attribute.id}</code>
        <code>complex_id: {attribute.complexId}</code>
        {attribute.groupName ? <code>group: {attribute.groupName}</code> : null}
        <code>{getAttributeTypeLabel(attribute)}</code>
        <code>{attribute.isCollection ? '支持多值' : '单值'}</code>
        <code>max: {attribute.maxValueCount || '不限'}</code>
        {attribute.isAspect ? <code>影响筛选/搜索</code> : null}
      </div>

      {attribute.dictionaryId ? (
        <div className="product-prep-attribute-values">
          {valueQuery?.isLoading || valueQuery?.isFetching ? '正在读取字典值...' : null}
          {valueQuery?.isError ? `字典值读取失败：${valueQuery.error.message}` : null}
          {!valueQuery?.isLoading && !valueQuery?.isError ? (
            dictionaryValues.length
              ? `已加载 ${dictionaryValues.length} 个候选字典值，实际可继续分页读取更多。`
              : '该字典属性尚未返回候选值，需要继续查询或人工确认。'
          ) : null}
        </div>
      ) : null}

      <AttributeValueEditor
        attribute={attribute}
        dictionaryValues={dictionaryValues}
        draftAttributes={draftAttributes}
        formValues={formValues}
        onFormValueChange={onFormValueChange}
      />

      <div className={`product-prep-attribute-current ${isFilled ? 'is-filled' : ''}`}>
        <span>当前将下发：</span>
        <strong>{isFilled ? currentValues.map(formatValue).join(' / ') : '待填写'}</strong>
      </div>
    </article>
  );
}

export function ProductPrepAttributePanel({
  attributes,
  attributeValuesByKey,
  attributeValueQueriesByKey,
  draftAttributes,
  formValues,
  onFormValueChange,
  hasCredentials,
  selection,
  isLoading,
  error,
}) {
  if (!hasCredentials) {
    return (
      <div className="product-prep-attribute-panel is-empty">
        请先配置并保存 Ozon Client ID / Api Key，才能查询类目属性。
      </div>
    );
  }

  if (!selection.descriptionCategoryId || !selection.typeId) {
    return (
      <div className="product-prep-attribute-panel is-empty">
        请先在“Ozon 描述类目与类型”里选择到可发布的 type_id。
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="product-prep-attribute-panel is-empty">
        正在查询 DescriptionCategoryAPI_GetAttributes...
      </div>
    );
  }

  if (error) {
    return (
      <div className="product-prep-attribute-panel is-empty is-error">
        属性查询失败：{error.message}
      </div>
    );
  }

  if (!attributes.length) {
    return (
      <div className="product-prep-attribute-panel is-empty">
        已查询，但当前类目没有返回属性清单。
      </div>
    );
  }

  const requiredAttributes = attributes.filter((attribute) => attribute.isRequired);
  const optionalAttributes = attributes.filter((attribute) => !attribute.isRequired);
  const dictionaryAttributes = attributes.filter((attribute) => attribute.dictionaryId);
  const filledRequiredCount = requiredAttributes.filter((attribute) => {
    const values = getCurrentValues({ attribute, draftAttributes, formValues });
    return values.some((value) => value?.value || value?.dictionaryValueId);
  }).length;

  return (
    <div className="product-prep-attribute-panel">
      <div className="product-prep-attribute-summary">
        <span>属性总数 <strong>{attributes.length}</strong></span>
        <span>必填 <strong>{requiredAttributes.length}</strong></span>
        <span>字典属性 <strong>{dictionaryAttributes.length}</strong></span>
        <span>必填已填 <strong>{filledRequiredCount}/{requiredAttributes.length}</strong></span>
      </div>

      <div className="product-prep-attribute-context">
        <code>description_category_id: {selection.descriptionCategoryId}</code>
        <code>type_id: {selection.typeId}</code>
        <code>接口: /v1/description-category/attribute</code>
      </div>

      <div className="product-prep-attribute-list">
        <h4>必须填写的属性</h4>
        {requiredAttributes.map((attribute) => {
          const key = getAttributeKey(attribute);
          return (
            <AttributeCard
              attribute={attribute}
              dictionaryValues={attributeValuesByKey[key] || []}
              valueQuery={attributeValueQueriesByKey[key]}
              draftAttributes={draftAttributes}
              formValues={formValues}
              onFormValueChange={onFormValueChange}
              key={key}
            />
          );
        })}
      </div>

      {optionalAttributes.length ? (
        <div className="product-prep-attribute-optional">
          <h4>可选属性，也展示出来供你判断是否要补</h4>
          <div className="product-prep-attribute-optional-grid">
            {optionalAttributes.map((attribute) => (
              <span key={getAttributeKey(attribute)}>
                {attribute.name}
                <code>id: {attribute.id}</code>
                {attribute.dictionaryId ? <code>dict: {attribute.dictionaryId}</code> : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
