import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('cancelling a pending request preserves foreign keys and completed workout history', async () => {
  const db = new PGlite();
  const sender = '11111111-1111-4111-8111-111111111111';
  const recipient = '22222222-2222-4222-8222-222222222222';
  const pending = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const accepted = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  try {
    await db.exec(`create role authenticated; create role anon; create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
      create table public.match_requests(id uuid primary key, from_user_id uuid, to_user_id uuid, status text check(status in ('pending','accepted','declined')));
      create table public.planned_workout(id int primary key, match_id uuid not null references public.match_requests(id), status text);
      insert into public.match_requests values ('${pending}','${sender}','${recipient}','pending'), ('${accepted}','${sender}','${recipient}','accepted');
      insert into public.planned_workout values (1,'${pending}','proposed'), (2,'${pending}','scheduled'), (3,'${pending}','completed'), (4,'${accepted}','scheduled');`);
    const sql = readFileSync('supabase/cancel-match-requests.sql', 'utf8');
    await db.exec(sql); await db.exec(sql);
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${recipient}';`);
    await assert.rejects(db.query('select public.cancel_match_request($1)', [pending]), /not its sender/i);
    await db.exec(`set request.jwt.claim.sub = '${sender}';`);
    await assert.rejects(db.query('select public.cancel_match_request($1)', [accepted]), /no longer pending/i);
    await db.query('select public.cancel_match_request($1)', [pending]);
    assert.equal((await db.query('select status from public.match_requests where id=$1', [pending])).rows[0].status, 'declined');
    await db.exec('reset role');
    assert.deepEqual((await db.query('select id,status from public.planned_workout order by id')).rows, [
      { id: 1, status: 'cancelled' }, { id: 2, status: 'cancelled' }, { id: 3, status: 'completed' }, { id: 4, status: 'scheduled' },
    ]);
    await db.exec('set role anon');
    await assert.rejects(db.query('select public.cancel_match_request($1)', [pending]), /permission denied/i);
  } finally { await db.close(); }
});

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
