import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/press-repeater.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports });
const { createPressRepeater } = exports;
function fixture(step = () => true) {
  let now = 0;
  let calls = 0;
  let id = 0;
  const timers = new Map();
  const repeater = createPressRepeater(() => { calls++; return step(); }, {
    schedule(callback, delay) { const key = ++id; timers.set(key, { callback, at: now + delay }); return key; },
    cancel(key) { timers.delete(key); },
  });
  return { repeater, timers, get calls() { return calls; },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const pending = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!pending || pending[1].at > end) break;
        now = pending[1].at; timers.delete(pending[0]); pending[1].callback();
      }
      now = end;
    },
  };
}
test('tap gives exactly one increment and release cancels the first repeat', () => {
  const f = fixture(); f.repeater.start(); f.advance(120); f.repeater.stop(); f.advance(5000);
  assert.equal(f.calls, 1); assert.equal(f.timers.size, 0);
});
test('hold waits 450ms then gradually increases repetition frequency', () => {
  const f = fixture(); f.repeater.start(); f.advance(449); assert.equal(f.calls, 1);
  f.advance(1); assert.equal(f.calls, 2);
  const pendingDelay = () => [...f.timers.values()][0].at;
  assert.equal(pendingDelay(), 630);
  f.advance(900); const slowCount = f.calls;
  f.advance(1000); const middleCount = f.calls - slowCount;
  f.advance(1000); const fastCount = f.calls - slowCount - middleCount;
  assert.ok(middleCount > 5); assert.ok(fastCount > middleCount);
  f.repeater.stop(); const count = f.calls; f.advance(10000); assert.equal(f.calls, count);
});
test('reaching a bound stops scheduling and a new hold starts slowly again', () => {
  let value = 78;
  const f = fixture(() => { value = Math.min(80, value + 1); return value < 80; });
  f.repeater.start(); f.advance(5000);
  assert.equal(value, 80); assert.equal(f.calls, 2); assert.equal(f.timers.size, 0);
  value = 20; f.repeater.start(); assert.equal(value, 21);
  f.advance(449); assert.equal(value, 21); f.advance(1); assert.equal(value, 22);
});
test('starting again cancels the previous timer rather than doubling repeats', () => {
  const f = fixture(); f.repeater.start(); f.advance(300); f.repeater.start();
  assert.equal(f.timers.size, 1); f.advance(449); assert.equal(f.calls, 2);
  f.advance(1); assert.equal(f.calls, 3);
});
