import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkMenglarLoginHealth } from './lib/login-health.mjs';
import { extractRuntimeStorage } from './lib/preflight-checks.mjs';
import { launchMenglarContext } from './lib/browser-session.mjs';
import { openMenglarDb, insertSourceJob, nowIso, updateSourceJob } from './lib/job-store.mjs';
import {
  normalizeContentAsset,
  PRODUCT_CONTENT_TARGET,
  upsertContentAsset,
} from './lib/content-assets-store.mjs';

const CACHE_DIR = path.join(process.cwd(), '.cache', 'menglar-capture');
const LAST_RESULT_PATH = path.join(CACHE_DIR, 'content-assets-last.json');
const PAGE_QUERY_API_PATH = '/api/ozon-report-service/v1/productLibrary/pageQuery';

function parseArgs(argv) {
  const args = {
    productId: process.env.MENGLAR_PRODUCT_ID || '',
    json: false,
    headless: false,
    refresh: process.env.MENGLAR_REFRESH_PROFILE === '1',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--json') args.json = true;
    if (item === '--headless') args.headless = true;
    if (item === '--refresh') args.refresh = true;
    if (item === '--product-id' && argv[index + 1]) {
      args.productId = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

function buildFetchHeaders(headers) {
  const result = {
    accept: 'application/json, text/plain, */*',
    'content-type': 'application/json',
    referer: PRODUCT_CONTENT_TARGET.targetUrl,
  };

  for (const key of [
    'authorization',
    'control-t',
    'x-risk-dida',
    'user-agent',
    'sec-ch-ua',
    'sec-ch-ua-mobile',
    'sec-ch-ua-platform',
  ]) {
    if (headers?.[key]) result[key] = headers[key];
  }

  return result;
}

function summarizeResult(result) {
  return {
    jobId: result.jobId,
    productId: result.productId,
    libraryId: result.libraryId,
    status: result.status,
    contentAssetId: result.contentAssetId,
    insertedAsset: result.insertedAsset,
    insertedSkuCount: result.insertedSkuCount,
    title: result.asset?.title || null,
    descriptionLength: result.asset?.description?.length || 0,
    tagCount: result.asset?.tags?.length || 0,
    imageCount: result.asset?.image_urls?.length || 0,
    skuCount: result.asset?.skus?.length || 0,
    pageUrl: result.pageUrl || PRODUCT_CONTENT_TARGET.targetUrl,
    capturedAt: result.capturedAt,
  };
}

async function writeLastResult(result) {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(LAST_RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

async function fetchJson(page, url, headers, body) {
  return page.evaluate(async ({ url: targetUrl, headers: targetHeaders, body: payload }) => {
    const response = await fetch(targetUrl, {
      method: payload ? 'POST' : 'GET',
      headers: targetHeaders,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const data = await response.json();
    return {
      status: response.status,
      data,
    };
  }, { url, headers, body });
}

function requireSuccessResponse(response, label) {
  if (response.status !== 200 || response.data?.code !== 0) {
    throw new Error(`${label}失败: HTTP ${response.status}, code=${response.data?.code ?? 'unknown'}, msg=${response.data?.msg ?? 'unknown'}`);
  }
  return response.data.data;
}

export async function captureProductContentAssets(options = {}) {
  const productId = String(options.productId || '').trim();
  if (!productId) {
    throw new Error('必须提供 --product-id');
  }

  const loginHealth = await checkMenglarLoginHealth({
    target: 'hot_products',
    refresh: Boolean(options.refresh),
    headless: true,
    writeResult: true,
  });
  if (!loginHealth.ok) {
    throw new Error(`登录态检查未通过: ${loginHealth.errorType || loginHealth.message || 'unknown'}`);
  }

  const db = await openMenglarDb();
  const jobId = insertSourceJob(db, PRODUCT_CONTENT_TARGET);
  const capturedAt = nowIso();
  let context;

  try {
    const runtimeStorage = await extractRuntimeStorage();
    context = await launchMenglarContext({
      runtimeStorage,
      headless: Boolean(options.headless),
    });

    const authorizedRequests = [];
    context.on('request', (request) => {
      const url = request.url();
      if (!url.includes('/api/ozon-report-service/v1/')) return;
      const headers = request.headers();
      if (!headers.authorization) return;
      authorizedRequests.push({
        url,
        headers,
      });
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto(PRODUCT_CONTENT_TARGET.targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForResponse((response) => response.url().includes(PAGE_QUERY_API_PATH), { timeout: 30000 });
    await page.waitForTimeout(3000);

    const latestAuthorizedRequest = authorizedRequests.at(-1);
    if (!latestAuthorizedRequest) {
      throw new Error('未捕获到可复用的授权请求头');
    }

    const headers = buildFetchHeaders(latestAuthorizedRequest.headers);
    const queryResponse = await fetchJson(
      page,
      `https://ozon.menglar.com${PAGE_QUERY_API_PATH}`,
      headers,
      {
        keyword: productId,
        price: {},
        pageNum: 1,
        pageSize: 10,
      },
    );
    const queryData = requireSuccessResponse(queryResponse, '采集箱查询');
    const libraryItem = Array.isArray(queryData?.list)
      ? queryData.list.find((item) => String(item?.sourceDataId || '') === productId)
      : null;
    if (!libraryItem) {
      throw new Error(`采集箱中未找到商品 ${productId}`);
    }

    const detailResponse = await fetchJson(
      page,
      `https://ozon.menglar.com/api/ozon-report-service/v1/improveEditing/${libraryItem.id}`,
      headers,
      null,
    );
    const detail = requireSuccessResponse(detailResponse, '内容资产详情查询');
    const asset = normalizeContentAsset(detail, libraryItem, { productId });
    const insertResult = upsertContentAsset(db, jobId, asset, capturedAt);

    const result = {
      ok: true,
      status: 'success',
      target: PRODUCT_CONTENT_TARGET.pageType,
      jobId,
      productId,
      libraryId: Number(libraryItem.id),
      contentAssetId: insertResult.contentAssetId,
      insertedAsset: insertResult.insertedAsset,
      insertedSkuCount: insertResult.insertedSkuCount,
      pageUrl: page.url(),
      capturedAt,
      asset,
      raw: {
        libraryItem,
        detail,
      },
    };

    updateSourceJob(db, jobId, {
      job_status: 'success',
      finished_at: nowIso(),
      raw_count: 1,
      normalized_count: asset.skus.length,
      warning_count: 0,
      request_count: 2,
      success_count: 2,
      record_count: 1,
      error_type: null,
      error_message: null,
    });

    await writeLastResult(result);
    return result;
  } catch (error) {
    updateSourceJob(db, jobId, {
      job_status: 'failed',
      finished_at: nowIso(),
      raw_count: 0,
      normalized_count: 0,
      warning_count: 0,
      request_count: 0,
      success_count: 0,
      record_count: 0,
      error_type: error.errorType || 'unknown',
      error_message: error.message,
    });

    const result = {
      ok: false,
      status: 'failed',
      target: PRODUCT_CONTENT_TARGET.pageType,
      jobId,
      productId,
      capturedAt,
      errorType: error.errorType || 'unknown',
      message: error.message,
    };
    await writeLastResult(result);
    throw error;
  } finally {
    if (context) await context.close().catch(() => {});
    db.close();
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const result = await captureProductContentAssets(args);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(JSON.stringify(summarizeResult(result), null, 2));
  }
}
