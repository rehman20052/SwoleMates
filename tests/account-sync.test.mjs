import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/account-sync-core.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports });
const { createAccountList } = exports;
const copy = (value) => JSON.parse(JSON.stringify(value));
function storage() {
  const data = new Map();
  return { data, failWrite: false, async getItem(key) { return data.get(key) ?? null; },
    async setItem(key, value) { if (this.failWrite) throw Error('Device cache full'); data.set(key, value); } };
}
function backend() {
  const accounts = new Map();
  const state = { failRead: false, failSave: false, pauseSave: null, saves: 0 };
  function remote(owner) {
    const rows = (namespace) => {
      const key = `${owner}:${namespace}`;
      if (!accounts.has(key)) accounts.set(key, new Map()); return accounts.get(key);
    };
    return {
      async read(namespace) { if (state.failRead) throw Error('Network down'); return copy([...rows(namespace).values()]); },
      async import(namespace, records) {
        for (const item of records) if (!rows(namespace).has(item.id)) rows(namespace).set(item.id, { ...copy(item), revision: 1, deleted: false });
      },
      async save(namespace, changes) {
        state.saves++;
        if (state.pauseSave) await state.pauseSave();
        if (state.failSave) throw Error('Network down');
        for (const item of changes) {
          if ((rows(namespace).get(item.id)?.revision ?? 0) !== item.expectedRevision) throw Error('Newer version exists');
        }
        for (const item of changes) rows(namespace).set(item.id, { id: item.id, payload: copy(item.payload), deleted: item.deleted, revision: item.expectedRevision + 1 });
      },
    };
  }
  return { state, remote };
}
const valid = (item) => item && typeof item.id === 'string';
test('explicit food undo restores its tombstone without removing another device addition', async () => {
  const server = backend(), a = device(server, 'alice', 'food');
  const original = { id: 'meal', calories: 400 };
  await a.store.load([original]); await a.store.change(() => []);
  const b = device(server, 'alice', 'food'); await b.store.load([]);
  await b.store.change(rows => [...rows, { id: 'other', calories: 200 }]);
  await assert.rejects(a.store.change(rows => [...rows, original]), /deleted/);
  await a.store.change(rows => [...rows, original], ['meal']);
  assert.deepEqual(copy(await b.store.refresh()).map(row => row.id).sort(), ['meal', 'other']);
});
test('structured workout sets, reps and weights reopen on a second device and keep later edits', async () => {
  const server = backend();
  const phone = device(server, 'alice', 'workout_logs'); await phone.store.load([]);
  const log = { id: 'log-sets', date: '2026-10-03', title: 'Push day', verified: false,
    exercises: [{ id: 'bench', name: 'Bench press', sets: 3, reps: 8, weight: 135, unit: 'lb' }] };
  await phone.store.change(rows => [...rows, log]);
  const tablet = device(server, 'alice', 'workout_logs');
  assert.equal((await tablet.store.load([]))[0].exercises[0].weight, 135);
  await tablet.store.change(rows => rows.map(row => ({ ...row, exercises: row.exercises.map(exercise => ({ ...exercise, weight: 145, reps: 6 })) })));
  const reopened = await device(server, 'alice', 'workout_logs').store.load([]);
  assert.equal(reopened[0].exercises[0].weight, 145); assert.equal(reopened[0].exercises[0].reps, 6);
});
function device(server, userId = 'alice', namespace = 'recipes', local = storage()) {
  return { local, store: createAccountList({ userId, namespace, local, remote: server.remote(userId), identify: (item) => item.id, validate: valid }) };
}
test('meal and lift image selections carry to a second device and automatic clears them', async () => {
  for (const namespace of ['recipes', 'food', 'lifts']) {
    const server = backend(); const phone = device(server, 'alice', namespace);
    await phone.store.load([]);
    const artwork = { kind: 'photo', path: '11111111-1111-4111-8111-111111111111/item-artwork/123-photo.jpg' };
    await phone.store.change(() => [{ id: 'custom', name: 'Custom entry', artwork }]);
    const tablet = device(server, 'alice', namespace);
    assert.deepEqual(copy(await tablet.store.load([]))[0].artwork, artwork);
    await tablet.store.change(rows => rows.map(row => ({ ...row, artwork: undefined })));
    assert.equal((await phone.store.refresh())[0].artwork, undefined);
  }
});
test('two devices merge independent recipe additions and import only missing IDs', async () => {
  const server = backend(); const a = device(server); const b = device(server);
  await a.store.load([{ id: 'old', name: 'Original' }]); await b.store.load([{ id: 'old', name: 'Stale browser' }]);
  await Promise.all([
    a.store.change((rows) => [...rows, { id: 'a', name: 'Phone recipe' }]),
    b.store.change((rows) => [...rows, { id: 'b', name: 'Tablet recipe' }]),
  ]);
  const rows = copy(await device(server).store.load([]));
  assert.deepEqual(rows.map((row) => row.id).sort(), ['a', 'b', 'old']);
  assert.equal(rows.find((row) => row.id === 'old').name, 'Original');
});
test('a deletion survives refresh, a stale device migration, and cleared local caches', async () => {
  const server = backend(); const a = device(server); const old = { id: 'r', name: 'Delete me' };
  await a.store.load([old]); await a.store.change(() => []);
  assert.deepEqual(copy(await device(server).store.load([old])), []);
  const b = device(server); await b.store.load([]);
  await assert.rejects(b.store.change(() => [old]), /deleted on another device/);
  assert.deepEqual(copy(await b.store.refresh()), []);
});
test('two devices editing the same row detect a conflict rather than silently overwrite', async () => {
  const server = backend(); const a = device(server); const b = device(server);
  await a.store.load([{ id: 'r', name: 'Original' }]); await b.store.load([]);
  let release; const gate = new Promise((resolve) => { release = resolve; });
  let paused; const entered = new Promise((resolve) => { paused = resolve; });
  let once = true;
  server.state.pauseSave = async () => { if (once) { once = false; paused(); await gate; } };
  const pending = a.store.change((rows) => rows.map((row) => ({ ...row, name: 'Older edit' })));
  await entered;
  await b.store.change((rows) => rows.map((row) => ({ ...row, name: 'Newer edit' })));
  release(); await pending; assert.equal(a.store.status().phase, 'conflict');
  assert.equal((await a.store.refresh())[0].name, 'Older edit'); await a.store.resolve('server'); assert.equal((await a.store.refresh())[0].name, 'Newer edit');
});
test('offline saves persist locally, and local write failures never report saved', async () => {
  const server = backend(); const a = device(server); await a.store.load([{ id: 'r', name: 'Original' }]);
  server.state.failSave = true;
  await a.store.change(() => []); assert.equal(a.store.status().phase, 'pending'); assert.deepEqual(copy(await a.store.cached()), []);
  server.state.failSave = false; a.local.failWrite = true;
  await assert.rejects(a.store.change((rows) => [...rows, { id: 'new' }]), /Device cache full/);
  assert.deepEqual(copy(await device(server).store.load([])).map((row) => row.id).sort(), ['r']);
});
test('account-scoped caches and server records never carry into a different account', async () => {
  const server = backend(); const local = storage();
  const alice = device(server, 'alice', 'recipes', local); const bob = device(server, 'bob', 'recipes', local);
  await alice.store.load([{ id: 'alice-private' }]); await bob.store.load([]);
  assert.deepEqual(copy(await bob.store.cached()), []);
  assert.deepEqual(copy(await alice.store.cached()), [{ id: 'alice-private' }]);
  await bob.store.change(() => [{ id: 'bob-private' }]);
  assert.deepEqual(copy(await alice.store.refresh()), [{ id: 'alice-private' }]);
});
test('offline relaunch preserves additions and pending deletions, reconnect syncs only the owning account', async () => {
  const server=backend(), local=storage(); const a=device(server,'alice','food',local);
  await a.store.load([{id:'old'}]); server.state.failRead=true;server.state.failSave=true;
  await a.store.change(rows => [...rows,{id:'new',calories:200}]); await a.store.change(rows => rows.filter(row => row.id!=='old'));
  const reopened=device(server,'alice','food',local); assert.deepEqual(copy(await reopened.store.load([])),[{id:'new',calories:200}]);
  assert.equal(reopened.store.status().phase,'pending');
  assert.deepEqual(copy(await device(server,'bob','food',local).store.load([])),[]);
  server.state.failRead=false;server.state.failSave=false;await reopened.store.retry();
  assert.deepEqual(copy(await device(server,'alice','food').store.load([])),[{id:'new',calories:200}]);
});
test('conflicting local edits survive restart until explicit reapply', async () => {
  const server=backend(),local=storage(),a=device(server,'alice','recipes',local);
  await a.store.load([{id:'r',name:'server'}]);server.state.failRead=true;server.state.failSave=true;
  await a.store.change(rows => rows.map(row=>({...row,name:'local'})));
  server.state.failRead=false;server.state.failSave=false;
  const b=device(server);await b.store.load([]);await b.store.change(rows=>rows.map(row=>({...row,name:'other device'})));
  await a.store.retry();assert.equal(a.store.status().phase,'conflict');
  const reopened=device(server,'alice','recipes',local);assert.equal((await reopened.store.load([]))[0].name,'local');
  await reopened.store.resolve('reapply');assert.equal((await device(server).store.load([]))[0].name,'local');
});
test('plan, dated food, lifts with history, settings, and hidden chats reopen on a second device', async () => {
  const server = backend();
  const records = {
    nutrition_plan: { id: 'plan', calorieGoal: 2300, weighIns: [{ date: '2026-10-02', weight: 180 }] },
    food: { id: 'food', date: '2026-10-02', calories: 600 },
    lifts: { id: 'lift', currentWeight: 135, goalWeight: 225, history: [{ date: '2026-10-02', weight: 135 }] },
    settings: { id: 'weekly-workout-goal', value: 4 }, hidden_chats: { id: 'match' },
    workout_logs: { id: 'workout', date: '2026-10-02' }, workout_deletions: { id: 'planned:deleted' },
  };
  for (const [namespace, record] of Object.entries(records)) {
    const a = device(server, 'alice', namespace); await a.store.load([]); await a.store.change(() => [record]);
    assert.deepEqual(copy(await device(server, 'alice', namespace).store.load([])), [record]);
  }
});
test('mutating an input object still produces a save and canonical object key order avoids redundant writes', async () => {
  const server = backend(); const a = device(server); await a.store.load([{ id: 'r', name: 'First' }]);
  await a.store.change((rows) => { rows[0].name = 'Updated'; return rows; });
  assert.equal((await a.store.refresh())[0].name, 'Updated');
  const count = server.state.saves;
  await a.store.change(() => [{ name: 'Updated', id: 'r', unused: undefined }]);
  assert.equal(server.state.saves, count);
});
test('hide, show, and hide again intentionally restore only the hidden-chat flag', async () => {
  const server = backend();
  const options = { userId: 'alice', namespace: 'hidden_chats', local: storage(), remote: server.remote('alice'), identify: (id) => id, validate: (id) => typeof id === 'string', allowRestore: true };
  const a = createAccountList(options); await a.load([]);
  await a.change(() => ['match']); await a.change(() => []); await a.change(() => ['match']);
  const b = createAccountList({ ...options, local: storage() });
  assert.deepEqual(copy(await b.load([])), ['match']);
});

 test('workout plans and partial drafts share settings without replacing the weekly goal or logging a workout', async () => {
  const server = backend(); const phone = device(server, 'alice', 'settings');
  await phone.store.load([{ id: 'weekly-workout-goal', value: 5 }]);
  const plan = { id: 'workout-plan:push', value: { updatedAt: 1, content: JSON.stringify({ title: 'Push', notes: '', rows: [{ id: 'bench', exercise: 'Bench press', customName: '', sets: '3', reps: '8', weight: '', unit: 'lb' }] }) } };
  const draft = { id: 'draft:workout:2026-10-05', value: { updatedAt: 2, content: plan.value.content } };
  await phone.store.change(rows => [...rows, plan, draft]);
  const tablet = device(server, 'alice', 'settings'); const restored = await tablet.store.load([]);
  assert.equal(restored.find(row => row.id === plan.id).value.content, plan.value.content);
  assert.equal(JSON.parse(restored.find(row => row.id === draft.id).value.content).rows[0].weight, '');
  await tablet.store.change(rows => rows.map(row => row.id === 'weekly-workout-goal' ? { ...row, value: 4 } : row));
  assert.equal((await phone.store.refresh()).length, 3);
  await phone.store.change(rows => rows.map(row => row.id === draft.id ? { ...row, value: { updatedAt: 3, content: '' } } : row));
  assert.equal((await tablet.store.refresh()).find(row => row.id === draft.id).value.content, '');
  assert.equal((await device(server, 'alice', 'workout_logs').store.load([])).length, 0);
  assert.equal((await device(server, 'bob', 'settings').store.load([])).length, 0);
});
