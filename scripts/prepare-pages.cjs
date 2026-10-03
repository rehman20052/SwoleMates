// Prepare a deployment checkout; committing and pushing remain manual.
const { spawnSync } = require('node:child_process');
const { existsSync, readdirSync, cpSync, rmSync } = require('node:fs');
const { resolve, join } = require('node:path');
const root = resolve(__dirname, '..');
const output = resolve(root, 'dist');
const checkout = resolve(root, '.expo', 'pages-release');
function git(args, cwd = root) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}
if (!existsSync(join(output, 'index.html')) || !existsSync(join(output, '.nojekyll'))) {
  throw new Error('Run npm run build:pages first.');
}
git(['fetch', 'origin', 'gh-pages']);
if (existsSync(checkout)) {
  if (git(['status', '--porcelain'], checkout)) throw new Error('Deployment checkout has uncommitted changes. Commit and push it before preparing again.');
  if (git(['rev-parse', 'HEAD'], checkout) !== git(['rev-parse', 'origin/gh-pages'])) {
    throw new Error('Deployment checkout differs from origin/gh-pages. Push its commit before preparing again.');
  }
} else {
  git(['worktree', 'add', '--detach', checkout, 'origin/gh-pages']);
}
// Only clear children of this explicit deployment directory, preserving its Git pointer.
for (const name of readdirSync(checkout)) {
  if (name !== '.git') rmSync(join(checkout, name), { recursive: true, force: true });
}
for (const name of readdirSync(output)) cpSync(join(output, name), join(checkout, name), { recursive: true });
console.log('Pages files ready in .expo/pages-release. No commit or push performed.');
