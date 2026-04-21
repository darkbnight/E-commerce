import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'data', 'menglar-industry', 'deep-dive');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'priority-subcategories.json');
const PROFILE_COPY = path.join(ROOT, '.cache', 'ziniao-profile-copy-stable');
const SOURCE_PROFILE =
  process.env.ZINIAO_PROFILE_DIR ||
  'C:\\Users\\Administrator\\AppData\\Roaming\\ziniaobrowser\\userdata\\chrome_27468535116866';
const USER_DATA_DEFAULT_DIR = path.join(SOURCE_PROFILE, 'Default');
const CHROME_EXECUTABLE_PATH =
  process.env.CHROME_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TARGET_URL = 'https://ozon.menglar.com/workbench/industry/general';
const MENGLAR_ORIGIN = 'https://ozon.menglar.com';
const INDUSTRY_VIEW_API = '/api/ozon-report-service/v1/bigDisc/industryViewV2';

const TARGET_CATEGORIES = [
  { name: '清洗设备', catId: 17028718, catLevel: 2 },
  { name: '床上用品', catId: 17028731, catLevel: 2 },
  { name: '食物贮藏', catId: 17027933, catLevel: 2 },
];

function decodeLatin1(buffer) {
  return Buffer.from(buffer).toString('latin1');
}

function findStructuredAsciiValues(content, key, pattern = /.{1,400}/) {
  const values = [];
  let index = content.indexOf(key);

  while (index >= 0) {
    const firstSeparator = content.indexOf('\x01', index + key.length);
    if (firstSeparator >= 0 && firstSeparator - index - key.length <= 64) {
      const secondSeparator = content.indexOf('\x01', firstSeparator + 1);
      if (secondSeparator >= 0 && secondSeparator - firstSeparator <= 64) {
        const valueStart = secondSeparator + 1;
        let valueEnd = valueStart;
        while (valueEnd < content.length) {
          const code = content.charCodeAt(valueEnd);
          if (code < 32 || code > 126) break;
          valueEnd += 1;
        }
        const value = content.slice(valueStart, valueEnd);
        if (pattern.test(value)) values.push(value);
      }
    }
    index = content.indexOf(key, index + key.length);
  }

  return values;
}

function normalizeBase64Candidate(value) {
  if (!value) return value;
  const firstPadIndex = value.indexOf('=');
  let normalized = value;
  if (firstPadIndex >= 0) {
    let padEnd = firstPadIndex;
    while (padEnd < value.length && value[padEnd] === '=') padEnd += 1;
    normalized = value.slice(0, padEnd);
  }
  while (normalized.length % 4 !== 0) normalized = normalized.slice(0, -1);
  return normalized;
}

async function safeReadBuffer(filePath) {
  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}

async function extractRuntimeStorage() {
  const localStorageFiles = [
    path.join(USER_DATA_DEFAULT_DIR, 'Local Storage', 'leveldb', '024974.ldb'),
    path.join(USER_DATA_DEFAULT_DIR, 'Local Storage', 'leveldb', '024711.ldb'),
  ];

  const localStorage = {};
  const sessionStorage = {};

  for (const filePath of localStorageFiles) {
    const buffer = await safeReadBuffer(filePath);
    if (!buffer) continue;
    const content = decodeLatin1(buffer);

    const originStart = content.indexOf('_https://ozon.menglar.com');
    const originCandidates = filePath.endsWith('024711.ldb') && originStart >= 0
      ? [...content.slice(originStart, originStart + 2000).matchAll(/[A-Za-z0-9+/=]{40,}/g)]
          .map((item) => normalizeBase64Candidate(item[0]))
          .filter((item) => item.length >= 40)
      : [];

    if (!localStorage['PRODUCTION__2.8.0__COMMON__LOCAL__KEY__'] && originCandidates[0]) {
      localStorage['PRODUCTION__2.8.0__COMMON__LOCAL__KEY__'] = originCandidates[0];
    }
    if (!localStorage.USER__EXPAND__ && originCandidates[1]) {
      localStorage.USER__EXPAND__ = originCandidates[1];
      localStorage['PRODUCTION__2.8.0__USER__EXPAND__'] = originCandidates[1];
    }

    const commonMatches = findStructuredAsciiValues(
      content,
      'PRODUCTION__2.8.0__COMMON__LOCAL__KEY__',
      /^[A-Za-z0-9+/=]{80,}$/
    );
    if (!localStorage['PRODUCTION__2.8.0__COMMON__LOCAL__KEY__'] && commonMatches[0]) {
      localStorage['PRODUCTION__2.8.0__COMMON__LOCAL__KEY__'] = commonMatches[0];
    }

    const userExpandMatches = findStructuredAsciiValues(content, 'USER__EXPAND__', /^[A-Za-z0-9+/=]{60,}$/);
    if (!localStorage.USER__EXPAND__ && userExpandMatches[0]) {
      localStorage.USER__EXPAND__ = userExpandMatches[0];
      localStorage['PRODUCTION__2.8.0__USER__EXPAND__'] = userExpandMatches[0];
    }
  }

  return { localStorage, sessionStorage };
}

