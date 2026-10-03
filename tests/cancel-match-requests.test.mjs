import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('cancellation repair permits only the sender of a pending request', async () => {
  const db = new PGlite();
  const sender = '11111111-1111-4111-8111-111111111111';
  const recipient = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`create role authenticated; create role anon; create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
      create table public.match_requests(id int primary key, from_user_id uuid, to_user_id uuid, status text);
      insert into public.match_requests values (1, '${sender}', '${recipient}', 'pending'), (2, '${sender}', '${recipient}', 'accepted');`);
    const sql = readFileSync('supabase/cancel-match-requests.sql', 'utf8');
    await db.exec(sql); await db.exec(sql);
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${recipient}';`);
    assert.equal((await db.query('delete from public.match_requests returning id')).rows.length, 0, 'recipient cannot cancel');
    await db.exec(`set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';`);
    assert.equal((await db.query('delete from public.match_requests returning id')).rows.length, 0, 'outsider cannot cancel');
    await db.exec(`set request.jwt.claim.sub = '${sender}';`);
    assert.deepEqual((await db.query('delete from public.match_requests returning id')).rows, [{ id: 1 }]);
    assert.deepEqual((await db.query('select id from public.match_requests')).rows, [{ id: 2 }], 'accepted chat survives');
    await db.exec('set role anon;');
    await assert.rejects(db.exec('delete from public.match_requests'), /permission denied/i);
  } finally { await db.close(); }
});
