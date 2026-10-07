const { spawnSync } = require('node:child_process');
const { writeFileSync, readFileSync, readdirSync } = require('node:fs');
const { resolve, join } = require('node:path');

const root = resolve(__dirname, '..');
const release = spawnSync('git',['rev-parse','--short=12','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim();
const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['expo', 'export', '--platform', 'web', '--output-dir', 'dist'], {
    cwd: root, stdio: 'inherit', shell: process.platform === 'win32',
    env: { ...process.env, EXPO_PUBLIC_BASE_PATH: '/SwoleMates', EXPO_PUBLIC_RELEASE: release },
  });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
writeFileSync(resolve(root, 'dist', '.nojekyll'), '');
const output = resolve(root,'dist');
function assets(directory,prefix='') {
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry => entry.isDirectory()
    ? assets(join(directory,entry.name),prefix+entry.name+'/')
    : entry.name==='sw.js' || entry.name.startsWith('.') ? [] : [prefix+entry.name]);
}
const list = assets(output);
// Hashing the asset list makes uncommitted preview builds distinct too.
const fingerprint = require('node:crypto').createHash('sha256');
for (const path of list) fingerprint.update(readFileSync(join(output,path)));
const shellRelease = release+'-'+fingerprint.digest('hex').slice(0,12);
const worker = readFileSync(join(output,'sw.js'),'utf8').replace('__PUBLIC_RELEASE__',shellRelease)
  .replace('/* PUBLIC_ASSET_LIST */ ["index.html", "manifest.json", "mobile-viewport.js"]',JSON.stringify(list));
writeFileSync(join(output,'sw.js'),worker);
writeFileSync(join(output,'release.json'),JSON.stringify({release,shellRelease}));
