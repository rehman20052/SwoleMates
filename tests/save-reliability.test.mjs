import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { loadTs } from './helpers/load-ts.mjs';

const { createAccountList } = loadTs('src/lib/account-sync-core.ts');
const { requestTimeout, ACCOUNT_REQUEST_TIMEOUT, ACCOUNT_WRITE_TIMEOUT, MEDIA_UPLOAD_TIMEOUT } = loadTs('src/lib/network-deadline.ts');
const safetyState = loadTs('src/lib/safety-state.ts');
const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
function localStorage() {
  const values = new Map();
  return { values, fail: false, getItem: async key => values.get(key) ?? null, async setItem(key, value) { if (this.fail) throw Error('Storage full'); values.set(key, value); } };
}
function server(conflict = { code: '40001', message: 'Newer version exists' }) {
  const rows = new Map(), receipts = new Set();
  const state = { gate: null, fail: false, saves: 0 };
  return { state, rows, remote: {
    read: async () => clone([...rows.values()]),
    import: async (_ns, records) => { for (const record of records) if (!rows.has(record.id)) rows.set(record.id, { ...record, revision: 1, deleted: false }); },
    save: async (_ns, changes, operationId) => {
      if (state.gate) await state.gate;
      if (state.fail) throw Error('Network unavailable');
      if (receipts.has(operationId)) return;
      for (const change of changes) if ((rows.get(change.id)?.revision ?? 0) !== change.expectedRevision) throw conflict;
      for (const change of changes) rows.set(change.id, { id: change.id, payload: clone(change.payload), deleted: change.deleted, revision: change.expectedRevision + 1 });
      receipts.add(operationId); state.saves++;
    },
  } };
}
const storeFor = (backend, local, onChange) => createAccountList({ userId: 'alice', namespace: 'food', local, remote: backend.remote, identify: item => item.id, validate: item => !!item && typeof item.id === 'string', localFirst: true, onChange });

test('local saves finish while cloud writes stall and later edits are not held behind them', async () => {
  const backend = server(), local = localStorage(); let notifications = 0;
  const store = storeFor(backend, local, () => notifications++); await store.load([]);
  let release; backend.state.gate = new Promise(resolve => { release = resolve; });
  await store.change(() => [{ id: 'one', calories: 100 }]); await tick();
  const second = await Promise.race([store.change(rows => [...rows, { id: 'two', calories: 200 }]), new Promise((_, reject) => setTimeout(() => reject(Error('Local save waited on cloud')), 100))]);
  assert.equal(second.length, 2); assert.equal(store.status().phase, 'pending');
  assert.equal(backend.rows.size, 0);
  assert.equal((await store.cached()).length, 2);
  release(); backend.state.gate = null; await store.refresh();
  assert.equal(store.status().phase, 'saved'); assert.equal(backend.rows.size, 2); assert.equal(backend.state.saves, 2);
  assert.ok(notifications >= 4, 'UI is notified about local durability and cloud acknowledgments');
});

test('offline saves reopen from cache, recover once, and never duplicate stable records', async () => {
  const backend = server(), local = localStorage(), store = storeFor(backend, local); await store.load([]);
  backend.state.fail = true;
  await store.change(() => [{ id: 'stable', calories: 200 }]); await tick();
  const reopened = storeFor(backend, local); assert.equal((await reopened.cached())[0].id, 'stable');
  backend.state.fail = false; await reopened.retry();
  assert.equal(backend.rows.size, 1); assert.equal(reopened.status().phase, 'saved');
  await reopened.retry(); assert.equal(backend.state.saves, 1);
});

test('a local write failure stays a failure and preserves the last saved records', async () => {
  const backend = server(), local = localStorage(), store = storeFor(backend, local); await store.load([]);
  await store.change(() => [{ id: 'old' }]); await store.refresh(); local.fail = true;
  await assert.rejects(store.change(() => [{ id: 'new' }]), /Storage full/);
  assert.equal((await store.cached())[0].id, 'old');
});

