import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startWorkbenchServer } from '../../backend/menglar-workbench-api/server.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const fixtureDir = path.join(root, 'temp', 'image-compression-api-test');
const childA = path.join(fixtureDir, 'product-a');
const childB = path.join(fixtureDir, 'product-b');

await rm(fixtureDir, { recursive: true, force: true });
await mkdir(childA, { recursive: true });
await mkdir(childB, { recursive: true });
await writeFile(path.join(childA, 'sample-a.bmp'), createFixtureBmp());
await writeFile(path.join(childB, 'sample-b.bmp'), createFixtureBmp());

const server = await startWorkbenchServer({ port: 0 });
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const response = await fetch(`${baseUrl}/api/image-compression/compress-jpg`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceDir: fixtureDir,
      outputDirName: '压缩图',
      quality: 4,
      overwrite: true,
      mode: 'childDirectories',
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`接口返回失败: ${response.status} ${JSON.stringify(payload)}`);
  }
  if (payload.directoryCount !== 2 || payload.total !== 2 || payload.converted !== 2 || !payload.items?.[0]?.outputPath?.endsWith('.jpg')) {
    throw new Error(`压缩结果不符合预期: ${JSON.stringify(payload)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    status: response.status,
    directoryCount: payload.directoryCount,
    total: payload.total,
    converted: payload.converted,
    outputBytes: payload.outputBytes,
  }, null, 2));
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(fixtureDir, { recursive: true, force: true });
}

function createFixtureBmp() {
  const buffer = Buffer.alloc(70);
  buffer.write('BM', 0);
  buffer.writeUInt32LE(70, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(2, 18);
  buffer.writeInt32LE(2, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(16, 34);

  const pixels = [
    255, 0, 0, 0, 255, 0, 0, 0,
    0, 0, 255, 255, 255, 255, 0, 0,
  ];
  Buffer.from(pixels).copy(buffer, 54);
  return buffer;
}
