import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { CHROME_EXECUTABLE_PATH, MENGLAR_ORIGIN, PROFILE_COPY } from './constants.mjs';

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

export function getChromeStatus() {
  return {
    executablePath: CHROME_EXECUTABLE_PATH,
    exists: existsSync(CHROME_EXECUTABLE_PATH),
  };
}

export async function launchMenglarContext({ runtimeStorage, headless = false } = {}) {
  if (!existsSync(CHROME_EXECUTABLE_PATH)) {
    const error = new Error(`未找到 Chrome: ${CHROME_EXECUTABLE_PATH}`);
    error.errorType = 'browser_blocked';
    throw error;
  }

  try {
    const context = await chromium.launchPersistentContext(PROFILE_COPY, {
      executablePath: CHROME_EXECUTABLE_PATH,
      headless,
      viewport: { width: 1440, height: 900 },
    });
    if (runtimeStorage) await injectRuntimeStorage(context, runtimeStorage);
    return context;
  } catch (error) {
    const wrapped = new Error(`浏览器启动失败: ${error.message}`);
    wrapped.errorType = 'browser_blocked';
    throw wrapped;
  }
}
