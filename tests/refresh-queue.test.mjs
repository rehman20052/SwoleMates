import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { loadTs } from './helpers/load-ts.mjs';
const { createRefreshQueue } = loadTs('src/lib/refresh-queue.ts');

test('a burst of change notifications produces one read', async () => {
  let reads = 0;
  const queue = createRefreshQueue(() => { reads++; }, () => true, 1);
  for (let i = 0; i < 100; i++) queue.request();
  await wait(20); queue.stop();
  assert.equal(reads, 1);
});

test('events during a read produce exactly one trailing read, without overlap', async () => {
  let reads = 0, running = 0, peak = 0, release;
  const queue = createRefreshQueue(async () => {
    reads++; running++; peak = Math.max(peak, running);
    if (reads === 1) await new Promise(resolve => { release = resolve; });
    running--;
  }, () => true, 1);
  queue.request(); await wait(20);
  for (let i = 0; i < 100; i++) queue.request();
  assert.equal(reads, 1);
  release(); await wait(20); queue.stop();
  assert.equal(reads, 2); assert.equal(peak, 1);
});

test('background requests are skipped and foreground catch-up reads current data', async () => {
  let foreground = false, reads = 0;
  const queue = createRefreshQueue(() => { reads++; }, () => foreground, 1);
  queue.request(); await wait(20); assert.equal(reads, 0);
  foreground = true; queue.request(); foreground = false;
  await wait(20); assert.equal(reads, 0);
  foreground = true; queue.request(); await wait(20);
  assert.equal(reads, 1); queue.stop();
});

test('cleanup cancels pending work and ignores late channel callbacks', async () => {
  let reads = 0;
  const queue = createRefreshQueue(() => { reads++; }, () => true, 1);
  queue.request(); queue.stop(); queue.request(); await wait(20);
  assert.equal(reads, 0);
});

test('a failed read releases the queue for reconnect and retry', async () => {
  let reads = 0;
  const queue = createRefreshQueue(() => { if (++reads === 1) throw new Error('offline'); }, () => true, 1);
  queue.request(); await wait(20); queue.request(); await wait(20); queue.stop();
  assert.equal(reads, 2);
});
