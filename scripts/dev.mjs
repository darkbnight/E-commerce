import { spawn } from 'node:child_process';
import { connect } from 'node:net';

const apiPort = Number(process.env.PORT || 4186);
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const children = [];

if (await isWorkbenchApiRunning(apiBaseUrl)) {
  console.log(`Menglar workbench api already running: ${apiBaseUrl}/`);
} else if (await isPortOpen(apiPort)) {
  console.error(`Port ${apiPort} is already in use, but it does not look like the Menglar workbench api.`);
  console.error(`Stop the process using 127.0.0.1:${apiPort}, or set PORT to another value and update the Vite proxy.`);
  process.exit(1);
} else {
  children.push(spawn(process.execPath, ['backend/menglar-workbench-api/server.mjs'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    env: { ...process.env, PORT: String(apiPort) },
  }));
}

children.push(spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'frontend/menglar-workbench/vite.config.mjs'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: false,
}));

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(code), 300);
}

for (const child of children) {
  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);

  child.on('exit', (code) => {
    if (!shuttingDown && code !== 0) {
      shutdown(code || 1);
    }
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function isWorkbenchApiRunning(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/api/jobs`, { signal: AbortSignal.timeout(1200) });
    if (!response.ok) return false;
    const payload = await response.json();
    return Array.isArray(payload?.jobs) || Array.isArray(payload?.items);
  } catch {
    return false;
  }
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}
