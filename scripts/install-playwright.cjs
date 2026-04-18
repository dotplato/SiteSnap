const { spawnSync } = require('node:child_process');

// Keep browser binaries inside the project so deploy runtimes can find them.
process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
process.env.PLAYWRIGHT_SKIP_BROWSER_GC = '1';

const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(cmd, ['playwright', 'install', 'chromium'], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  throw result.error;
}

if (typeof result.status === 'number' && result.status !== 0) {
  process.exit(result.status);
}
