import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_DURATION = 12;
const DEFAULT_OUTPUT_NAME = '商品视频';
const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);

const RESOLUTIONS = {
  '1080p': { width: 1920, height: 1080 },
  '720p': { width: 1280, height: 720 },
};

export async function generateProductVideo(input) {
  const sourceDir = path.resolve(String(input?.sourceDir || '').trim());
  const duration = clamp(Number(input?.duration) || DEFAULT_DURATION, 5, 300);
  const res = RESOLUTIONS[input?.resolution] || RESOLUTIONS['1080p'];
  const outputVideoName = String(input?.outputVideoName || DEFAULT_OUTPUT_NAME).trim() || DEFAULT_OUTPUT_NAME;

  if (!sourceDir || sourceDir === path.parse(sourceDir).root) {
    throw new Error('请填写有效的图片目录');
  }

  const sourceInfo = await stat(sourceDir).catch(() => null);
  if (!sourceInfo?.isDirectory()) {
    throw new Error(`目录不存在或不是文件夹: ${sourceDir}`);
  }

  const entries = await readdir(sourceDir, { withFileTypes: true });
  const images = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => SUPPORTED_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const outputPath = path.join(sourceDir, `${outputVideoName}.mp4`);

  if (!images.length) {
    return {
      sourceDir,
      videoPath: null,
      imageCount: 0,
      duration,
      resolution: res,
      fileSize: 0,
      error: '该目录没有图片文件',
    };
  }

  const tempDir = path.join(tmpdir(), `menglar-video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(tempDir, { recursive: true });

  try {
    for (let i = 0; i < images.length; i++) {
      const srcPath = path.join(sourceDir, images[i]);
      const ext = path.extname(images[i]).toLowerCase();
      const frameName = String(i + 1).padStart(5, '0') + '.jpg';
      const framePath = path.join(tempDir, frameName);

      if (ext === '.jpg' || ext === '.jpeg') {
        await copyFile(srcPath, framePath);
      } else {
        await runFfmpeg(['-y', '-i', srcPath, '-q:v', '2', framePath]);
      }
    }

    const framerate = images.length / duration;
    const scaleFilter = `scale=${res.width}:${res.height}:force_original_aspect_ratio=decrease,pad=${res.width}:${res.height}:(ow-iw)/2:(oh-ih)/2:color=black`;

    await runFfmpeg([
      '-y',
      '-framerate', String(framerate),
      '-i', path.join(tempDir, '%05d.jpg'),
      '-vf', scaleFilter,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      outputPath,
    ]);

    const outputInfo = await stat(outputPath);

    return {
      sourceDir,
      videoPath: outputPath,
      imageCount: images.length,
      duration,
      resolution: res,
      fileSize: outputInfo.size,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function generateMultipleProductVideos(input) {
  const dirs = (input?.directories || [])
    .map((d) => String(d || '').trim())
    .filter((d) => d.length > 0)
    .map((d) => path.resolve(d));

  if (!dirs.length) {
    throw new Error('请填写至少一个图片目录');
  }

  const shared = {
    duration: Number(input?.duration) || DEFAULT_DURATION,
    resolution: input?.resolution || '1080p',
    outputVideoName: String(input?.outputVideoName || DEFAULT_OUTPUT_NAME).trim() || DEFAULT_OUTPUT_NAME,
  };

  const directories = [];
  for (const dir of dirs) {
    directories.push(await generateProductVideo({ ...shared, sourceDir: dir }));
  }

  const res = RESOLUTIONS[shared.resolution] || RESOLUTIONS['1080p'];
  return {
    directories,
    totalVideos: directories.filter((d) => !d.error).length,
    totalImages: directories.reduce((sum, d) => sum + d.imageCount, 0),
    duration: shared.duration,
    resolution: res,
    outputVideoName: shared.outputVideoName,
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
      reject(new Error(`ffmpeg 处理失败，退出码 ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function parseCliArgs(argv) {
  const input = {
    directories: [],
    duration: DEFAULT_DURATION,
    resolution: '1080p',
    outputVideoName: DEFAULT_OUTPUT_NAME,
  };

  for (const arg of argv) {
    if (arg.startsWith('--dirs=')) {
      input.directories = arg.slice('--dirs='.length).split(',').map((d) => d.trim()).filter(Boolean);
    } else if (arg.startsWith('--duration=')) {
      input.duration = Number(arg.slice('--duration='.length));
    } else if (arg.startsWith('--resolution=')) {
      input.resolution = arg.slice('--resolution='.length);
    } else if (arg.startsWith('--output=')) {
      input.outputVideoName = arg.slice('--output='.length);
    } else if (!arg.startsWith('-')) {
      input.directories.push(arg);
    }
  }

  return input;
}

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  generateMultipleProductVideos(parseCliArgs(process.argv.slice(2)))
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
