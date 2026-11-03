import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('feed, notices and comments share one channel until the last consumer leaves', () => {
  const channels = [], refreshes = [], removed = [];
  const supabase = {
    channel(name) {
      const channel = { name, handlers: [], on(_type, filter, callback) { this.handlers.push({ filter, callback }); return this; }, subscribe(callback) { this.status = callback; return this; } };
      channels.push(channel); return channel;
    },
    removeChannel(channel) { removed.push(channel); },
  };
  const module = { exports: {} };
  const require = name => {
    if (name.endsWith('/supabase')) return { supabase };
    if (name === './foreground-refresh') return { foregroundRefresh(task, interval, shouldPoll) {
      const refresh = { stopped: false, interval, shouldPoll, request() { if (!refresh.stopped) task(); }, stop() { refresh.stopped = true; } };
      refreshes.push(refresh); return refresh;
    } };
    return {};
  };
  const output = ts.transpileModule(readFileSync('src/lib/social.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`(function(exports,require,module){${output}\n})`, {})(module.exports, require, module);
  const { subscribeFeed } = module.exports;
  let feed = 0, notices = 0;
  const stopFeed = subscribeFeed(() => feed++, 'feed');
  const stopNotices = subscribeFeed(() => notices++, 'notices');
  assert.equal(channels.length, 1); assert.equal(channels[0].handlers.length, 4);
  assert.equal(refreshes[0].shouldPoll(), true);
  channels[0].status('SUBSCRIBED');
  assert.equal(refreshes[0].shouldPoll(), false);
  channels[0].handlers[0].callback();
  assert.equal(feed, 2); assert.equal(notices, 2);
  stopFeed(); assert.equal(removed.length, 0);
  channels[0].handlers[0].callback();
  assert.equal(feed, 2); assert.equal(notices, 3);
  channels[0].status('CHANNEL_ERROR'); assert.equal(refreshes[0].shouldPoll(), true);
  stopNotices(); assert.equal(removed.length, 1); assert.equal(refreshes[0].stopped, true);
  channels[0].status('SUBSCRIBED'); channels[0].handlers[0].callback();
  assert.equal(notices, 3);
  const stopAgain = subscribeFeed(() => {}, 'feed');
  assert.equal(channels.length, 2); stopAgain();
});
