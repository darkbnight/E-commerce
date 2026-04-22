import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ERROR_ACTIONS, PREFLIGHT_DIR, PREFLIGHT_LAST_PATH, getTargetConfig } from './lib/constants.mjs';
import { getChromeStatus, launchMenglarContext } from './lib/browser-session.mjs';
import { ensureProfileCopy } from './lib/profile-store.mjs';
import { extractRuntimeStorage, getPageAuthState } from './lib/preflight-checks.mjs';

function parseArgs(argv) {
  const args = {
    target: 'industry_general',
    json: false,
    refresh: process.env.MENGLAR_REFRESH_PROFILE === '1',
    headless: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--json') args.json = true;
    if (item === '--headless') args.headless = true;
    if (item === '--refresh') args.refresh = true;
    if (item === '--target' && argv[index + 1]) {
      args.target = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

function actionFor(errorType) {
  return ERROR_ACTIONS[errorType] || ERROR_ACTIONS.unknown;
}

function makeResult(fields) {
  const errorType = fields.errorType || null;
  return {
    ok: Boolean(fields.ok),
    target: fields.target,
    status: fields.status || (fields.ok ? 'ready' : 'blocked'),
    targetUrl: fields.targetUrl,
    checkedAt: new Date().toISOString(),
    browser: fields.browser,
    profile: fields.profile,
    auth: fields.auth || {
      runtimeStorageLoaded: false,
      authorizationCaptured: false,
      capturedHeaderKeys: [],
    },
    errorType,
    message: fields.message || null,
    nextAction: fields.nextAction || (errorType ? actionFor(errorType) : null),
  };
}

async function writePreflightResult(result, writeResult) {
  if (!writeResult) return;
  await mkdir(PREFLIGHT_DIR, { recursive: true });
  await writeFile(PREFLIGHT_LAST_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

export async function runPreflight(options = {}) {
  const target = options.target || 'industry_general';
  const targetConfig = getTargetConfig(target);
  const browser = getChromeStatus();

  if (!browser.exists) {
    const result = makeResult({
      ok: false,
      target,
      targetUrl: targetConfig.targetUrl,
      browser,
      profile: { ok: false },
      errorType: 'browser_blocked',
      message: `未找到 Chrome: ${browser.executablePath}`,
    });
    await writePreflightResult(result, options.writeResult !== false);
    return result;
  }

  const profile = await ensureProfileCopy({ refresh: Boolean(options.refresh) });
  if (!profile.ok) {
    const result = makeResult({
      ok: false,
      target,
      targetUrl: targetConfig.targetUrl,
      browser,
      profile,
      errorType: profile.errorType || 'profile_locked',
      message: profile.message,
    });
    await writePreflightResult(result, options.writeResult !== false);
    return result;
  }

  const runtimeStorage = await extractRuntimeStorage();
  const runtimeStorageLoaded =
    Object.keys(runtimeStorage.localStorage || {}).length > 0 ||
    Object.keys(runtimeStorage.sessionStorage || {}).length > 0;
  const capturedApiHeaders = [];
  let context;

  try {
    context = await launchMenglarContext({
      runtimeStorage,
      headless: Boolean(options.headless),
    });

    context.on('request', (request) => {
      const url = request.url();
      if (!url.includes('/api/ozon-report-service/v1/')) return;
      const headers = request.headers();
      capturedApiHeaders.push({
        hasAuthorization: Boolean(headers.authorization),
        keys: Object.keys(headers).sort(),
      });
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto(targetConfig.targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(8000);

    const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    const pageAuthState = getPageAuthState(bodyText);
    const latestAuthorized = [...capturedApiHeaders].reverse().find((item) => item.hasAuthorization);
    const auth = {
      runtimeStorageLoaded,
      authorizationCaptured: Boolean(latestAuthorized),
      capturedHeaderKeys: latestAuthorized?.keys?.filter((key) => key !== 'authorization') || [],
      requestCount: capturedApiHeaders.length,
    };

    if (!pageAuthState.ok) {
      const result = makeResult({
        ok: false,
        target,
        targetUrl: targetConfig.targetUrl,
        browser,
        profile,
        auth,
        errorType: pageAuthState.errorType,
        message: pageAuthState.message,
      });
      await writePreflightResult(result, options.writeResult !== false);
      return result;
    }

    if (!auth.authorizationCaptured) {
      const result = makeResult({
        ok: false,
        target,
        targetUrl: targetConfig.targetUrl,
        browser,
        profile,
        auth,
        errorType: 'api_auth_missing',
        message: '未捕获到萌拉业务接口 Authorization',
      });
      await writePreflightResult(result, options.writeResult !== false);
      return result;
    }

    const result = makeResult({
      ok: true,
      target,
      targetUrl: targetConfig.targetUrl,
      browser,
      profile,
      auth,
      message: '采集环境可用',
    });
    await writePreflightResult(result, options.writeResult !== false);
    return result;
  } catch (error) {
    const errorType = error.errorType || (existsSync(browser.executablePath) ? 'unknown' : 'browser_blocked');
    const result = makeResult({
      ok: false,
      target,
      targetUrl: targetConfig.targetUrl,
      browser,
      profile,
      errorType,
      message: error.message,
    });
    await writePreflightResult(result, options.writeResult !== false);
    return result;
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const result = await runPreflight({
    target: args.target,
    refresh: args.refresh,
    headless: args.headless,
    writeResult: true,
  });
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.ok ? '采集环境可用' : '采集环境未就绪');
    console.log(`目标：${result.target}`);
    if (result.errorType) console.log(`问题：${result.errorType}`);
    if (result.message) console.log(`详情：${result.message}`);
    if (result.nextAction) console.log(`处理：${result.nextAction}`);
  }
  if (!result.ok) process.exitCode = 1;
}
