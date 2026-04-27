import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  ERROR_ACTIONS,
  LOGIN_HEALTH_LAST_PATH,
  PREFLIGHT_DIR,
  getTargetConfig,
} from './constants.mjs';
import { getBrowserStatus, launchMenglarContext } from './browser-session.mjs';
import { ensureProfileCopy } from './profile-store.mjs';
import { extractRuntimeStorage, getPageAuthState } from './preflight-checks.mjs';

function actionFor(errorType) {
  return ERROR_ACTIONS[errorType] || ERROR_ACTIONS.unknown;
}

function buildResult(fields) {
  const errorType = fields.errorType || null;
  return {
    ok: Boolean(fields.ok),
    status: fields.status || (fields.ok ? 'ready' : 'blocked'),
    target: fields.target,
    targetUrl: fields.targetUrl,
    checkedAt: new Date().toISOString(),
    browser: fields.browser,
    profile: fields.profile,
    storage: fields.storage || {
      runtimeStorageLoaded: false,
      localStorageKeys: [],
      sessionStorageKeys: [],
    },
    page: fields.page || {
      title: null,
      url: null,
      authState: null,
    },
    api: fields.api || {
      requestCount: 0,
      authorizedRequestCount: 0,
      unauthorizedResponseCount: 0,
      businessResponseCount: 0,
      capturedHeaderKeys: [],
      lastUnauthorizedUrl: null,
      probe: null,
    },
    errorType,
    message: fields.message || null,
    nextAction: fields.nextAction || (errorType ? actionFor(errorType) : null),
  };
}

