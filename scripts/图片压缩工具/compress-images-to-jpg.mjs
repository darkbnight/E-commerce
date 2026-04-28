import { existsSync } from 'node:fs';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_OUTPUT_DIR_NAME = '压缩图';
const DEFAULT_QUALITY = 4;
const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp']);
const SUPPORTED_EXTENSION_LIST = [...SUPPORTED_EXTENSIONS];

export async function compressImagesToJpg(input) {
  const sourceDir = path.resolve(String(input?.sourceDir || '').trim());
  const outputDirName = String(input?.outputDirName || DEFAULT_OUTPUT_DIR_NAME).trim() || DEFAULT_OUTPUT_DIR_NAME;
  const quality = normalizeQuality(input?.quality);
  const overwrite = input?.overwrite !== false;

  if (!sourceDir || sourceDir === path.parse(sourceDir).root) {
    throw new Error('请填写有效的图片目录');
  }

  const sourceInfo = await stat(sourceDir).catch(() => null);
  if (!sourceInfo?.isDirectory()) {
    throw new Error(`目录不存在或不是文件夹: ${sourceDir}`);
  }

  if (outputDirName.includes('/') || outputDirName.includes('\\') || outputDirName === '.' || outputDirName === '..') {
    throw new Error('输出子目录名称不能包含路径分隔符');
  }

  const outputDir = path.join(sourceDir, outputDirName);
  await mkdir(outputDir, { recursive: true });

  const entries = await readdir(sourceDir, { withFileTypes: true });
  const images = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => SUPPORTED_EXTENSIONS.has(path.extname(name).toLowerCase()));

  const items = [];
  for (const name of images) {
    const sourcePath = path.join(sourceDir, name);
    const outputPath = path.join(outputDir, `${path.basename(name, path.extname(name))}.jpg`);

    if (!overwrite && existsSync(outputPath)) {
      const source = await stat(sourcePath);
      const output = await stat(outputPath);
      items.push(toResultItem({ name, sourcePath, outputPath, sourceSize: source.size, outputSize: output.size, skipped: true }));
      continue;
    }

    await runFfmpeg([
      '-y',
      '-i',
      sourcePath,
      '-vf',
      'scale=iw:ih:flags=lanczos,format=yuvj420p',
      '-q:v',
      String(quality),
      '-frames:v',
      '1',
      outputPath,
    ]);

    const source = await stat(sourcePath);
    const output = await stat(outputPath);
    items.push(toResultItem({ name, sourcePath, outputPath, sourceSize: source.size, outputSize: output.size, skipped: false }));
  }

  const sourceBytes = items.reduce((sum, item) => sum + item.sourceSize, 0);
  const outputBytes = items.reduce((sum, item) => sum + item.outputSize, 0);

  return {
    sourceDir,
    outputDir,
    outputDirName,
    quality,
    total: items.length,
    converted: items.filter((item) => !item.skipped).length,
    skipped: items.filter((item) => item.skipped).length,
    sourceBytes,
    outputBytes,
    savedBytes: Math.max(0, sourceBytes - outputBytes),
    compressionRatio: sourceBytes > 0 ? 1 - outputBytes / sourceBytes : 0,
    supportedExtensions: SUPPORTED_EXTENSION_LIST,
    items,
  };
}

export async function compressMultipleDirectoriesToJpg(input) {
  const dirs = (input?.directories || [])
    .map((d) => String(d || '').trim())
    .filter((d) => d.length > 0)
    .map((d) => path.resolve(d));

  if (!dirs.length) {
    throw new Error('请填写至少一个有效的图片目录');
  }

  const directories = [];
  for (const dir of dirs) {
    directories.push(await compressImagesToJpg({ ...input, sourceDir: dir }));
  }

  return toBatchResult({
    mode: 'multiDirectory',
    sourceDir: dirs[0],
    directories,
    outputDirName: String(input?.outputDirName || DEFAULT_OUTPUT_DIR_NAME).trim() || DEFAULT_OUTPUT_DIR_NAME,
    quality: normalizeQuality(input?.quality),
  });
}

