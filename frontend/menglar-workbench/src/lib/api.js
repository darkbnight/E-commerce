export async function fetchJobs() {
  const response = await fetch('/api/jobs');
  if (!response.ok) {
    throw new Error(`读取任务失败: ${response.status}`);
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
