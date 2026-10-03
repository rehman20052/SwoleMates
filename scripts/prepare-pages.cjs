// Prepare a deployment checkout; committing and pushing remain manual.
const { spawnSync } = require('node:child_process');
const { existsSync, readdirSync, cpSync, rmSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { resolve, join } = require('node:path');
const root = resolve(__dirname, '..');
const output = resolve(root, 'dist');
const checkout = resolve(root, '.expo', 'pages-release');
function git(args, cwd = root) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || 'Git command failed.');
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
// Cached HTML can refer to the previous release's hashed entry. Keep the last
// few entry bundles available rather than making those installed apps fail 404.
const archiveFile = join(checkout, 'compatible-entries.json');
const priorHtml = existsSync(join(checkout, 'index.html')) ? readFileSync(join(checkout, 'index.html'), 'utf8') : '';
const priorEntry = priorHtml.match(/_expo\/static\/js\/web\/entry-[a-f0-9]+\.js/)?.[0];
const priorArchive = existsSync(archiveFile) ? JSON.parse(readFileSync(archiveFile, 'utf8')) : [];
const recentEntries = git(['log', '-5', '--format=%H', '--', 'index.html'], checkout).split('\n').map(commit => {
  const html = git(['show', `${commit}:index.html`], checkout);
  return { commit, name: html.match(/_expo\/static\/js\/web\/entry-[a-f0-9]+\.js/)?.[0] };
});
const entries = [...new Set([priorEntry, ...recentEntries.map(item => item.name), ...priorArchive])]
  .filter(name => typeof name === 'string' && /^_expo\/static\/js\/web\/entry-[a-f0-9]+\.js$/.test(name))
  .slice(0, 4);
const retained = entries.map(name => {
  if (existsSync(join(checkout, name))) return { name, content: readFileSync(join(checkout, name)) };
  const release = recentEntries.find(item => item.name === name);
  return { name, content: git(['show', `${release.commit}:${name}`], checkout) };
});
// Only clear children of this explicit deployment directory, preserving its Git pointer.
for (const name of readdirSync(checkout)) {
  if (name !== '.git') rmSync(join(checkout, name), { recursive: true, force: true });
}
for (const name of readdirSync(output)) cpSync(join(output, name), join(checkout, name), { recursive: true });
for (const { name, content } of retained) {
  const target = join(checkout, name);
  if (!existsSync(target)) { mkdirSync(resolve(target, '..'), { recursive: true }); writeFileSync(target, content); }
}
writeFileSync(archiveFile, JSON.stringify(entries));
console.log('Pages files ready in .expo/pages-release. No commit or push performed.');
