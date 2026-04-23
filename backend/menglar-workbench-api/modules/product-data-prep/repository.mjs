function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

const state = {
  candidates: [
    {
      id: 501,
      sourceJobId: 32,
      productNormalizedId: 2081,
      ozonProductId: '1676022059',
      brand: 'Generic',
      categoryLevels: ['Дом и сад', 'Уборка', 'Салфетки'],
      screeningStatus: 'candidate',
      lengthCm: 30,
      widthCm: 40,
      heightCm: 2,
      weightG: 180,
      createdAt: '2026-04-22T12:00:00.000Z',
    },
    {
      id: 502,
      sourceJobId: 32,
      productNormalizedId: 2084,
      ozonProductId: '1792831404',
      brand: 'No Brand',
      categoryLevels: ['Дом и сад', 'Кухня', 'Тряпки'],
      screeningStatus: 'candidate',
      lengthCm: 25,
      widthCm: 25,
      heightCm: 3,
      weightG: 220,
      createdAt: '2026-04-22T12:02:00.000Z',
    },
  ],
  drafts: [
    {
      id: 9001,
      sourceJobId: 32,
      productNormalizedId: 2081,
      offerId: 'CLOTH-30X40-2PK-GREY',
      name: 'Cleaning Cloth Microfiber 30x40 cm 2 pcs Grey',
      description: 'Reusable cleaning cloth for kitchen and household use.',
      descriptionCategoryId: 17031663,
      typeId: 100001234,
      vendor: 'Generic',
      barcode: '2000000000011',
      price: '199',
      oldPrice: '259',
      premiumPrice: '189',
      minPrice: '179',
      currencyCode: 'CNY',
      vat: '0',
      warehouseId: 123456789,
      stock: 50,
      packageDepthMm: 30,
      packageWidthMm: 200,
      packageHeightMm: 300,
      packageWeightG: 120,
      images: [
        { url: 'https://example.com/cloth-main.jpg', sortOrder: 1, isMain: true },
        { url: 'https://example.com/cloth-detail.jpg', sortOrder: 2, isMain: false },
      ],
      attributes: [
        {
          attributeId: 85,
          name: 'Brand',
          isRequired: true,
          dictionaryId: 0,
          complexId: 0,
          values: [{ value: 'Generic' }],
        },
        {
          attributeId: 8229,
          name: 'Pieces',
          isRequired: true,
          dictionaryId: 0,
          complexId: 0,
          values: [{ value: '2' }],
        },
      ],
      draftStatus: 'ready',
      createdAt: '2026-04-22T12:05:00.000Z',
      updatedAt: '2026-04-22T12:05:00.000Z',
    },
    {
      id: 9002,
      sourceJobId: 32,
      productNormalizedId: 2084,
      offerId: '',
      name: '',
      description: '',
      descriptionCategoryId: null,
      typeId: null,
      vendor: '',
      barcode: '',
      price: '',
      oldPrice: '',
      premiumPrice: '',
      minPrice: '',
      currencyCode: '',
      vat: '',
      warehouseId: null,
      stock: 0,
      packageDepthMm: null,
      packageWidthMm: null,
      packageHeightMm: null,
      packageWeightG: null,
      images: [],
      attributes: [],
      draftStatus: 'draft',
      createdAt: '2026-04-22T12:06:00.000Z',
      updatedAt: '2026-04-22T12:06:00.000Z',
    },
  ],
};

let nextDraftId = 9003;

function buildDraftFromCandidate(candidate) {
  return {
    id: nextDraftId++,
    sourceJobId: candidate.sourceJobId,
    productNormalizedId: candidate.productNormalizedId,
    offerId: '',
    name: '',
    description: '',
    descriptionCategoryId: null,
    typeId: null,
    vendor: candidate.brand || '',
    barcode: '',
    price: '',
    oldPrice: '',
    premiumPrice: '',
    minPrice: '',
    currencyCode: '',
    vat: '',
    warehouseId: null,
    stock: 0,
    packageDepthMm: candidate.heightCm == null ? null : Math.round(Number(candidate.heightCm) * 10),
    packageWidthMm: candidate.widthCm == null ? null : Math.round(Number(candidate.widthCm) * 10),
    packageHeightMm: candidate.lengthCm == null ? null : Math.round(Number(candidate.lengthCm) * 10),
    packageWeightG: candidate.weightG ?? null,
    images: [],
    attributes: [],
    draftStatus: 'draft',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export function createProductDataPrepRepository() {
  return {
    listCandidates({ sourceJobId = null } = {}) {
      const items = state.candidates.filter((candidate) => (
        sourceJobId == null || Number(candidate.sourceJobId) === Number(sourceJobId)
      ));
      return clone(items);
    },

    listDrafts({ draftStatus = '' } = {}) {
      const items = state.drafts.filter((draft) => (
        !draftStatus || draft.draftStatus === draftStatus
      ));
      return clone(items);
    },

    getDraftById(draftId) {
      const draft = state.drafts.find((item) => Number(item.id) === Number(draftId));
      return draft ? clone(draft) : null;
    },

    createDraftFromCandidate(candidateId) {
      const candidate = state.candidates.find((item) => Number(item.id) === Number(candidateId));
      if (!candidate) return null;

      const existing = state.drafts.find((item) => Number(item.productNormalizedId) === Number(candidate.productNormalizedId));
      if (existing) return clone(existing);

      const draft = buildDraftFromCandidate(candidate);
      state.drafts.unshift(draft);
      return clone(draft);
    },

    updateDraft(draftId, patch) {
      const draft = state.drafts.find((item) => Number(item.id) === Number(draftId));
      if (!draft) return null;

      const normalizedPatch = clone(patch);
      Object.assign(draft, normalizedPatch, {
        updatedAt: nowIso(),
      });
      return clone(draft);
    },
  };
}
