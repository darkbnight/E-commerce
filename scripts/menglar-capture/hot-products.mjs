import { mkdir, copyFile, readdir, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';
import { ensureSourceJobsSchema } from './lib/job-store.mjs';
import { runPreflight } from './preflight.mjs';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data', 'menglar-mvp');
const DB_DIR = path.join(ROOT, 'db');
const DB_PATH = path.join(DB_DIR, 'ecommerce-workbench.sqlite');
const REPORT_PATH = path.join(DATA_DIR, 'last-run.json');
const CAPTURED_JSON_PATH = path.join(DATA_DIR, 'captured-json-full.json');
const SCREENSHOT_PATH = path.join(DATA_DIR, 'dashboard.png');
const STABLE_PROFILE_COPY = path.join(ROOT, '.cache', 'ziniao-profile-copy-stable');

const SOURCE_PROFILE =
  process.env.ZINIAO_PROFILE_DIR ||
  'C:\\Users\\Administrator\\AppData\\Roaming\\ziniaobrowser\\userdata\\chrome_27468535116866';

const ZINIAO_EXECUTABLE_PATH =
  process.env.ZINIAO_EXECUTABLE_PATH ||
  'C:\\Users\\Administrator\\AppData\\Roaming\\ziniaobrowser\\env-kit\\Core\\chrome_64_142.1.2.74\\ziniaobrowser.exe';

const CHROME_EXECUTABLE_PATH =
  process.env.CHROME_EXECUTABLE_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const TARGET_URL =
  process.env.MENGLAR_TARGET_URL ||
  'https://ozon.menglar.com/workbench/selection/hot?catId=17027489';

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const HOT_PAGE_SIZE = readPositiveInt(
  process.env.MENGLAR_PAGE_SIZE || process.env.MENGLAR_MAX_RECORDS,
  50,
);
const MAX_RECORDS = readPositiveInt(process.env.MENGLAR_MAX_RECORDS, HOT_PAGE_SIZE);
const HOT_DATE_TYPE = process.env.MENGLAR_DATE_TYPE || 'TWENTY_EIGHT_DAY';
const FORCED_HOT_CAT_ID = process.env.MENGLAR_HOT_CAT_ID || '';
const FORCED_HOT_TYPE_ID = process.env.MENGLAR_HOT_TYPE_ID || '';
const FORCED_HOT_CAT_LEVEL = Number.parseInt(process.env.MENGLAR_HOT_CAT_LEVEL || '3', 10);

const MENGLAR_ORIGIN = 'https://ozon.menglar.com';
const USER_DATA_DEFAULT_DIR = path.join(SOURCE_PROFILE, 'Default');
const HOT_PAGE_API_PATH = '/api/ozon-report-service/v1/itemRanking/hotPage';
const INDUSTRY_GENERAL_PATH = '/workbench/industry/general';
const PROFILE_COPY_RELATIVE_PATHS = [
  'Local State',
  path.join('Default', 'Preferences'),
  path.join('Default', 'Secure Preferences'),
  path.join('Default', 'Network'),
  path.join('Default', 'Local Storage'),
  path.join('Default', 'Session Storage'),
  path.join('Default', 'IndexedDB'),
  path.join('Default', 'WebStorage'),
  path.join('Default', 'Extension Cookies'),
  path.join('Default', 'Extensions'),
  path.join('Default', 'Extension State'),
];

function getTargetPageMeta(targetUrl) {
  if (targetUrl.includes(INDUSTRY_GENERAL_PATH)) {
    return {
      pageName: '萌拉行业数据',
      pageType: 'industry_general',
      paginationMode: 'api_capture',
    };
  }

  return {
    pageName: '萌拉热销产品',
    pageType: 'hot_products',
    paginationMode: 'paged',
  };
}

const EXCLUDE_DIRS = new Set([
  'Cache',
  'Code Cache',
  'GPUCache',
  'GrShaderCache',
  'GraphiteDawnCache',
  'ShaderCache',
  'Crashpad',
  'BrowserMetrics',
  'component_crx_cache',
]);

function nowIso() {
  return new Date().toISOString();
}

function decodeLatin1(buffer) {
  return Buffer.from(buffer).toString('latin1');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findPrintableValue(content, key, pattern = '[^\\x00-\\x1f]{1,400}') {
  const regex = new RegExp(`${escapeRegex(key)}[\\x00-\\x1f]+(${pattern})`);
  const match = content.match(regex);
  return match ? match[1] : null;
}

function findStructuredAsciiValues(content, key, pattern = /.{1,400}/) {
  const values = [];
  let index = content.indexOf(key);

  while (index >= 0) {
    let cursor = index + key.length;
    const firstSeparator = content.indexOf('\x01', cursor);
    if (firstSeparator >= 0 && firstSeparator - cursor <= 64) {
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
        if (pattern.test(value)) {
          values.push(value);
        }
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
    while (padEnd < value.length && value[padEnd] === '=') {
      padEnd += 1;
    }
    normalized = value.slice(0, padEnd);
  }
  while (normalized.length % 4 !== 0) {
    normalized = normalized.slice(0, -1);
  }
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
  const sessionStorageFiles = [
    path.join(USER_DATA_DEFAULT_DIR, 'Local Storage', 'leveldb', '024972.ldb'),
  ];

  const localStorage = {};
  const sessionStorage = {};
  const debug = {
    localStorageSources: [],
    sessionStorageSources: [],
  };

  for (const filePath of localStorageFiles) {
    const buffer = await safeReadBuffer(filePath);
    if (!buffer) continue;
    debug.localStorageSources.push(path.basename(filePath));
    const content = decodeLatin1(buffer);

    const originCandidates = filePath.endsWith('024711.ldb')
      ? [...content
          .slice(content.indexOf('_https://ozon.menglar.com'), content.indexOf('_https://ozon.menglar.com') + 2000)
          .matchAll(/[A-Za-z0-9+/=]{40,}/g)]
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
    if (!localStorage['PRODUCTION__2.8.0__COMMON__LOCAL__KEY__'] && commonMatches.length > 0) {
      const commonLocalKey = commonMatches[0];
      localStorage['PRODUCTION__2.8.0__COMMON__LOCAL__KEY__'] = commonLocalKey;
    }

    const userExpandMatches = findStructuredAsciiValues(
      content,
      'USER__EXPAND__',
      /^[A-Za-z0-9+/=]{60,}$/
    );
    if (!localStorage.USER__EXPAND__ && userExpandMatches.length > 0) {
      const userExpand = userExpandMatches[0];
      localStorage.USER__EXPAND__ = userExpand;
      localStorage['PRODUCTION__2.8.0__USER__EXPAND__'] = userExpand;
    }
  }

  for (const filePath of sessionStorageFiles) {
    const buffer = await safeReadBuffer(filePath);
    if (!buffer) continue;
    debug.sessionStorageSources.push(path.basename(filePath));
    const content = decodeLatin1(buffer);

    const sLogin = findStructuredAsciiValues(content, 'sLogin', /^(true|false)$/)[0] ?? null;
    const token = findStructuredAsciiValues(content, 'token', /^[A-Za-z0-9]{32,256}$/)[0] ?? null;
    const userName = findStructuredAsciiValues(content, 'userName', /^[A-Za-z0-9@._+-]{3,128}$/)[0] ?? null;
    const notification = findStructuredAsciiValues(content, 'notification', /^[0-9]+$/)[0] ?? null;
    const visibleA = findStructuredAsciiValues(content, 'visibleA', /^(true|false)$/)[0] ?? null;
    const sId = findStructuredAsciiValues(content, 'sId', /^(null|[A-Za-z0-9_-]{1,128})$/)[0] ?? null;

    if (sLogin) sessionStorage.sLogin = sLogin;
    if (token) sessionStorage.token = token;
    if (userName) sessionStorage.userName = userName;
    if (notification) sessionStorage.notification = notification;
    if (visibleA) sessionStorage.visibleA = visibleA;
    if (sId) sessionStorage.sId = sId;
  }

  return { localStorage, sessionStorage, debug };
}

async function ensureDb() {
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_name TEXT NOT NULL,
      page_url TEXT NOT NULL,
      page_type TEXT NOT NULL,
      pagination_mode TEXT NOT NULL,
      job_status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      raw_count INTEGER NOT NULL DEFAULT 0,
      normalized_count INTEGER NOT NULL DEFAULT 0,
      warning_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products_raw (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      record_key TEXT NOT NULL,
      raw_payload TEXT NOT NULL,
      parse_status TEXT NOT NULL,
      parse_error TEXT,
      captured_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(job_id, record_key)
    );

    CREATE TABLE IF NOT EXISTS product_business_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      raw_record_id INTEGER,
      platform TEXT NOT NULL DEFAULT 'ozon',
      platform_product_id TEXT NOT NULL,
      product_url TEXT,
      product_type TEXT,
      brand TEXT,
      title TEXT,
      category_level_1 TEXT,
      category_level_2 TEXT,
      category_level_3 TEXT,
      sales_volume REAL,
      sales_growth REAL,
      potential_index REAL,
      sales_amount REAL,
      add_to_cart_rate REAL,
      impressions REAL,
      clicks REAL,
      view_rate REAL,
      ad_cost REAL,
      ad_cost_rate REAL,
      order_conversion_rate REAL,
      estimated_gross_margin REAL,
      shipping_mode TEXT,
      delivery_time TEXT,
      average_sales_amount REAL,
      length_cm REAL,
      width_cm REAL,
      height_cm REAL,
      weight_g REAL,
      parse_status TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(job_id, platform, platform_product_id)
    );

    CREATE TABLE IF NOT EXISTS product_content_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL DEFAULT 'ozon',
      platform_product_id TEXT NOT NULL,
      product_url TEXT,
      source_job_id INTEGER,
      source_snapshot_id INTEGER,
      title TEXT,
      description TEXT,
      attributes_json TEXT,
      tags_json TEXT,
      main_image_url TEXT,
      image_urls_json TEXT,
      downloaded_images_json TEXT,
      content_hash TEXT,
      content_status TEXT NOT NULL DEFAULT 'pending',
      captured_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(platform, platform_product_id, content_hash)
    );

    CREATE INDEX IF NOT EXISTS idx_product_business_snapshots_job
    ON product_business_snapshots(job_id);

    CREATE INDEX IF NOT EXISTS idx_product_business_snapshots_product
    ON product_business_snapshots(platform, platform_product_id);

    CREATE INDEX IF NOT EXISTS idx_product_content_assets_product
    ON product_content_assets(platform, platform_product_id);
  `);
  ensureSourceJobsSchema(db);
  return db;
}

function isLockedSqlite(name) {
  return name === 'Cookies' || name === 'History' || name === 'Web Data' || name === 'Login Data';
}

async function sqliteBackup(src, dest) {
  const python = `
import sqlite3, sys
src, dest = sys.argv[1], sys.argv[2]
source = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
target = sqlite3.connect(dest)
source.backup(target)
target.close()
source.close()
`;

  await new Promise((resolve, reject) => {
    const child = spawn('python', ['-c', python, src, dest], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr || `sqlite backup failed: ${src}`));
    });
    child.on('error', reject);
  });
}

async function copyFileWithFallback(srcPath, destPath) {
  await mkdir(path.dirname(destPath), { recursive: true });

  if (isLockedSqlite(path.basename(srcPath))) {
    try {
      await sqliteBackup(srcPath, destPath);
      return;
    } catch {
      try {
        await copyFile(srcPath, destPath);
        return;
      } catch {
        return;
      }
    }
  }

  try {
    await copyFile(srcPath, destPath);
  } catch (error) {
    if (error && error.code === 'EBUSY') return;
    throw error;
  }
}

async function copyProfileTree(src, dest) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.name === 'lockfile') continue;
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    if (entry.name.endsWith('-journal') || entry.name.endsWith('-wal') || entry.name.endsWith('-shm')) continue;

    if (entry.isDirectory()) {
      await copyProfileTree(srcPath, destPath);
      continue;
    }

    await copyFileWithFallback(srcPath, destPath);
  }
}

async function copyProfileSelection(srcRoot, destRoot) {
  await mkdir(destRoot, { recursive: true });
  for (const relativePath of PROFILE_COPY_RELATIVE_PATHS) {
    const srcPath = path.join(srcRoot, relativePath);
    const destPath = path.join(destRoot, relativePath);
    if (!existsSync(srcPath)) continue;
    const sourceStat = await stat(srcPath);
    if (sourceStat.isDirectory()) {
      await copyProfileTree(srcPath, destPath);
    } else {
      await copyFileWithFallback(srcPath, destPath);
    }
  }
}

function isProfileCopyUsable(profileCopy) {
  const requiredPaths = [
    path.join(profileCopy, 'Default', 'Local Storage'),
    path.join(profileCopy, 'Default', 'Session Storage'),
    path.join(profileCopy, 'Default', 'Network'),
  ];
  return requiredPaths.every((item) => existsSync(item));
}

async function resetProfileCopy() {
  const refresh = process.env.MENGLAR_REFRESH_PROFILE === '1';
  if (
    refresh ||
    !existsSync(path.join(STABLE_PROFILE_COPY, 'Local State')) ||
    !isProfileCopyUsable(STABLE_PROFILE_COPY)
  ) {
    await rm(STABLE_PROFILE_COPY, { recursive: true, force: true });
    await copyProfileSelection(SOURCE_PROFILE, STABLE_PROFILE_COPY);
  }
  return STABLE_PROFILE_COPY;
}

function insertJob(db) {
  const ts = nowIso();
  const pageMeta = getTargetPageMeta(TARGET_URL);
  const stmt = db.prepare(`
    INSERT INTO source_jobs (
      page_name, page_url, page_type, pagination_mode,
      job_status, started_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    pageMeta.pageName,
    TARGET_URL,
    pageMeta.pageType,
    pageMeta.paginationMode,
    'running',
    ts,
    ts,
    ts,
  );
  return Number(result.lastInsertRowid);
}

function updateJob(db, jobId, fields) {
  ensureSourceJobsSchema(db);
  const merged = {
    job_status: fields.job_status ?? 'running',
    finished_at: fields.finished_at ?? null,
    raw_count: fields.raw_count ?? 0,
    normalized_count: fields.normalized_count ?? 0,
    warning_count: fields.warning_count ?? 0,
    error_message: fields.error_message ?? null,
    request_count: fields.request_count ?? 0,
    success_count: fields.success_count ?? 0,
    record_count: fields.record_count ?? 0,
    error_type: fields.error_type ?? null,
    updated_at: nowIso(),
  };
  db.prepare(`
    UPDATE source_jobs
    SET job_status = ?,
        finished_at = ?,
        raw_count = ?,
        normalized_count = ?,
        warning_count = ?,
        error_message = ?,
        request_count = ?,
        success_count = ?,
        record_count = ?,
        error_type = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    merged.job_status,
    merged.finished_at,
    merged.raw_count,
    merged.normalized_count,
    merged.warning_count,
    merged.error_message,
    merged.request_count,
    merged.success_count,
    merged.record_count,
    merged.error_type,
    merged.updated_at,
    jobId,
  );
}

function classifyCaptureError(error) {
  const message = String(error?.message || error || '');
  if (error?.errorType) return error.errorType;
  if (message.includes('游客')) return 'guest_blocked';
  if (message.includes('登录')) return 'login_required';
  if (message.includes('Chrome') || message.includes('浏览器') || message.includes('EPERM')) return 'browser_blocked';
  if (message.includes('sqlite') || message.includes('database')) return 'db_error';
  return 'unknown';
}

function summarizeRuntimeStorage(runtimeStorage) {
  return {
    localStorageKeys: Object.keys(runtimeStorage.localStorage || {}).sort(),
    sessionStorageKeys: Object.keys(runtimeStorage.sessionStorage || {}).sort(),
    debug: runtimeStorage.debug || null,
  };
}

function pickFetchHeaders(headers) {
  const result = {
    accept: 'application/json, text/plain, */*',
    'content-type': 'application/json',
  };
  for (const key of ['authorization', 'control-t', 'x-risk-dida']) {
    if (headers?.[key]) result[key] = headers[key];
  }
  return result;
}

function toNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[,%\s]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function splitCategoryLevels(payload) {
  const categoryText = payload.catNameCn ?? payload.catName ?? payload.catNameEn ?? null;
  if (!categoryText) {
    return {
      level1: null,
      level2: null,
      level3: null,
    };
  }
  const parts = String(categoryText).split('>').map((item) => item.trim()).filter(Boolean);
  return {
    level1: parts[0] ?? null,
    level2: parts[1] ?? null,
    level3: parts[2] ?? null,
  };
}

function mapSkuLocationToProductType(value) {
  if (value === 1 || value === '1') return '本土';
  if (value === 2 || value === '2') return '跨境';
  return value == null ? null : String(value);
}

function normalizeCandidate(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const categories = splitCategoryLevels(payload);
  const rawId =
    payload.ozon_product_id ??
    payload.ozonProductId ??
    payload.skuId ??
    payload.productId ??
    payload.product_id ??
    payload.itemId ??
    payload.item_id ??
    payload.sku_id ??
    payload.id;

  if (rawId == null || rawId === '') return null;

  return {
    ozon_product_id: String(rawId),
    product_type:
      payload.product_type ??
      payload.productType ??
      mapSkuLocationToProductType(payload.skuLocation) ??
      payload.bizType ??
      payload.type ??
      null,
    brand: payload.brand ?? payload.brandName ?? null,
    category_level_1: payload.category_level_1 ?? payload.category1 ?? categories.level1 ?? null,
    category_level_2: payload.category_level_2 ?? payload.category2 ?? categories.level2 ?? null,
    category_level_3: payload.category_level_3 ?? payload.category3 ?? categories.level3 ?? null,
    sales: toNumber(payload.sales ?? payload.saleCount ?? payload.salesVolume ?? payload.monthSales),
    sales_growth: toNumber(payload.sales_growth ?? payload.salesGrowth ?? payload.saleGrowth ?? payload.monthSalesRatio),
    potential_index: toNumber(payload.potential_index ?? payload.potentialIndex ?? payload.chanceExp),
    revenue: toNumber(payload.revenue ?? payload.salesAmount ?? payload.amount ?? payload.monthGmv),
    add_to_cart_rate: toNumber(payload.add_to_cart_rate ?? payload.addCartRate ?? payload.convTocartPdp),
    impressions: toNumber(payload.impressions ?? payload.exposure ?? payload.exposureCount ?? payload.views),
    clicks: toNumber(payload.clicks ?? payload.clickCount ?? payload.sessionCount),
    view_rate: toNumber(payload.view_rate ?? payload.clickRate ?? payload.ctr ?? payload.clickRatio),
    ad_cost: toNumber(payload.ad_cost ?? payload.adCost ?? payload.adsales),
    ad_cost_rate: toNumber(payload.ad_cost_rate ?? payload.adCostRate ?? payload.drr),
    order_conversion_rate: toNumber(
      payload.order_conversion_rate ?? payload.orderConversionRate ?? payload.conversionRate ?? payload.convViewToOrder
    ),
    estimated_gross_margin: toNumber(
      payload.estimated_gross_margin ?? payload.estimatedGrossMargin ?? payload.grossMargin ?? payload.gpm
    ),
    shipping_mode: payload.shipping_mode ?? payload.shippingMode ?? payload.deliveryMode ?? payload.sources ?? null,
    delivery_time: payload.delivery_time ?? payload.deliveryTime ?? payload.avgDeliveryTime ?? null,
    average_sales_amount: toNumber(payload.average_sales_amount ?? payload.avgSalesAmount ?? payload.averageAmount ?? payload.dayAvgGmv),
    length_cm: toNumber(payload.length_cm ?? payload.length ?? payload.len ?? payload.dimensionsLength),
    width_cm: toNumber(payload.width_cm ?? payload.width ?? payload.dimensionsWidth),
    height_cm: toNumber(payload.height_cm ?? payload.height ?? payload.dimensionsHeight),
    weight_g: toNumber(
      payload.weight_g ??
      payload.weightGram ??
      (payload.weight != null && payload.weight !== '' ? Number(payload.weight) * 1000 : null)
    ),
  };
}

function flattenRecords(input, acc = []) {
  if (Array.isArray(input)) {
    for (const item of input) flattenRecords(item, acc);
    return acc;
  }

  if (!input || typeof input !== 'object') return acc;

  const candidate = normalizeCandidate(input);
  if (candidate) {
    acc.push({ raw: input, normalized: candidate });
  }

  for (const value of Object.values(input)) {
    if (value && typeof value === 'object') {
      flattenRecords(value, acc);
    }
  }

  return acc;
}

function collectAnchorHints(pageData) {
  return pageData
    .map((item) => ({
      text: item.text.trim(),
      href: item.href,
    }))
    .filter((item) => item.text || item.href)
    .slice(0, 30);
}

async function injectRuntimeStorage(context, runtimeStorage) {
  await context.addInitScript((payload) => {
    if (location.origin !== payload.origin) return;

    for (const [key, value] of Object.entries(payload.localStorage)) {
      if (value != null) {
        window.localStorage.setItem(key, value);
      }
    }

    for (const [key, value] of Object.entries(payload.sessionStorage)) {
      if (value != null) {
        window.sessionStorage.setItem(key, value);
      }
    }
  }, {
    origin: MENGLAR_ORIGIN,
    localStorage: runtimeStorage.localStorage,
    sessionStorage: runtimeStorage.sessionStorage,
  });
}

async function main() {
  if (!existsSync(SOURCE_PROFILE)) {
    throw new Error(`未找到紫鸟用户目录: ${SOURCE_PROFILE}`);
  }

  const preflight = await runPreflight({ target: 'hot_products', writeResult: true });
  if (!preflight.ok) {
    console.log(JSON.stringify(preflight, null, 2));
    process.exitCode = 1;
    return;
  }

  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(DB_DIR, { recursive: true });
  await mkdir(path.join(ROOT, '.cache'), { recursive: true });

  const db = await ensureDb();
  const jobId = insertJob(db);
  const report = {
    jobId,
    startedAt: nowIso(),
    targetUrl: TARGET_URL,
    executableCandidates: [ZINIAO_EXECUTABLE_PATH, CHROME_EXECUTABLE_PATH],
    executablePath: null,
    sourceProfile: SOURCE_PROFILE,
    copiedProfile: null,
    runtimeStorage: null,
    loginDetected: false,
    loginExpiredDetected: false,
    guestBlockedDetected: false,
    pageTitle: null,
    pageUrl: null,
    openPages: [],
    anchorHints: [],
    capturedResponses: [],
    apiRequestHeaders: [],
    rawInserted: 0,
    normalizedInserted: 0,
    warningCount: 0,
  };

  try {
    const runtimeStorage = await extractRuntimeStorage();
    report.runtimeStorage = summarizeRuntimeStorage(runtimeStorage);

    const profileCopy = await resetProfileCopy();
    report.copiedProfile = profileCopy;

    const candidates = [CHROME_EXECUTABLE_PATH].filter((item) => existsSync(item));
    if (candidates.length === 0) {
      throw new Error('未找到可用浏览器内核，紫鸟内核和系统 Chrome 都不可用');
    }

    let context = null;
    const launchErrors = [];
    for (const executablePath of candidates) {
      try {
        context = await chromium.launchPersistentContext(profileCopy, {
          executablePath,
          headless: false,
          args: ['--restore-last-session'],
          viewport: { width: 1440, height: 900 },
        });
        report.executablePath = executablePath;
        break;
      } catch (error) {
        launchErrors.push(`${executablePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (!context) {
      throw new Error(`浏览器启动失败: ${launchErrors.join(' | ')}`);
    }

    await injectRuntimeStorage(context, runtimeStorage);

    const capturedJson = [];
    context.on('request', (request) => {
      const url = request.url();
      if (!url.includes('menglar.com') || !url.includes('/api/')) return;
      report.apiRequestHeaders.push({
        url,
        method: request.method(),
        headers: request.headers(),
        postData: request.postData(),
      });
    });
    context.on('response', async (response) => {
      const url = response.url();
      const headers = response.headers();
      const contentType = headers['content-type'] || '';
      if (!url.includes('menglar.com')) return;
      if (!contentType.includes('json')) return;
      try {
        const data = await response.json();
        capturedJson.push({
          url,
          status: response.status(),
          data,
        });
      } catch {
        report.warningCount += 1;
      }
    });

    let page = context.pages()[0] || null;
    const extraPages = context.pages().slice(1);
    for (const existingPage of extraPages) {
      await existingPage.close().catch(() => {});
    }
    if (!page) {
      page = await context.newPage();
    }
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(10000);

    report.pageTitle = await page.title();
    report.pageUrl = page.url();
    report.openPages = await Promise.all(
      context.pages().map(async (currentPage) => ({
        title: await currentPage.title(),
        url: currentPage.url(),
      })),
    );

    const bodyText = await page.locator('body').innerText().catch(() => '');
    const expiredPhrases = [
      '您未登录或登录状态已过期',
      '请重新登录',
      '未登录',
    ];
    const guestPhrases = [
      '您当前为 游客 角色',
      '无法访问功能',
      '登录/注册',
    ];
    report.loginExpiredDetected = expiredPhrases.some((item) => bodyText.includes(item));
    report.guestBlockedDetected = guestPhrases.some((item) => bodyText.includes(item));
    report.loginDetected = !report.loginExpiredDetected && !report.guestBlockedDetected;

    const anchors = await page.locator('a').evaluateAll((nodes) =>
      nodes.map((node) => ({
        text: node.textContent || '',
        href: node.href || '',
      })),
    );
    report.anchorHints = collectAnchorHints(anchors);

    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
    await page.waitForTimeout(3000);

    if (FORCED_HOT_CAT_ID) {
      const latestBusinessHeaders = [...report.apiRequestHeaders]
        .reverse()
        .find((item) => item.headers?.authorization);
      if (!latestBusinessHeaders) {
        throw new Error('未捕获到可复用的萌拉业务接口 Authorization，无法按指定类目采集热销商品');
      }

      const forcedBody = {
        catId: Number(FORCED_HOT_CAT_ID),
        currentCatId: String(FORCED_HOT_CAT_ID),
        catLevel: Number.isFinite(FORCED_HOT_CAT_LEVEL) ? FORCED_HOT_CAT_LEVEL : 3,
        pageNum: 1,
        pageSize: HOT_PAGE_SIZE > 0 ? HOT_PAGE_SIZE : 50,
        dateType: HOT_DATE_TYPE,
      };
      if (FORCED_HOT_TYPE_ID) {
        forcedBody.typeId = Number(FORCED_HOT_TYPE_ID);
      }

      const forcedData = await page.evaluate(async ({ apiPath, headers, body }) => {
        const response = await fetch(apiPath, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
        return {
          status: response.status,
          data: await response.json(),
        };
      }, {
        apiPath: HOT_PAGE_API_PATH,
        headers: pickFetchHeaders(latestBusinessHeaders.headers),
        body: forcedBody,
      });

      capturedJson.push({
        url: `${MENGLAR_ORIGIN}${HOT_PAGE_API_PATH}?manualCatId=${encodeURIComponent(FORCED_HOT_CAT_ID)}`,
        status: forcedData.status,
        data: forcedData.data,
      });
      report.forcedHotCategory = {
        catId: String(FORCED_HOT_CAT_ID),
        typeId: FORCED_HOT_TYPE_ID || null,
        catLevel: forcedBody.catLevel,
        dateType: forcedBody.dateType,
        pageSize: forcedBody.pageSize,
        status: forcedData.status,
        code: forcedData.data?.code,
      };
    }

    report.capturedResponses = capturedJson.map((item) => ({
      url: item.url,
      status: item.status,
      topLevelKeys: item.data && typeof item.data === 'object' ? Object.keys(item.data).slice(0, 20) : [],
    }));
    report.apiRequestHeaders = report.apiRequestHeaders.slice(0, 20).map((item) => ({
      url: item.url,
      method: item.method,
      postData: item.postData,
      headerKeys: Object.keys(item.headers).sort(),
      authorization: item.headers.authorization ? '[redacted]' : null,
      token: item.headers.token ? '[redacted]' : null,
    }));

    const rawInsert = db.prepare(`
      INSERT OR IGNORE INTO products_raw (
        job_id, record_key, raw_payload, parse_status, parse_error, captured_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const businessSnapshotInsert = db.prepare(`
      INSERT OR IGNORE INTO product_business_snapshots (
        job_id, raw_record_id, platform, platform_product_id, product_type, brand,
        category_level_1, category_level_2, category_level_3,
        sales_volume, sales_growth, potential_index, sales_amount, add_to_cart_rate, impressions, clicks, view_rate,
        ad_cost, ad_cost_rate, order_conversion_rate, estimated_gross_margin, shipping_mode, delivery_time,
        average_sales_amount, length_cm, width_cm, height_cm, weight_g, parse_status, captured_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const hotResponses = capturedJson.filter((response) => response.url.includes(HOT_PAGE_API_PATH));
    const responsesForInsert = FORCED_HOT_CAT_ID
      ? hotResponses.filter((response) => response.url.includes('manualCatId='))
      : hotResponses;

    for (const response of responsesForInsert) {
      const records = flattenRecords(response.data);
      for (const [index, record] of records.entries()) {
        if (MAX_RECORDS > 0 && report.normalizedInserted >= MAX_RECORDS) break;
        const ts = nowIso();
        const recordKey = `${response.url}#${record.normalized.ozon_product_id}#${index}`;
        const rawResult = rawInsert.run(
          jobId,
          recordKey,
          JSON.stringify(record.raw),
          'parsed',
          null,
          ts,
          ts,
        );
        const rawRecordId = Number(rawResult.lastInsertRowid || 0);
        report.rawInserted += rawResult.changes;

        const businessSnapshotResult = businessSnapshotInsert.run(
          jobId,
          rawRecordId || null,
          'ozon',
          record.normalized.ozon_product_id,
          record.normalized.product_type,
          record.normalized.brand,
          record.normalized.category_level_1,
          record.normalized.category_level_2,
          record.normalized.category_level_3,
          record.normalized.sales,
          record.normalized.sales_growth,
          record.normalized.potential_index,
          record.normalized.revenue,
          record.normalized.add_to_cart_rate,
          record.normalized.impressions,
          record.normalized.clicks,
          record.normalized.view_rate,
          record.normalized.ad_cost,
          record.normalized.ad_cost_rate,
          record.normalized.order_conversion_rate,
          record.normalized.estimated_gross_margin,
          record.normalized.shipping_mode,
          record.normalized.delivery_time,
          record.normalized.average_sales_amount,
          record.normalized.length_cm,
          record.normalized.width_cm,
          record.normalized.height_cm,
          record.normalized.weight_g,
          'partial',
          ts,
          ts,
          ts,
        );
        report.normalizedInserted += businessSnapshotResult.changes;
      }
      if (MAX_RECORDS > 0 && report.normalizedInserted >= MAX_RECORDS) break;
    }

    await context.close();

    const blockedMessage = report.loginExpiredDetected
      ? '检测到登录失效提示'
      : report.guestBlockedDetected
        ? '检测到游客态访问限制'
        : null;
    const businessCapturedJson = capturedJson.filter((item) =>
      item.url.includes('/api/ozon-report-service/v1/')
    );
    const successfulBusinessCapturedJson = businessCapturedJson.filter((item) =>
      item.status >= 200 && item.status < 300
    );

    updateJob(db, jobId, {
      job_status: blockedMessage ? 'failed' : 'success',
      finished_at: nowIso(),
      raw_count: report.rawInserted,
      normalized_count: report.normalizedInserted,
      warning_count: report.warningCount,
      request_count: businessCapturedJson.length,
      success_count: successfulBusinessCapturedJson.length,
      record_count: report.normalizedInserted,
      error_type: report.loginExpiredDetected ? 'login_required' : report.guestBlockedDetected ? 'guest_blocked' : null,
      error_message: blockedMessage,
    });

    report.finishedAt = nowIso();
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await writeFile(CAPTURED_JSON_PATH, `${JSON.stringify(businessCapturedJson, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    updateJob(db, jobId, {
      job_status: 'failed',
      finished_at: nowIso(),
      error_type: classifyCaptureError(error),
      error_message: error instanceof Error ? error.message : String(error),
    });
    const failedReport = {
      jobId,
      finishedAt: nowIso(),
      error: error instanceof Error ? error.message : String(error),
    };
    await writeFile(REPORT_PATH, `${JSON.stringify(failedReport, null, 2)}\n`, 'utf8');
    throw error;
  }
}

await main();
