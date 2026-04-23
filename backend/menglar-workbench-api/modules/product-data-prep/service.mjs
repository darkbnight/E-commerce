import { createProductDataPrepRepository } from './repository.mjs';

function isBlank(value) {
  return value == null || value === '';
}

function collectDraftIssues(draft) {
  const issues = [];

  if (!draft.offerId) issues.push({ field: 'offerId', level: 'error', message: '缺少商家货号 offer_id' });
  if (!draft.name) issues.push({ field: 'name', level: 'error', message: '缺少标题 name' });
  if (!draft.descriptionCategoryId) {
    issues.push({ field: 'descriptionCategoryId', level: 'error', message: '缺少 Ozon description_category_id' });
  }
  if (!draft.typeId) issues.push({ field: 'typeId', level: 'error', message: '缺少 Ozon type_id' });
  if (!draft.price) issues.push({ field: 'price', level: 'error', message: '缺少售价 price' });
  if (!draft.currencyCode) issues.push({ field: 'currencyCode', level: 'error', message: '缺少币种 currency_code' });
  if (isBlank(draft.vat)) issues.push({ field: 'vat', level: 'error', message: '缺少 VAT' });
  if (!draft.packageDepthMm || !draft.packageWidthMm || !draft.packageHeightMm) {
    issues.push({ field: 'packageSize', level: 'error', message: '缺少包装尺寸(mm)' });
  }
  if (!draft.packageWeightG) issues.push({ field: 'packageWeightG', level: 'error', message: '缺少包装重量(g)' });
  if (!Array.isArray(draft.images) || draft.images.length === 0) {
    issues.push({ field: 'images', level: 'error', message: '至少需要 1 张商品图片' });
  } else if (!draft.images.some((image) => image?.url)) {
    issues.push({ field: 'images', level: 'error', message: '至少需要 1 个可访问的商品图片 URL' });
  }
  if (!Array.isArray(draft.attributes) || draft.attributes.length === 0) {
    issues.push({ field: 'attributes', level: 'error', message: '至少需要 1 个类目属性' });
  } else {
    draft.attributes.forEach((attribute, index) => {
      if (!attribute.attributeId) {
        issues.push({ field: `attributes[${index}].attributeId`, level: 'error', message: '属性缺少 attribute_id' });
      }
      if (!Array.isArray(attribute.values) || attribute.values.length === 0) {
        issues.push({ field: `attributes[${index}].values`, level: 'error', message: '属性值不能为空' });
      } else {
        attribute.values.forEach((value, valueIndex) => {
          const hasTextValue = typeof value === 'string'
            ? value.trim()
            : value?.value != null && String(value.value).trim();
          const hasDictionaryValue = value?.dictionaryValueId != null && value.dictionaryValueId !== '';
          if (!hasTextValue && !hasDictionaryValue) {
            issues.push({
              field: `attributes[${index}].values[${valueIndex}]`,
              level: 'error',
              message: '属性值至少需要 value 或 dictionaryValueId',
            });
          }
        });
      }
    });
  }
  if (!draft.description) issues.push({ field: 'description', level: 'warning', message: '缺少 description，审核和转化风险较高' });
  if (!draft.warehouseId) issues.push({ field: 'warehouseId', level: 'warning', message: '缺少仓库 ID，后续库存链路无法直接执行' });

  return issues;
}

function normalizeAttributeValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const normalized = {};
    if (value.value != null && value.value !== '') normalized.value = String(value.value);
    if (value.dictionaryValueId != null && value.dictionaryValueId !== '') {
      normalized.dictionary_value_id = Number(value.dictionaryValueId);
    }
    return normalized;
  }

  return { value: String(value) };
}

function buildExportAttributes(attributes) {
  return attributes.map((attribute) => {
    const exported = {
      id: attribute.attributeId,
      values: attribute.values.map(normalizeAttributeValue),
    };

    if (attribute.complexId != null) {
      exported.complex_id = Number(attribute.complexId);
    }

    return exported;
  });
}

function buildExportItem(draft) {
  const images = [...draft.images]
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
    .map((image) => image.url)
    .filter(Boolean);

  return {
    offer_id: draft.offerId,
    name: draft.name,
    description: draft.description,
    description_category_id: draft.descriptionCategoryId,
    type_id: draft.typeId,
    price: draft.price,
    old_price: draft.oldPrice || undefined,
    premium_price: draft.premiumPrice || undefined,
    min_price: draft.minPrice || undefined,
    currency_code: draft.currencyCode,
    vat: draft.vat,
    barcode: draft.barcode || undefined,
    depth: draft.packageDepthMm,
    width: draft.packageWidthMm,
    height: draft.packageHeightMm,
    dimension_unit: 'mm',
    weight: draft.packageWeightG,
    weight_unit: 'g',
    images,
    attributes: buildExportAttributes(draft.attributes),
  };
}

export function createProductDataPrepService({ repository = createProductDataPrepRepository() } = {}) {
  return {
    listCandidates({ searchParams }) {
      const sourceJobId = searchParams.get('sourceJobId');
      const limit = searchParams.get('limit');
      const items = repository.listCandidates({ sourceJobId, limit });
      const repositorySource = repository.getLastCandidateSource?.() || 'unknown';

      return {
        meta: {
          source: repositorySource === 'sqlite-db' ? 'db/menglar-mvp.sqlite' : 'module-mock-fallback',
          note: '优先读取 SQLite 的 source_jobs + products_normalized；本地数据库不存在时才返回模块兜底样例。',
        },
        total: items.length,
        items,
      };
    },

    listDrafts({ searchParams }) {
      const draftStatus = searchParams.get('draftStatus') || '';
      const items = repository.listDrafts({ draftStatus });
      return {
        meta: {
          source: 'module-memory-drafts',
          note: '当前草稿仍保存在模块内存态，后续可迁移到 product_publish_drafts 表。',
        },
        total: items.length,
        items,
      };
    },

    getDraftById(draftId) {
      return repository.getDraftById(draftId);
    },

    createDraft(input) {
      return repository.createDraftFromCandidate(input.candidateId);
    },

    updateDraft(draftId, patch) {
      return repository.updateDraft(draftId, patch);
    },

    validateDraft(draftId) {
      const draft = repository.getDraftById(draftId);
      if (!draft) return null;

      const issues = collectDraftIssues(draft);
      return {
        draftId: draft.id,
        ok: issues.every((issue) => issue.level !== 'error'),
        suggestedStatus: issues.every((issue) => issue.level !== 'error') ? 'ready' : 'draft',
        issues,
      };
    },

    exportDrafts(input = {}) {
      const requestedIds = Array.isArray(input.ids) ? input.ids : [];
      const drafts = requestedIds.length
        ? requestedIds.map((draftId) => repository.getDraftById(draftId)).filter(Boolean)
        : repository.listDrafts();

      const exportedItems = [];
      const skipped = [];

      drafts.forEach((draft) => {
        const issues = collectDraftIssues(draft);
        const blockingIssues = issues.filter((issue) => issue.level === 'error');
        if (blockingIssues.length) {
          skipped.push({
            draftId: draft.id,
            reasons: blockingIssues,
          });
          return;
        }
        exportedItems.push(buildExportItem(draft));
      });

      return {
        meta: {
          source: 'module-memory-drafts',
          note: '导出结构已对齐本地 Ozon importer，可作为后续真实导出载荷的基础。',
        },
        itemCount: exportedItems.length,
        skippedCount: skipped.length,
        items: exportedItems,
        skipped,
      };
    },
  };
}
