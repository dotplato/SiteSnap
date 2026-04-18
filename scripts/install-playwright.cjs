/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

// Keep browser binaries inside the project so deploy runtimes can find them.
process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
process.env.PLAYWRIGHT_SKIP_BROWSER_GC = '1';

const playwrightPkgPath = require.resolve('playwright/package.json');
const playwrightCli = path.join(path.dirname(playwrightPkgPath), 'cli.js');
const result = spawnSync(process.execPath, [playwrightCli, 'install', 'chromium'], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  throw result.error;
}

if (typeof result.status === 'number' && result.status !== 0) {
  process.exit(result.status);
}
