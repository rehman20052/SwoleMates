import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { loadTs } from './helpers/load-ts.mjs';

for (const platform of ['web', 'ios']) test(`${platform}: polling pauses in background, catches up on return and cleans up`, async () => {
  const events = () => {
    const listeners = new Map();
    return { listeners, addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); } };
  };
  const window = events(), document = { ...events(), visibilityState: 'visible' };
  let appListener, interval, cleared = false, removed = false;
  const AppState = { currentState: 'active', addEventListener(_event, listener) { appListener = listener; return { remove() { removed = true; } }; } };
  const module = { exports: {} };
  const require = name => name === 'react-native' ? { AppState, Platform: { OS: platform } } : loadTs('src/lib/refresh-queue.ts');
  const output = ts.transpileModule(readFileSync('src/lib/foreground-refresh.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`(function(exports,require,module){${output}\n})`, { window, document, setInterval(fn) { interval = fn; return 1; }, clearInterval() { cleared = true; } })(module.exports, require, module);
  let reads = 0, shouldPoll = true;
  const refresh = module.exports.foregroundRefresh(() => { reads++; }, 15000, () => shouldPoll);
  document.visibilityState = 'hidden'; AppState.currentState = 'background';
  interval(); await wait(230); assert.equal(reads, 0);
  document.visibilityState = 'visible'; AppState.currentState = 'active';
  if (platform === 'web') document.listeners.get('visibilitychange')(); else appListener('active');
  await wait(230); assert.equal(reads, 1);
  shouldPoll = false; interval(); await wait(230); assert.equal(reads, 1);
  window.listeners.get('online')(); refresh.stop(); await wait(230);
  assert.equal(reads, 1); assert.equal(cleared, true); assert.equal(removed, true);
  assert.equal(window.listeners.size, 0); assert.equal(document.listeners.size, 0);
});
