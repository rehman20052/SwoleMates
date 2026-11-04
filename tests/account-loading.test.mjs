import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, require = () => ({}), globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require, setTimeout, clearTimeout, AbortController, Request, fetch, ...globals });
  return exports;
}
const { createAccountStores, cachedAccountStores } = load('src/lib/account-app-data.ts', name => name === './account-sync' ? {
  accountList: (_owner, namespace, _identify, validate) => ({ namespace, validate }),
} : {});

test('a saved preference does not reject the account settings snapshot', () => {
  const settings = createAccountStores('alice').settings;
  assert.equal(settings.validate({ id: 'preference:weight-unit', value: { updatedAt: 123, content: '"lb"' } }), true);
  assert.equal(settings.validate({ id: 'preference:weight-unit', value: { content: '"lb"' } }), false);
  assert.equal(settings.validate({ id: 'unsupported:setting', value: { updatedAt: 123, content: '{}' } }), false);
});

test('startup restores the complete account cache without waiting for network reads', async () => {
  const stores = Object.fromEntries(['recipes','food','plan','logs','deletions','settings','lifts'].map(key => [key, {
    cached: async () => key === 'food' ? [{ id: 'meal', calories: 500 }] : [],
    refresh: () => { throw Error('Startup cache must not contact the server'); },
  }]));
  const snapshot = await cachedAccountStores(stores, { calorieGoal: 2000 });
  assert.equal(snapshot.foodEntries[0].calories, 500);
  stores.logs.cached = async () => null;
  assert.equal(await cachedAccountStores(stores, { calorieGoal: 2000 }), null, 'unknown cloud records must not be treated as an empty cache');
});

const { deadlineFetch, withDeadline } = load('src/lib/network-deadline.ts');
test('a stalled request aborts and a stalled auth wait releases its caller', async () => {
  let aborted = false;
  const request = deadlineFetch((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => { aborted = true; reject(init.signal.reason); });
  }), 10);
  await assert.rejects(request('https://example.invalid'), /timed out/);
  assert.equal(aborted, true);
  await assert.rejects(withDeadline(new Promise(() => {}), 10), /timed out/);
});

test('request deadlines preserve explicit cancellation and successful responses', async () => {
  const original = new AbortController();
  const request = deadlineFetch(async (_url, init) => { assert.equal(init.signal.aborted, true); throw init.signal.reason; }, 50);
  original.abort(new Error('caller canceled'));
  await assert.rejects(request('https://example.invalid', { signal: original.signal }), /caller canceled/);
  const result = await deadlineFetch(async () => 'ok', 50)('https://example.invalid');
  assert.equal(result, 'ok');
});
