import path from 'node:path';
import { USER_DATA_DEFAULT_DIR } from './constants.mjs';
import { safeReadBuffer } from './profile-store.mjs';

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

export async function extractRuntimeStorage() {
  const localStorageFiles = [
    path.join(USER_DATA_DEFAULT_DIR, 'Local Storage', 'leveldb', '024974.ldb'),
    path.join(USER_DATA_DEFAULT_DIR, 'Local Storage', 'leveldb', '024711.ldb'),
  ];
  const sessionStorageFiles = [
    path.join(USER_DATA_DEFAULT_DIR, 'Local Storage', 'leveldb', '024972.ldb'),
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

  for (const filePath of sessionStorageFiles) {
    const buffer = await safeReadBuffer(filePath);
    if (!buffer) continue;
    const content = decodeLatin1(buffer);
    const sLogin = findStructuredAsciiValues(content, 'sLogin', /^(true|false)$/)[0] ?? null;
    const token = findStructuredAsciiValues(content, 'token', /^[A-Za-z0-9]{32,256}$/)[0] ?? null;
    if (sLogin) sessionStorage.sLogin = sLogin;
    if (token) sessionStorage.token = token;
  }

  return { localStorage, sessionStorage };
}

export function getPageAuthState(bodyText) {
  const expiredPhrases = ['您未登录或登录状态已过期', '请重新登录', '未登录'];
  const guestPhrases = ['您当前为 游客 角色', '无法访问功能', '登录/注册'];
  const loginExpiredDetected = expiredPhrases.some((item) => bodyText.includes(item));
  const guestBlockedDetected = guestPhrases.some((item) => bodyText.includes(item));

  if (guestBlockedDetected) {
    return { ok: false, errorType: 'guest_blocked', message: '检测到游客态访问限制' };
  }
  if (loginExpiredDetected) {
    return { ok: false, errorType: 'login_required', message: '检测到登录失效提示' };
  }
  return { ok: true, errorType: null, message: null };
}
