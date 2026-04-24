import { createProductDataPrepRepository } from './repository.mjs';

function isBlank(value) {
  return value == null || value === '';
}

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function isPlaceholderUrl(value) {
  if (!isHttpUrl(value)) return false;
  try {
    const url = new URL(value);
    return ['example.com', 'www.example.com', 'localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function compactObject(input) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => {
    if (value == null || value === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }));
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

function buildExportAttributes(attributes = []) {
  return attributes.map((attribute) => {
    const exported = {
      id: attribute.attributeId,
      values: (attribute.values || []).map(normalizeAttributeValue),
    };

    if (attribute.complexId != null) {
      exported.complex_id = Number(attribute.complexId);
    }

    return exported;
  });
}

function buildPrimaryImage(images = []) {
  const normalized = [...images]
    .filter((image) => image?.url)
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));

  const explicitMain = normalized.find((image) => image.isMain);
  return explicitMain?.url || normalized[0]?.url || undefined;
}

function buildExportItem(draft) {
  const imageEntries = [...(draft.images || [])]
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
    .filter((image) => image?.url);
  const images = imageEntries.map((image) => image.url);
  const primaryImage = buildPrimaryImage(imageEntries);
  const complexAttributes = buildExportAttributes(draft.complexAttributes);

  return compactObject({
    offer_id: draft.offerId,
    name: draft.name,
    description: draft.description,
    description_category_id: draft.descriptionCategoryId,
    type_id: draft.typeId,
    vendor: draft.vendor || undefined,
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
    primary_image: primaryImage,
    attributes: buildExportAttributes(draft.attributes),
    complex_attributes: complexAttributes,
  });
}

function collectExportItemIssues(item) {
  const issues = [];

  if (!item.offer_id) issues.push({ field: 'offer_id', level: 'error', message: '缺少 offer_id' });
  if (!item.name) issues.push({ field: 'name', level: 'error', message: '缺少 name' });
  if (!item.description_category_id) issues.push({ field: 'description_category_id', level: 'error', message: '缺少 description_category_id' });
  if (!item.type_id) issues.push({ field: 'type_id', level: 'error', message: '缺少 type_id' });
  if (!item.price) issues.push({ field: 'price', level: 'error', message: '缺少 price' });
  if (!item.currency_code) issues.push({ field: 'currency_code', level: 'error', message: '缺少 currency_code' });
  if (isBlank(item.vat)) issues.push({ field: 'vat', level: 'error', message: '缺少 vat' });
  if (!item.depth || !item.width || !item.height) issues.push({ field: 'package_size', level: 'error', message: '缺少 depth/width/height' });
  if (!item.weight) issues.push({ field: 'weight', level: 'error', message: '缺少 weight' });
  if (!Array.isArray(item.images) || item.images.length === 0) {
    issues.push({ field: 'images', level: 'error', message: '至少需要 1 张商品图片' });
  } else if (!item.images.every(isHttpUrl)) {
    issues.push({ field: 'images', level: 'error', message: 'images 必须是可访问的 http/https 直链' });
  } else if (item.images.some(isPlaceholderUrl)) {
    issues.push({ field: 'images', level: 'error', message: 'images 不能使用 example.com/localhost 这类占位地址' });
  }
  if (item.primary_image && !isHttpUrl(item.primary_image)) {
    issues.push({ field: 'primary_image', level: 'error', message: 'primary_image 必须是可访问的 http/https 直链' });
  } else if (item.primary_image && isPlaceholderUrl(item.primary_image)) {
    issues.push({ field: 'primary_image', level: 'error', message: 'primary_image 不能使用 example.com/localhost 这类占位地址' });
  }
  if (!Array.isArray(item.attributes) || item.attributes.length === 0) {
    issues.push({ field: 'attributes', level: 'error', message: '至少需要 1 个 attributes 项' });
  }
  if (!item.primary_image && Array.isArray(item.images) && item.images.length > 0) {
    issues.push({ field: 'primary_image', level: 'warning', message: '未显式提供 primary_image，已尝试用首图兜底' });
  }

  return issues;
}

function buildImportRequest(items = []) {
  return {
    items,
  };
}

function collectSaveIssues(draft, exportItem) {
  return [
    ...collectDraftIssues(draft),
    ...collectExportItemIssues(exportItem),
  ];
}

function hasBlockingIssue(issues) {
  return issues.some((issue) => issue.level === 'error');
}

function resolveSaveStatus({ requestedStatus, issues }) {
  if (hasBlockingIssue(issues)) return 'invalid';
  return requestedStatus === 'ready' ? 'ready' : 'draft';
}

