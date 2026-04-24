import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ERROR_ACTIONS, PREFLIGHT_DIR, PREFLIGHT_LAST_PATH, getTargetConfig } from './lib/constants.mjs';
import { checkMenglarLoginHealth } from './lib/login-health.mjs';

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
  const loginHealth = await checkMenglarLoginHealth({
    target,
    refresh: Boolean(options.refresh),
    headless: Boolean(options.headless),
    writeResult: true,
  });
  const result = makeResult({
    ok: loginHealth.ok,
    target,
    targetUrl: targetConfig.targetUrl,
    browser: loginHealth.browser,
    profile: loginHealth.profile,
    auth: {
      runtimeStorageLoaded: loginHealth.storage.runtimeStorageLoaded,
      authorizationCaptured: loginHealth.api.authorizedRequestCount > 0 && loginHealth.api.unauthorizedResponseCount === 0,
      capturedHeaderKeys: loginHealth.api.capturedHeaderKeys,
      requestCount: loginHealth.api.requestCount,
      unauthorizedResponseCount: loginHealth.api.unauthorizedResponseCount,
    },
    errorType: loginHealth.errorType,
    message: loginHealth.message || (loginHealth.ok ? '采集环境可用' : null),
    nextAction: loginHealth.nextAction,
  });
  await writePreflightResult(result, options.writeResult !== false);
  return result;
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
