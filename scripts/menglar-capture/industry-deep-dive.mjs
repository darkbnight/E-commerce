import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getTargetConfig } from './lib/constants.mjs';
import { launchMenglarContext } from './lib/browser-session.mjs';
import { extractRuntimeStorage } from './lib/preflight-checks.mjs';
import { insertSourceJob, nowIso, openMenglarDb, updateSourceJob } from './lib/job-store.mjs';
import { runPreflight } from './preflight.mjs';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'data', 'menglar-industry', 'deep-dive');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'priority-subcategories.json');
const INDUSTRY_VIEW_API = '/api/ozon-report-service/v1/bigDisc/industryViewV2';

const TARGET_CATEGORIES = [
  { name: '清洗设备', catId: 17028718, catLevel: 2 },
  { name: '床上用品', catId: 17028731, catLevel: 2 },
  { name: '食物贮藏', catId: 17027933, catLevel: 2 },
];

function sanitizeHeaders(headers) {
  const result = {};
  for (const key of ['accept', 'content-type', 'control-t', 'referer', 'user-agent', 'x-risk-dida']) {
    if (headers[key]) result[key] = headers[key];
  }
  return result;
}

function classifyError(error) {
  const message = String(error?.message || error || '');
  if (error?.errorType) return error.errorType;
  if (message.includes('Authorization')) return 'api_auth_missing';
  if (message.includes('游客')) return 'guest_blocked';
  if (message.includes('登录')) return 'login_required';
  if (message.includes('sqlite') || message.includes('database')) return 'db_error';
  if (message.includes('browser') || message.includes('Chrome') || message.includes('EPERM')) return 'browser_blocked';
  return 'unknown';
}

function countIndustryRecords(data) {
  if (!data || typeof data !== 'object') return 0;
  const seen = new Set();
  for (const value of Object.values(data)) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      const key = item?.catId || item?.currentCatId || item?.brandId || item?.name || JSON.stringify(item);
      if (key != null) seen.add(String(key));
    }
  }
  return seen.size;
}

async function captureIndustryData(page, targetUrl) {
  const capturedBusinessHeaders = [];
  page.context().on('request', (request) => {
    const url = request.url();
    if (!url.includes('/api/ozon-report-service/v1/')) return;
    const headers = request.headers();
    if (!headers.authorization) return;
    capturedBusinessHeaders.push(headers);
  });

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);

  const latestHeaders = [...capturedBusinessHeaders].reverse().find((headers) => headers.authorization);
  if (!latestHeaders) throw new Error('未捕获到萌拉业务接口 Authorization');

  const fetchHeaders = {
    ...sanitizeHeaders(latestHeaders),
    authorization: latestHeaders.authorization,
    'content-type': 'application/json',
    referer: targetUrl,
  };

  const results = [];
  for (const category of TARGET_CATEGORIES) {
    const payload = {
      catId: category.catId,
      currentCatId: String(category.catId),
      catLevel: category.catLevel,
      typeId: 0,
    };
    const data = await page.evaluate(async ({ apiPath, headers, body }) => {
      const response = await fetch(apiPath, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        json: await response.json(),
      };
    }, { apiPath: INDUSTRY_VIEW_API, headers: fetchHeaders, body: payload });

    results.push({
      category,
      request: payload,
      response: data,
      recordCount: countIndustryRecords(data.json?.data),
    });
  }

  return results;
}

export async function main() {
  const targetConfig = getTargetConfig('industry_general');
  const preflight = await runPreflight({ target: 'industry_general', writeResult: true });
  if (!preflight.ok) {
    console.log(JSON.stringify(preflight, null, 2));
    process.exitCode = 1;
    return;
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  const db = await openMenglarDb();
  const jobId = insertSourceJob(db, targetConfig);
  const runtimeStorage = await extractRuntimeStorage();
  let context;

  try {
    context = await launchMenglarContext({ runtimeStorage, headless: false });
    const page = context.pages()[0] || await context.newPage();
    const results = await captureIndustryData(page, targetConfig.targetUrl);
    const successCount = results.filter((item) => item.response.status >= 200 && item.response.status < 300).length;
    const recordCount = results.reduce((sum, item) => sum + item.recordCount, 0);

    const output = {
      capturedAt: nowIso(),
      sourcePage: targetConfig.targetUrl,
      api: INDUSTRY_VIEW_API,
      categories: results,
    };
    await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

    updateSourceJob(db, jobId, {
      job_status: successCount === TARGET_CATEGORIES.length ? 'success' : 'failed',
      finished_at: nowIso(),
      request_count: TARGET_CATEGORIES.length,
      success_count: successCount,
      record_count: recordCount,
      raw_count: recordCount,
      normalized_count: 0,
      warning_count: 0,
      error_type: successCount === TARGET_CATEGORIES.length ? null : 'unknown',
      error_message: successCount === TARGET_CATEGORIES.length ? null : '存在行业接口请求失败',
    });

    console.log(JSON.stringify({
      jobId,
      output: OUTPUT_PATH,
      requestCount: TARGET_CATEGORIES.length,
      successCount,
      recordCount,
      categories: results.map((item) => ({
        name: item.category.name,
        status: item.response.status,
        code: item.response.json?.code,
        recordCount: item.recordCount,
        keys: item.response.json?.data ? Object.keys(item.response.json.data) : [],
      })),
    }, null, 2));
  } catch (error) {
    updateSourceJob(db, jobId, {
      job_status: 'failed',
      finished_at: nowIso(),
      request_count: TARGET_CATEGORIES.length,
      success_count: 0,
      record_count: 0,
      raw_count: 0,
      normalized_count: 0,
      warning_count: 0,
      error_type: classifyError(error),
      error_message: error.message,
    });
    throw error;
  } finally {
    if (context) await context.close().catch(() => {});
    db.close();
  }
}

await main();