export async function compressImageDirectoriesToJpg(input) {
  const sourceDir = path.resolve(String(input?.sourceDir || '').trim());
  const includeChildDirs = input?.mode === 'childDirectories' || input?.includeChildDirs === true;

  if (!includeChildDirs) {
    const result = await compressImagesToJpg(input);
    return toBatchResult({
      mode: 'singleDirectory',
      sourceDir,
      directories: [result],
      outputDirName: result.outputDirName,
      quality: result.quality,
    });
  }

  const sourceInfo = await stat(sourceDir).catch(() => null);
  if (!sourceInfo?.isDirectory()) {
    throw new Error(`目录不存在或不是文件夹: ${sourceDir}`);
  }

  const entries = await readdir(sourceDir, { withFileTypes: true });
  const childDirectories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(sourceDir, entry.name))
    .filter((childDir) => path.basename(childDir) !== String(input?.outputDirName || DEFAULT_OUTPUT_DIR_NAME));

  const directories = [];
  for (const childDir of childDirectories) {
    directories.push(await compressImagesToJpg({ ...input, sourceDir: childDir }));
  }

  return toBatchResult({
    mode: 'childDirectories',
    sourceDir,
    directories,
    outputDirName: String(input?.outputDirName || DEFAULT_OUTPUT_DIR_NAME).trim() || DEFAULT_OUTPUT_DIR_NAME,
    quality: normalizeQuality(input?.quality),
  });
}

function toBatchResult({ mode, sourceDir, directories, outputDirName, quality }) {
  const total = directories.reduce((sum, item) => sum + item.total, 0);
  const converted = directories.reduce((sum, item) => sum + item.converted, 0);
  const skipped = directories.reduce((sum, item) => sum + item.skipped, 0);
  const sourceBytes = directories.reduce((sum, item) => sum + item.sourceBytes, 0);
  const outputBytes = directories.reduce((sum, item) => sum + item.outputBytes, 0);

  return {
    mode,
    sourceDir,
    outputDirName,
    quality,
    supportedExtensions: SUPPORTED_EXTENSION_LIST,
    directoryCount: directories.length,
    total,
    converted,
    skipped,
    sourceBytes,
    outputBytes,
    savedBytes: Math.max(0, sourceBytes - outputBytes),
    compressionRatio: sourceBytes > 0 ? 1 - outputBytes / sourceBytes : 0,
    directories,
    items: directories.flatMap((directory) => directory.items),
  };
}

function normalizeQuality(value) {
  const quality = Number.parseInt(value ?? DEFAULT_QUALITY, 10);
  if (!Number.isFinite(quality)) return DEFAULT_QUALITY;
  return Math.min(31, Math.max(2, quality));
}

function toResultItem({ name, sourcePath, outputPath, sourceSize, outputSize, skipped }) {
  return {
    name,
    sourcePath,
    outputPath,
    sourceSize,
    outputSize,
    savedBytes: Math.max(0, sourceSize - outputSize),
    compressionRatio: sourceSize > 0 ? 1 - outputSize / sourceSize : 0,
    skipped,
  };
}

function runFfmpeg(args) {
  const command = process.env.FFMPEG_PATH || 'ffmpeg';
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(new Error(`无法启动 ffmpeg，请确认已安装或配置 FFMPEG_PATH: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg 压缩失败，退出码 ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

function parseCliArgs(argv) {
  const input = {
    sourceDir: '',
    outputDirName: DEFAULT_OUTPUT_DIR_NAME,
    quality: DEFAULT_QUALITY,
    overwrite: true,
    mode: 'singleDirectory',
  };

  for (const arg of argv) {
    if (arg.startsWith('--quality=')) {
      input.quality = arg.slice('--quality='.length);
    } else if (arg.startsWith('--output=')) {
      input.outputDirName = arg.slice('--output='.length);
    } else if (arg === '--no-overwrite') {
      input.overwrite = false;
    } else if (arg === '--batch-children') {
      input.mode = 'childDirectories';
    } else if (!input.sourceDir) {
      input.sourceDir = arg;
    }
  }

  return input;
}

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  compressImageDirectoriesToJpg(parseCliArgs(process.argv.slice(2)))
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
