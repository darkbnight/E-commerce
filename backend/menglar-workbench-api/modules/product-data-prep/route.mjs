import { createProductDataPrepService } from './service.mjs';

const service = createProductDataPrepService();

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendError(res, statusCode, message, details = null) {
  sendJson(res, statusCode, {
    error: message,
    details,
  });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('请求体不是合法 JSON');
  }
}

function matchDraftRoute(pathname) {
  const detailMatch = pathname.match(/^\/api\/product-data-prep\/drafts\/(\d+)$/);
  if (detailMatch) {
    return { draftId: Number(detailMatch[1]), action: 'detail' };
  }

  const validateMatch = pathname.match(/^\/api\/product-data-prep\/drafts\/(\d+)\/validate$/);
  if (validateMatch) {
    return { draftId: Number(validateMatch[1]), action: 'validate' };
  }

  return null;
}

export function isProductDataPrepRoute(req) {
  return (req.url || '').startsWith('/api/product-data-prep');
}

export async function handleProductDataPrepRoute(req, res) {
  const url = new URL(req.url || '/api/product-data-prep', 'http://127.0.0.1');
  const { pathname, searchParams } = url;

  if (req.method === 'GET' && pathname === '/api/product-data-prep/candidates') {
    sendJson(res, 200, service.listCandidates({ searchParams }));
    return;
  }

  if (req.method === 'GET' && pathname === '/api/product-data-prep/drafts') {
    sendJson(res, 200, service.listDrafts({ searchParams }));
    return;
  }

  if (req.method === 'GET' && pathname === '/api/product-data-prep/content-results') {
    sendJson(res, 200, service.listContentResults({ searchParams }));
    return;
  }

  const draftRoute = matchDraftRoute(pathname);
  if (req.method === 'GET' && draftRoute?.action === 'detail') {
    const draft = service.getDraftById(draftRoute.draftId);
    if (!draft) {
      sendError(res, 404, '草稿不存在');
      return;
    }
    sendJson(res, 200, { item: draft });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/product-data-prep/drafts') {
    try {
      const body = await readJsonBody(req);
      if (!body.candidateId) {
        sendError(res, 400, 'candidateId 必须提供');
        return;
      }
      const draft = service.createDraft(body);
      if (!draft) {
        sendError(res, 404, '候选商品不存在');
        return;
      }
      sendJson(res, 201, { item: draft });
    } catch (error) {
      sendError(res, 400, error.message);
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/product-data-prep/content-results') {
    try {
      const body = await readJsonBody(req);
      sendJson(res, 201, service.saveContentResult(body));
    } catch (error) {
      sendError(res, 400, error.message);
    }
    return;
  }

  if (req.method === 'PATCH' && draftRoute?.action === 'detail') {
    try {
      const body = await readJsonBody(req);
      const draft = service.updateDraft(draftRoute.draftId, body);
      if (!draft) {
        sendError(res, 404, '草稿不存在');
        return;
      }
      sendJson(res, 200, { item: draft });
    } catch (error) {
      sendError(res, 400, error.message);
    }
    return;
  }

  if (req.method === 'POST' && draftRoute?.action === 'validate') {
    const result = service.validateDraft(draftRoute.draftId);
    if (!result) {
      sendError(res, 404, '草稿不存在');
      return;
    }
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/product-data-prep/drafts/export') {
    try {
      const body = await readJsonBody(req);
      sendJson(res, 200, service.exportDrafts(body));
    } catch (error) {
      sendError(res, 400, error.message);
    }
    return;
  }

  sendError(res, 404, '未找到商品数据整理接口');
}
