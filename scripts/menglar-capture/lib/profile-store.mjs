import { copyFile, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PROFILE_COPY, SOURCE_PROFILE } from './constants.mjs';

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
    const child = spawn('python', ['-c', python, src, dest], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `sqlite backup failed: ${src}`));
    });
    child.on('error', reject);
  });
}

async function copyFileWithFallback(srcPath, destPath, warnings) {
  await mkdir(path.dirname(destPath), { recursive: true });

  if (isLockedSqlite(path.basename(srcPath))) {
    try {
      await sqliteBackup(srcPath, destPath);
      return;
    } catch (error) {
      warnings.push({ type: 'sqlite_backup_failed', file: srcPath, message: error.message });
    }
  }

  try {
    await copyFile(srcPath, destPath);
  } catch (error) {
    if (error?.code === 'EBUSY' || error?.code === 'EPERM') {
      warnings.push({ type: 'profile_locked', file: srcPath, message: error.message });
      return;
    }
    throw error;
  }
}

async function copyProfileTree(src, dest, warnings) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.name === 'lockfile') continue;
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    if (entry.name.endsWith('-journal') || entry.name.endsWith('-wal') || entry.name.endsWith('-shm')) continue;

    if (entry.isDirectory()) {
      await copyProfileTree(srcPath, destPath, warnings);
    } else {
      await copyFileWithFallback(srcPath, destPath, warnings);
    }
  }
}

async function copyProfileSelection(srcRoot, destRoot, warnings) {
  await mkdir(destRoot, { recursive: true });
  for (const relativePath of PROFILE_COPY_RELATIVE_PATHS) {
    const srcPath = path.join(srcRoot, relativePath);
    const destPath = path.join(destRoot, relativePath);
    if (!existsSync(srcPath)) continue;
    const sourceStat = await stat(srcPath);
    if (sourceStat.isDirectory()) {
      await copyProfileTree(srcPath, destPath, warnings);
    } else {
      await copyFileWithFallback(srcPath, destPath, warnings);
    }
  }
}

export function isProfileCopyUsable(profileCopy = PROFILE_COPY) {
  const requiredPaths = [
    path.join(profileCopy, 'Default', 'Local Storage'),
    path.join(profileCopy, 'Default', 'Session Storage'),
    path.join(profileCopy, 'Default', 'Network'),
  ];
  return requiredPaths.every((item) => existsSync(item));
}

export async function ensureProfileCopy({ refresh = process.env.MENGLAR_REFRESH_PROFILE === '1' } = {}) {
  const warnings = [];
  if (!existsSync(SOURCE_PROFILE)) {
    return {
      ok: false,
      errorType: 'profile_locked',
      message: `未找到紫鸟用户目录: ${SOURCE_PROFILE}`,
      sourceProfile: SOURCE_PROFILE,
      profileCopy: PROFILE_COPY,
      warnings,
    };
  }

  if (refresh || !existsSync(path.join(PROFILE_COPY, 'Local State')) || !isProfileCopyUsable(PROFILE_COPY)) {
    await rm(PROFILE_COPY, { recursive: true, force: true });
    await copyProfileSelection(SOURCE_PROFILE, PROFILE_COPY, warnings);
  }

  return {
    ok: isProfileCopyUsable(PROFILE_COPY),
    errorType: warnings.some((item) => item.type === 'profile_locked') ? 'profile_locked' : null,
    sourceProfile: SOURCE_PROFILE,
    profileCopy: PROFILE_COPY,
    usable: isProfileCopyUsable(PROFILE_COPY),
    locked: warnings.some((item) => item.type === 'profile_locked'),
    warnings,
  };
}

export async function safeReadBuffer(filePath) {
  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}