function buildDraftSavePayload({ draft, requestedStatus }) {
  const exportItem = buildExportItem(draft);
  const issues = collectSaveIssues(draft, exportItem);
  const resultStatus = resolveSaveStatus({ requestedStatus, issues });

  return {
    draft: {
      ...draft,
      resultStatus,
      draftStatus: resultStatus,
    },
    exportItem,
    issues,
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
          source: repositorySource === 'sqlite-db' ? 'db/ecommerce-workbench.sqlite' : 'module-mock-fallback',
          note: '优先读取 SQLite 的 source_jobs + product_business_snapshots；本地数据库不存在时才返回模块兜底样例。',
        },
        total: items.length,
        items,
      };
    },

    listDrafts({ searchParams }) {
      const draftStatus = searchParams.get('draftStatus') || '';
      const limit = searchParams.get('limit');
      const items = repository.listDrafts({ draftStatus, limit });
      return {
        meta: {
          source: 'db/ecommerce-workbench.sqlite',
          table: 'product_content_result',
          note: '当前草稿持久化在 product_content_result，字段编辑后同步生成 Ozon import item。',
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
      const existing = repository.getDraftById(draftId);
      if (!existing) return null;

      const requestedStatus = patch.resultStatus || patch.draftStatus || existing.resultStatus || existing.draftStatus;
      const mergedDraft = {
        ...existing,
        ...patch,
        id: existing.id,
        resultKey: existing.resultKey,
        sourceJobId: existing.sourceJobId,
        sourceSnapshotId: existing.sourceSnapshotId,
        productNormalizedId: existing.productNormalizedId,
        platform: existing.platform || patch.platform || 'ozon',
        platformProductId: existing.platformProductId || patch.platformProductId || '',
        ozonProductId: existing.ozonProductId || patch.ozonProductId || existing.platformProductId || '',
        createdAt: existing.createdAt,
      };
      const payload = buildDraftSavePayload({ draft: mergedDraft, requestedStatus });
      const item = repository.updateDraft(draftId, payload.draft, payload.exportItem);

      return {
        meta: {
          source: 'db/ecommerce-workbench.sqlite',
          table: 'product_content_result',
          action: 'update',
        },
        item,
        ozonImportItem: payload.exportItem,
        ozonImportRequest: buildImportRequest([payload.exportItem]),
        issues: payload.issues,
      };
    },

    listContentResults({ searchParams }) {
      const limit = searchParams.get('limit');
      const items = repository.listContentResults({ limit });
      return {
        meta: {
          source: 'db/ecommerce-workbench.sqlite',
          table: 'product_content_result',
        },
        total: items.length,
        items,
      };
    },

    saveContentResult(input = {}) {
      const draft = input.draft || input;
      const requestedStatus = draft.resultStatus || draft.draftStatus;
      const payload = buildDraftSavePayload({ draft, requestedStatus });
      const item = repository.saveContentResult({
        draft: payload.draft,
        exportItem: payload.exportItem,
      });

      return {
        meta: {
          source: 'db/ecommerce-workbench.sqlite',
          table: 'product_content_result',
          action: 'upsert',
        },
        item,
        ozonImportItem: payload.exportItem,
        ozonImportRequest: buildImportRequest([payload.exportItem]),
        issues: payload.issues,
      };
    },

    validateDraft(draftId) {
      const draft = repository.getDraftById(draftId);
      if (!draft) return null;

      const exportItem = buildExportItem(draft);
      const issues = collectSaveIssues(draft, exportItem);
      const resultStatus = hasBlockingIssue(issues) ? 'invalid' : 'ready';
      const item = repository.setDraftStatus(draftId, resultStatus, exportItem);

      return {
        draftId: draft.id,
        ok: resultStatus === 'ready',
        suggestedStatus: resultStatus,
        item,
        ozonImportItem: exportItem,
        ozonImportRequest: buildImportRequest([exportItem]),
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
        const exportItem = buildExportItem(draft);
        const issues = [
          ...collectDraftIssues(draft),
          ...collectExportItemIssues(exportItem),
        ];
        const blockingIssues = issues.filter((issue) => issue.level === 'error');
        if (blockingIssues.length) {
          skipped.push({
            draftId: draft.id,
            reasons: blockingIssues,
          });
          return;
        }
        exportedItems.push(exportItem);
      });

      return {
        meta: {
          source: 'db/ecommerce-workbench.sqlite',
          table: 'product_content_result',
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
