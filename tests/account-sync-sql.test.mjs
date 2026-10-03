import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('account migration enforces account ownership, atomic versions, and deletion tombstones', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
      insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');`);
    const sql = readFileSync('supabase/account-sync.sql', 'utf8');
    await db.exec(sql);
    await db.exec(sql); // Safe to rerun in SQL Editor.
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';`);
    const save = (changes) => db.query('select public.account_save_records($1,$2::jsonb)', ['recipes', JSON.stringify(changes)]);
    const imports = (items) => db.query('select public.account_import_records($1,$2::jsonb)', ['recipes', JSON.stringify(items)]);
    await save([{ id: 'r1', payload: { name: 'My recipe' }, expectedRevision: 0 }]);
    await imports([{ id: 'r1', payload: { name: 'Stale browser' } }]);
    assert.equal((await db.query('select payload from public.account_records')).rows[0].payload.name, 'My recipe');
    await assert.rejects(save([{ id: 'r2', payload: { name: 'Must roll back' }, expectedRevision: 0 }, { id: 'r1', payload: {}, expectedRevision: 0 }]), /newer version/i);
    assert.equal((await db.query('select count(*)::int as total from public.account_records')).rows[0].total, 1);
    await save([{ id: 'r1', payload: null, deleted: true, expectedRevision: 1 }]);
    await imports([{ id: 'r1', payload: { name: 'Deleted recipe' } }]);
    assert.equal((await db.query('select deleted,revision from public.account_records')).rows[0].deleted, true);
    await assert.rejects(db.exec(`insert into public.account_records(user_id,namespace,record_id,payload) values ('22222222-2222-4222-8222-222222222222','recipes','intruder','{}');`), /row-level security/i);
    await db.exec(`set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';`);
    assert.equal((await db.query('select count(*)::int as total from public.account_records')).rows[0].total, 0);
    await save([{ id: 'r1', payload: { name: 'Different account' }, expectedRevision: 0 }]);
    assert.equal((await db.query('select payload from public.account_records')).rows[0].payload.name, 'Different account');
    await db.exec('set role anon;');
    await assert.rejects(db.exec('select * from public.account_records'), /permission denied/i);
    await assert.rejects(save([]), /permission denied/i);
  } finally { await db.close(); }
});
