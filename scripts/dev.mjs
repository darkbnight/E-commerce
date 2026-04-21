import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['backend/menglar-workbench-api/server.mjs'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'frontend/menglar-workbench/vite.config.mjs'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  }),
];

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
