export const OZON_DESCRIPTION_LANGUAGE = 'ZH_HANS';

export async function fetchJobs() {
  const response = await fetch('/api/jobs');
  if (!response.ok) {
    throw new Error(`读取任务失败: ${response.status}`);
  }
  return response.json();
}

export async function fetchResultJobs(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value != null) {
      search.set(key, String(value));
    }
  });

  const response = await fetch(`/api/result-jobs?${search.toString()}`);
  if (!response.ok) {
    throw new Error(`读取结果批次失败: ${response.status}`);
  }
  return response.json();
}

export async function fetchProducts(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value != null) {
      search.set(key, String(value));
    }
  });

  const response = await fetch(`/api/products?${search.toString()}`);
  if (!response.ok) {
    throw new Error(`读取商品失败: ${response.status}`);
  }
  return response.json();
}

export async function checkMenglarLoginHealth(input = {}) {
  const response = await fetch('/api/menglar/login-health', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJson(response, '登录态检查失败');
}

async function readJson(response, fallbackMessage) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `${fallbackMessage}: ${response.status}`);
  }
  return payload;
}

export async function fetchOzonTemplate(kind = 'products') {
  const response = await fetch(`/api/ozon/template?kind=${encodeURIComponent(kind)}`);
  return readJson(response, '读取模板失败');
}

export async function validateOzonPayload({ mode, payload }) {
  const response = await fetch('/api/ozon/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, payload }),
  });
  return readJson(response, '校验失败');
}

export async function executeOzonAction(input) {
  const response = await fetch('/api/ozon/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJson(response, '执行失败');
}

export async function fetchOzonImportInfo(input) {
  const response = await fetch('/api/ozon/import-info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJson(response, '任务查询失败');
}

export async function fetchOzonCategoryTree(input = {}) {
  const response = await fetch('/api/ozon/category-tree', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: OZON_DESCRIPTION_LANGUAGE, ...input }),
  });
  return readJson(response, '描述类目树查询失败');
}

export async function fetchOzonCategoryAttributes(input = {}) {
  const response = await fetch('/api/ozon/category-attributes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: OZON_DESCRIPTION_LANGUAGE, ...input }),
  });
  return readJson(response, '类目属性查询失败');
}

export async function fetchOzonAttributeValues(input = {}) {
  const response = await fetch('/api/ozon/attribute-values', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: OZON_DESCRIPTION_LANGUAGE, ...input }),
  });
  return readJson(response, '属性值查询失败');
}

export async function fetchShippingMethods() {
  const response = await fetch('/api/shipping/methods');
  return readJson(response, '读取物流方法失败');
}

export async function fetchShippingRuleInfo() {
  const response = await fetch('/api/shipping/rule-info');
  return readJson(response, '读取物流规则信息失败');
}

export async function calculateShippingCost(input) {
  const response = await fetch('/api/shipping/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJson(response, '物流费用计算失败');
}

export async function compareShippingServices(input) {
  const response = await fetch('/api/shipping/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJson(response, '物流服务比价失败');
}