async function writeLoginHealthResult(result, writeResult) {
  if (!writeResult) return;
  await mkdir(PREFLIGHT_DIR, { recursive: true });
  await writeFile(LOGIN_HEALTH_LAST_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

function summarizeStorage(runtimeStorage) {
  const localStorageKeys = Object.keys(runtimeStorage.localStorage || {}).sort();
  const sessionStorageKeys = Object.keys(runtimeStorage.sessionStorage || {}).sort();
  return {
    runtimeStorageLoaded: localStorageKeys.length > 0 || sessionStorageKeys.length > 0,
    localStorageKeys,
    sessionStorageKeys,
  };
}

function sanitizeProbeHeaders(headers, targetUrl) {
  const result = {
    accept: 'application/json, text/plain, */*',
    'content-type': 'application/json',
    referer: targetUrl,
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

async function runBusinessProbe(page, targetConfig, latestAuthorizedRequest) {
  if (!targetConfig.probe || !latestAuthorizedRequest?.headers) {
    return {
      ok: false,
      status: null,
      error: 'missing_probe_config',
      responseKeys: [],
    };
  }

  const fullApiUrl = `${new URL(targetConfig.targetUrl).origin}${targetConfig.probe.apiPath}`;
  const result = await page.evaluate(async ({ apiUrl, headers, body }) => {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => null);
      return {
        ok: response.ok,
        status: response.status,
        code: json?.code ?? null,
        responseKeys: json && typeof json === 'object' ? Object.keys(json).slice(0, 20) : [],
      };
    } catch (error) {
      return {
        ok: false,
        status: null,
        error: String(error),
        responseKeys: [],
      };
    }
  }, {
    apiUrl: fullApiUrl,
    headers: sanitizeProbeHeaders(latestAuthorizedRequest.headers, targetConfig.targetUrl),
    body: targetConfig.probe.body,
  });

  return {
    ...result,
    apiPath: targetConfig.probe.apiPath,
  };
}

export async function checkMenglarLoginHealth(options = {}) {
  const target = options.target || 'hot_products';
  const targetConfig = getTargetConfig(target);
  const browser = getBrowserStatus();

  if (!browser.exists) {
    const result = buildResult({
      ok: false,
      target,
      targetUrl: targetConfig.targetUrl,
      browser,
      profile: { ok: false },
      errorType: 'browser_blocked',
      message: `未找到可用浏览器：${browser.executablePath}`,
    });
    await writeLoginHealthResult(result, options.writeResult !== false);
    return result;
  }

  const profile = await ensureProfileCopy({ refresh: Boolean(options.refresh) });
  if (!profile.ok) {
    const result = buildResult({
      ok: false,
      target,
      targetUrl: targetConfig.targetUrl,
      browser,
      profile,
      errorType: profile.errorType || 'profile_locked',
      message: profile.message,
    });
    await writeLoginHealthResult(result, options.writeResult !== false);
    return result;
  }

  const runtimeStorage = await extractRuntimeStorage();
  const storage = summarizeStorage(runtimeStorage);
  const apiRequests = [];
  const apiResponses = [];
  let context;

  try {
    context = await launchMenglarContext({
      runtimeStorage,
      headless: Boolean(options.headless),
    });

    context.on('request', (request) => {
      const url = request.url();
      if (!url.includes('/api/ozon-report-service/v1/') && !url.includes('/api/ram/v1/')) return;
      const headers = request.headers();
      apiRequests.push({
        url,
        method: request.method(),
        hasAuthorization: Boolean(headers.authorization),
        headerKeys: Object.keys(headers).sort(),
        headers,
      });
    });

    context.on('response', (response) => {
      const url = response.url();
      if (!url.includes('/api/ozon-report-service/v1/') && !url.includes('/api/ram/v1/')) return;
      apiResponses.push({
        url,
        status: response.status(),
      });
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto(targetConfig.targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(options.waitMs ?? 8000);

    const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    const authState = getPageAuthState(bodyText);
    const pageInfo = {
      title: await page.title().catch(() => null),
      url: page.url(),
      authState,
      executablePath: context.__menglarExecutablePath || browser.executablePath,
    };

    const authorizedRequests = apiRequests.filter((item) => item.hasAuthorization);
    const unauthorizedResponses = apiResponses.filter((item) => item.status === 401 || item.status === 403);
    const latestAuthorized = authorizedRequests.at(-1);
    const latestUnauthorized = unauthorizedResponses.at(-1);
    const probe = latestAuthorized ? await runBusinessProbe(page, targetConfig, latestAuthorized) : null;
    const api = {
      requestCount: apiRequests.length,
      authorizedRequestCount: authorizedRequests.length,
      unauthorizedResponseCount: unauthorizedResponses.length,
      businessResponseCount: apiResponses.length,
      capturedHeaderKeys: latestAuthorized?.headerKeys?.filter((key) => key !== 'authorization') || [],
      lastUnauthorizedUrl: latestUnauthorized?.url || null,
      probe,
      statuses: apiResponses.slice(-8),
    };

    if (!storage.runtimeStorageLoaded) {
      const result = buildResult({
        ok: false,
        target,
        targetUrl: targetConfig.targetUrl,
        browser,
        profile,
        storage,
        page: pageInfo,
        api,
        errorType: 'login_required',
        message: '未从紫鸟 profile 中读取到可用登录缓存',
      });
      await writeLoginHealthResult(result, options.writeResult !== false);
      return result;
    }

    if (!authState.ok) {
      const result = buildResult({
        ok: false,
        target,
        targetUrl: targetConfig.targetUrl,
        browser,
        profile,
        storage,
        page: pageInfo,
        api,
        errorType: authState.errorType,
        message: authState.message,
      });
      await writeLoginHealthResult(result, options.writeResult !== false);
      return result;
    }

    if (unauthorizedResponses.length > 0) {
      const result = buildResult({
        ok: false,
        target,
        targetUrl: targetConfig.targetUrl,
        browser,
        profile,
        storage,
        page: pageInfo,
        api,
        errorType: 'api_unauthorized',
        message: `萌拉业务接口返回 ${latestUnauthorized.status}`,
      });
      await writeLoginHealthResult(result, options.writeResult !== false);
      return result;
    }

    if (authorizedRequests.length === 0) {
      const result = buildResult({
        ok: false,
        target,
        targetUrl: targetConfig.targetUrl,
        browser,
        profile,
        storage,
        page: pageInfo,
        api,
        errorType: 'api_auth_missing',
        message: '未捕获到带 Authorization 的萌拉业务接口请求',
      });
      await writeLoginHealthResult(result, options.writeResult !== false);
      return result;
    }

    if (!probe?.ok) {
      const result = buildResult({
        ok: false,
        target,
        targetUrl: targetConfig.targetUrl,
        browser,
        profile,
        storage,
        page: pageInfo,
        api,
        errorType: probe?.status === 401 || probe?.status === 403 ? 'api_unauthorized' : 'api_auth_missing',
        message: probe?.status
          ? `业务探测失败，接口返回 ${probe.status}`
          : `业务探测失败：${probe?.error || 'unknown_probe_error'}`,
      });
      await writeLoginHealthResult(result, options.writeResult !== false);
      return result;
    }

    const result = buildResult({
      ok: true,
      target,
      targetUrl: targetConfig.targetUrl,
      browser,
      profile,
      storage,
      page: pageInfo,
      api,
      message: '萌拉登录态、业务授权和接口探测均通过',
    });
    await writeLoginHealthResult(result, options.writeResult !== false);
    return result;
  } catch (error) {
    const result = buildResult({
      ok: false,
      target,
      targetUrl: targetConfig.targetUrl,
      browser,
      profile,
      storage,
      errorType: error.errorType || (existsSync(browser.executablePath) ? 'unknown' : 'browser_blocked'),
      message: error.message,
    });
    await writeLoginHealthResult(result, options.writeResult !== false);
    return result;
  } finally {
    if (context) await context.close().catch(() => {});
  }
}