for (const code of ['PT409', '40001']) {
  test(`local-first ${code} conflicts preserve edits and require explicit reconciliation`, async () => {
    const backend = server({ code }), local = localStorage(), store = storeFor(backend, local); await store.load([{ id: 'one', value: 1 }]);
    backend.rows.set('one', { id: 'one', payload: { id: 'one', value: 2 }, revision: 2, deleted: false });
    await store.change(() => [{ id: 'one', value: 3 }]); await store.refresh();
    assert.equal(store.status().phase, 'conflict'); assert.equal((await store.cached())[0].value, 3);
    await store.resolve('server'); assert.equal((await store.cached())[0].value, 2);
  });
}

test('disposing an old account store prevents its delayed acknowledgment from replacing newer device data', async () => {
  const backend = server(), local = localStorage(), old = storeFor(backend, local); await old.load([]);
  let release; backend.state.gate = new Promise(resolve => { release = resolve; });
  await old.change(() => [{ id: 'old' }]); await tick(); old.dispose();
  const current = storeFor(backend, local); await current.cached();
  await current.change(rows => [...rows, { id: 'new' }]);
  release(); backend.state.gate = null; await current.refresh();
  assert.equal((await current.cached()).length, 2);
  assert.equal(JSON.parse(local.values.get('swolemates.account-cache.alice.food')).rows.length, 2);
  await assert.rejects(old.change(() => []), /account changed/);
});

test('request budgets distinguish reads, auth, normal writes and media uploads', () => {
  assert.equal(requestTimeout('https://example.test/rest/v1/rpc/blocked_contact_ids', 'POST'), ACCOUNT_REQUEST_TIMEOUT);
  assert.equal(requestTimeout('https://example.test/auth/v1/token', 'POST'), ACCOUNT_REQUEST_TIMEOUT);
  assert.equal(requestTimeout('https://example.test/auth/v1/user', 'PUT'), ACCOUNT_WRITE_TIMEOUT);
  assert.equal(requestTimeout('https://example.test/rest/v1/rpc/account_commit_operation', 'POST'), ACCOUNT_WRITE_TIMEOUT);
  assert.equal(requestTimeout('https://example.test/storage/v1/object/photos/file', 'POST'), MEDIA_UPLOAD_TIMEOUT);
});

test('safety failures preserve a diagnostic reason instead of pretending the block list is empty', () => {
  for (const [error, reason] of [[{ code: 'PGRST202' }, 'setup'], [{ code: '42501' }, 'permission'], [{ code: '401' }, 'auth'], [{ code: 'REQUEST_TIMEOUT' }, 'timeout'], [new Error('Failed to fetch'), 'connection']]) {
    const failure = safetyState.safetyCheckError(error);
    assert.equal(failure.reason, reason); assert.equal(failure.stage, 'blocked_contact_ids');
    assert.ok(!failure.message.includes('.sql'));
  }
});

function safetyService(response) {
  let owner = 'alice', calls = 0;
  const exports = {};
  const source = ts.transpileModule(readFileSync('src/lib/safety.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const supabase = { auth: { getSession: async () => ({ data: { session: { user: { id: owner } } } }) }, rpc: async () => { calls++; return response(); } };
  vm.runInNewContext(source, { exports, setTimeout, clearTimeout, require: name => name === '@/lib/supabase' ? { supabase } : name === './network-deadline' ? { withDeadline: operation => Promise.race([Promise.resolve(operation), new Promise((_, reject) => setTimeout(() => reject({ code: 'REQUEST_TIMEOUT' }), 20))]) } : name === './safety-state' ? safetyState : {} });
  return { service: exports, calls: () => calls, changeOwner: next => { owner = next; exports.resetSafetyCheck(); } };
}
test('concurrent safety checks share one request and account changes discard old confirmations', async () => {
  const { service, calls, changeOwner } = safetyService(async () => { await tick(); return { data: [{ person: 'blocked' }], error: null }; });
  service.resetSafetyCheck();
  const results = await Promise.all([service.blockedUserIds(), service.blockedUserIds()]);
  assert.equal(calls(), 1); assert.equal(results[0].has('blocked'), true);
  changeOwner('bob'); await service.blockedUserIds(); assert.equal(calls(), 2);
});
test('a stalled safety check reaches an actionable error instead of loading forever', async () => {
  const { service } = safetyService(() => new Promise(() => {})); service.resetSafetyCheck();
  await assert.rejects(service.blockedUserIds(), error => error.reason === 'timeout');
  assert.equal(safetyState.getSafetyStatus().phase, 'error');
});
