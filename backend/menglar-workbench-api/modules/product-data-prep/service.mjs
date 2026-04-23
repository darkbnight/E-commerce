import { createProductDataPrepRepository } from './repository.mjs';

function collectDraftIssues(draft) {
  const issues = [];

  if (!draft.offerId) issues.push({ field: 'offerId', level: 'error', message: '缺少商家货号 offer_id' });
  if (!draft.name) issues.push({ field: 'name', level: 'error', message: '缺少标题 name' });
  if (!draft.categoryId) issues.push({ field: 'categoryId', level: 'error', message: '缺少 Ozon category_id' });
  if (!draft.price) issues.push({ field: 'price', level: 'error', message: '缺少售价 price' });
  if (!draft.currencyCode) issues.push({ field: 'currencyCode', level: 'error', message: '缺少币种 currency_code' });
  if (!draft.vat) issues.push({ field: 'vat', level: 'error', message: '缺少 VAT' });
  if (!draft.packageDepthMm || !draft.packageWidthMm || !draft.packageHeightMm) {
    issues.push({ field: 'packageSize', level: 'error', message: '缺少包装尺寸(mm)' });
  }
  if (!draft.packageWeightG) issues.push({ field: 'packageWeightG', level: 'error', message: '缺少包装重量(g)' });
  if (!Array.isArray(draft.images) || draft.images.length === 0) {
    issues.push({ field: 'images', level: 'error', message: '至少需要 1 张商品图片' });
  }
  if (!Array.isArray(draft.attributes) || draft.attributes.length === 0) {
    issues.push({ field: 'attributes', level: 'error', message: '至少需要 1 个类目属性' });
  }
  if (!draft.description) issues.push({ field: 'description', level: 'warning', message: '缺少 description，审核和转化风险较高' });
  if (!draft.warehouseId) issues.push({ field: 'warehouseId', level: 'warning', message: '缺少仓库 ID，后续库存链路无法直接执行' });

  return issues;
}

function buildExportItem(draft) {
  return {
    offer_id: draft.offerId,
    name: draft.name,
    description: draft.description,
    category_id: draft.categoryId,
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
    images: draft.images.map((image) => image.url),
    attributes: draft.attributes.map((attribute) => ({
      id: attribute.attributeId,
      values: attribute.values.map((value) => ({ value })),
    })),
  };
}

export function createProductDataPrepService({ repository = createProductDataPrepRepository() } = {}) {
  return {
    listCandidates({ searchParams }) {
      const sourceJobId = searchParams.get('sourceJobId');
      const items = repository.listCandidates({ sourceJobId });
      return {
        meta: {
          source: 'module-scaffold',
          note: '当前返回模块内 mock 候选商品，下一步可替换为真实候选池。',
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
          source: 'module-scaffold',
          note: '当前返回模块内内存草稿，方便前期联调字段结构。',
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
          source: 'module-scaffold',
          note: '导出结构已对齐本地 Ozon importer，可直接作为下一步真实导出载荷的基础。',
        },
        itemCount: exportedItems.length,
        skippedCount: skipped.length,
        items: exportedItems,
        skipped,
      };
    },
  };
}
