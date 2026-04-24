import {
  findDraftAttribute,
  getAttributeKey,
} from '../data/descriptionCategoryAttributes';

const BRAND_ATTRIBUTE_ID = 85;
const NO_BRAND_DICTIONARY_VALUE = {
  dictionaryValueId: 126745801,
  value: 'Нет бренда',
};

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

function buildAttributeTooltip(attribute, dictionaryValues, valueQuery) {
  const dictionaryState = attribute.dictionaryId
    ? (
        valueQuery?.isLoading || valueQuery?.isFetching
          ? '字典值：读取中'
          : valueQuery?.isError
            ? `字典值：读取失败 - ${valueQuery.error.message}`
            : `字典值：已加载 ${dictionaryValues.length} 个候选值`
      )
    : '取值方式：自由填写';
  return [
    attribute.description || 'Ozon 未返回填写说明',
    `id: ${attribute.id}`,
    `complex_id: ${attribute.complexId}`,
    attribute.groupName ? `group: ${attribute.groupName}` : '',
    getAttributeTypeLabel(attribute),
    attribute.isCollection ? '支持多值' : '单值',
    `max: ${attribute.maxValueCount || '不限'}`,
    attribute.isAspect ? '影响筛选/搜索' : '',
    dictionaryState,
  ].filter(Boolean).join('\n');
}

function InfoIcon({ label }) {
  return (
    <span className="product-prep-icon product-prep-info-icon" data-tooltip={label} aria-label={label} tabIndex={0}>
      i
    </span>
  );
}

function AttributeStatusIcons({ attribute, isFilled, dictionaryValues, valueQuery }) {
  const dictionaryTitle = valueQuery?.isLoading || valueQuery?.isFetching
    ? '字典值读取中'
    : valueQuery?.isError
      ? `字典值读取失败：${valueQuery.error.message}`
      : dictionaryValues.length
        ? `已加载 ${dictionaryValues.length} 个候选字典值`
        : '该属性没有已加载的候选字典值';

  return (
    <div className="product-prep-attribute-icons" aria-label="字段状态">
      {attribute.isRequired ? (
        <span className="product-prep-icon is-required" title="必填" aria-label="必填">!</span>
      ) : null}
      <span
        className={`product-prep-icon ${isFilled ? 'is-filled' : 'is-empty'}`}
        title={isFilled ? '已填写' : '待填写'}
        aria-label={isFilled ? '已填写' : '待填写'}
      />
      {attribute.dictionaryId ? (
        <span
          className={`product-prep-icon is-dictionary ${
            valueQuery?.isLoading || valueQuery?.isFetching ? 'is-loading' : ''
          } ${valueQuery?.isError ? 'is-error' : ''}`}
          title={dictionaryTitle}
          aria-label={dictionaryTitle}
        >
          D
        </span>
      ) : null}
    </div>
  );
}

function isBrandDictionaryAttribute(attribute) {
  return Number(attribute.id) === BRAND_ATTRIBUTE_ID && Boolean(attribute.dictionaryId);
}

function getNoBrandDictionaryValue(dictionaryValues) {
  return dictionaryValues.find((value) => (
    Number(value.dictionaryValueId) === NO_BRAND_DICTIONARY_VALUE.dictionaryValueId
  )) || NO_BRAND_DICTIONARY_VALUE;
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
  const canHaveMultiple = Boolean(attribute.isCollection) && (
    attribute.maxValueCount == null ||
    attribute.maxValueCount === 0 ||
    attribute.maxValueCount > 1
  );

  if (attribute.dictionaryId) {
    const selectValue = canHaveMultiple ? currentDictionaryIds : (currentDictionaryIds[0] || '');
    const showNoBrandShortcut = isBrandDictionaryAttribute(attribute);
    const noBrandValue = getNoBrandDictionaryValue(dictionaryValues);
    const selectDictionaryValues = showNoBrandShortcut &&
      !dictionaryValues.some((value) => Number(value.dictionaryValueId) === NO_BRAND_DICTIONARY_VALUE.dictionaryValueId)
      ? [noBrandValue, ...dictionaryValues]
      : dictionaryValues;
    return (
      <div className="product-prep-attribute-fill">
        <select
          aria-label={`${attribute.name} 的值`}
          multiple={canHaveMultiple}
          size={canHaveMultiple ? Math.min(Math.max(selectDictionaryValues.length, 3), 6) : undefined}
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
          {selectDictionaryValues.map((value) => (
            <option
              value={String(value.dictionaryValueId)}
              data-label={value.value}
              key={value.dictionaryValueId || value.value}
            >
              {value.value || `#${value.dictionaryValueId}`} ({value.dictionaryValueId})
            </option>
          ))}
        </select>
        {showNoBrandShortcut ? (
          <button
            className="product-prep-no-brand-button"
            type="button"
            onClick={() => {
              onFormValueChange(attributeKey, {
                values: [noBrandValue],
              });
            }}
          >
            无品牌
          </button>
        ) : null}
      </div>
    );
  }

  if (canHaveMultiple) {
    return (
      <label className="product-prep-attribute-fill">
        <textarea
          aria-label={`${attribute.name} 的值`}
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
      <input
        aria-label={`${attribute.name} 的值`}
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
  const tooltip = buildAttributeTooltip(attribute, dictionaryValues, valueQuery);

  return (
    <article className={`product-prep-attribute-card ${attribute.isRequired ? 'is-required' : ''}`}>
      <div className="product-prep-attribute-card-head">
        <div className="product-prep-attribute-title">
          <strong>{attribute.name}</strong>
          <InfoIcon label={tooltip} />
        </div>
        <AttributeStatusIcons
          attribute={attribute}
          isFilled={isFilled}
          dictionaryValues={dictionaryValues}
          valueQuery={valueQuery}
        />
      </div>

      <AttributeValueEditor
        attribute={attribute}
        dictionaryValues={dictionaryValues}
        draftAttributes={draftAttributes}
        formValues={formValues}
        onFormValueChange={onFormValueChange}
      />
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
  return (
    <div className="product-prep-attribute-panel">
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
              <span key={getAttributeKey(attribute)} className="product-prep-optional-attribute-chip">
                <span>{attribute.name}</span>
                <InfoIcon label={buildAttributeTooltip(attribute, [], null)} />
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
