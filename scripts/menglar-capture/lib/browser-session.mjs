import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import {
  CHROME_EXECUTABLE_PATH,
  MENGLAR_ORIGIN,
  ZINIAO_EXECUTABLE_PATH,
} from './constants.mjs';
import { cleanupRuntimeProfile, prepareRuntimeProfile } from './profile-store.mjs';

export async function injectRuntimeStorage(context, runtimeStorage) {
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

export function getBrowserStatus() {
  const candidates = [CHROME_EXECUTABLE_PATH, ZINIAO_EXECUTABLE_PATH]
    .filter(Boolean)
    .map((executablePath) => ({
      executablePath,
      exists: existsSync(executablePath),
    }));

  return {
    executablePath: candidates.find((item) => item.exists)?.executablePath || CHROME_EXECUTABLE_PATH,
    exists: candidates.some((item) => item.exists),
    candidates,
  };
}

export async function launchMenglarContext({ runtimeStorage, headless = false } = {}) {
  const browserStatus = getBrowserStatus();
  const availableCandidates = browserStatus.candidates.filter((item) => item.exists);
  if (availableCandidates.length === 0) {
    const error = new Error(`未找到可用浏览器：${CHROME_EXECUTABLE_PATH} / ${ZINIAO_EXECUTABLE_PATH}`);
    error.errorType = 'browser_blocked';
    throw error;
  }

  const { runtimeProfileDir, warnings } = await prepareRuntimeProfile();
  const launchErrors = [];
  for (const candidate of availableCandidates) {
    try {
      const context = await chromium.launchPersistentContext(runtimeProfileDir, {
        executablePath: candidate.executablePath,
        headless,
        viewport: { width: 1440, height: 900 },
      });
      if (runtimeStorage) await injectRuntimeStorage(context, runtimeStorage);
      context.__menglarExecutablePath = candidate.executablePath;
      context.__menglarRuntimeProfileDir = runtimeProfileDir;
      context.__menglarRuntimeProfileWarnings = warnings;
      const originalClose = context.close.bind(context);
      context.close = async (...args) => {
        try {
          return await originalClose(...args);
        } finally {
          await cleanupRuntimeProfile(runtimeProfileDir);
        }
      };
      return context;
    } catch (error) {
      launchErrors.push(`${candidate.executablePath}: ${error.message}`);
    }
  }

  await cleanupRuntimeProfile(runtimeProfileDir);
  const wrapped = new Error(`浏览器启动失败: ${launchErrors.join(' | ')}`);
  wrapped.errorType = 'browser_blocked';
  throw wrapped;
}
