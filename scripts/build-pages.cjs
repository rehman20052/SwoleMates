const { spawnSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['expo', 'export', '--platform', 'web', '--output-dir', 'dist'], {
    cwd: root, stdio: 'inherit', shell: process.platform === 'win32',
    env: { ...process.env, EXPO_PUBLIC_BASE_PATH: '/SwoleMates' },
  });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
writeFileSync(resolve(root, 'dist', '.nojekyll'), '');