async function injectRuntimeStorage(context, runtimeStorage) {
  await context.addInitScript((payload) => {
    if (location.origin !== payload.origin) return;
    for (const [key, value] of Object.entries(payload.localStorage)) {
      if (value != null) window.localStorage.setItem(key, value);
    }
    for (const [key, value] of Object.entries(payload.sessionStorage)) {
      if (value != null) window.sessionStorage.setItem(key, value);
    }
  }, { origin: MENGLAR_ORIGIN, ...runtimeStorage });
}

function sanitizeHeaders(headers) {
  const result = {};
  for (const key of ['accept', 'content-type', 'control-t', 'referer', 'user-agent', 'x-risk-dida']) {
    if (headers[key]) result[key] = headers[key];
  }
  return result;
}

async function main() {
  if (!existsSync(PROFILE_COPY)) throw new Error(`未找到浏览器 Profile 副本: ${PROFILE_COPY}`);
  if (!existsSync(CHROME_EXECUTABLE_PATH)) throw new Error(`未找到 Chrome: ${CHROME_EXECUTABLE_PATH}`);

  await mkdir(OUTPUT_DIR, { recursive: true });
  const runtimeStorage = await extractRuntimeStorage();
  const capturedBusinessHeaders = [];

  const context = await chromium.launchPersistentContext(PROFILE_COPY, {
    executablePath: CHROME_EXECUTABLE_PATH,
    headless: false,
    viewport: { width: 1440, height: 900 },
  });

  try {
    await injectRuntimeStorage(context, runtimeStorage);
    context.on('request', (request) => {
      const url = request.url();
      if (!url.includes('/api/ozon-report-service/v1/')) return;
      const headers = request.headers();
      if (!headers.authorization) return;
      capturedBusinessHeaders.push(headers);
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(8000);

    const latestHeaders = [...capturedBusinessHeaders].reverse().find((headers) => headers.authorization);
    if (!latestHeaders) throw new Error('未捕获到萌啦业务接口 Authorization，请确认登录态有效');

    const fetchHeaders = {
      ...sanitizeHeaders(latestHeaders),
      authorization: latestHeaders.authorization,
      'content-type': 'application/json',
      referer: TARGET_URL,
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
      });
    }

    const output = {
      capturedAt: new Date().toISOString(),
      sourcePage: TARGET_URL,
      api: INDUSTRY_VIEW_API,
      categories: results,
    };
    await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

    console.log(JSON.stringify({
      output: OUTPUT_PATH,
      categories: results.map((item) => ({
        name: item.category.name,
        status: item.response.status,
        code: item.response.json?.code,
        keys: item.response.json?.data ? Object.keys(item.response.json.data) : [],
      })),
    }, null, 2));
  } finally {
    await context.close().catch(() => {});
  }
}

await main();
