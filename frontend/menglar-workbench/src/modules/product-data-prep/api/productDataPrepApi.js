const BASE_PATH = '/api/product-data-prep';

function buildSearch(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value != null) {
      search.set(key, String(value));
    }
  });
  return search.toString();
}

async function readJson(response, fallbackMessage) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `${fallbackMessage}: ${response.status}`);
  }
  return payload;
}

export async function fetchProductPrepCandidates(params = {}) {
  const search = buildSearch(params);
  const response = await fetch(`${BASE_PATH}/candidates${search ? `?${search}` : ''}`);
  return readJson(response, '读取候选商品失败');
}

export async function fetchProductPrepDrafts(params = {}) {
  const search = buildSearch(params);
  const response = await fetch(`${BASE_PATH}/drafts${search ? `?${search}` : ''}`);
  return readJson(response, '读取草稿失败');
}

export async function fetchProductPrepDraft(draftId) {
  const response = await fetch(`${BASE_PATH}/drafts/${draftId}`);
  return readJson(response, '读取草稿详情失败');
}

export async function createProductPrepDraft(input) {
  const response = await fetch(`${BASE_PATH}/drafts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJson(response, '创建草稿失败');
}

export async function updateProductPrepDraft(draftId, input) {
  const response = await fetch(`${BASE_PATH}/drafts/${draftId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJson(response, '更新草稿失败');
}

export async function validateProductPrepDraft(draftId) {
  const response = await fetch(`${BASE_PATH}/drafts/${draftId}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  return readJson(response, '校验草稿失败');
}

export async function exportProductPrepDrafts(input = {}) {
  const response = await fetch(`${BASE_PATH}/drafts/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJson(response, '导出草稿失败');
}
