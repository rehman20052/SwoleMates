import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333';
const script=name=>readFileSync(`supabase/${name}.sql`,'utf8');
async function fixture() {
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values('${a}'),('${b}'),('${c}');
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
    create table public.user_account(id uuid primary key references auth.users(id),social_public boolean default true);
    insert into public.user_account values('${a}',true),('${b}',true),('${c}',true);
    create table public.block(user_id uuid,blocked_id uuid,primary key(user_id,blocked_id));
    create table public.match_requests(id uuid primary key default gen_random_uuid(),from_user_id uuid references auth.users(id),to_user_id uuid references auth.users(id),status text default 'pending' check(status in ('pending','accepted','declined')),created_at timestamptz default now(),unique(from_user_id,to_user_id));
    create table public.match_messages(id uuid primary key default gen_random_uuid(),match_id uuid references public.match_requests(id) on delete cascade,sender_id uuid,body text,created_at timestamptz default now());
    create table public.planned_workout(planned_workout_id uuid primary key default gen_random_uuid(),match_id uuid references public.match_requests(id),created_by uuid,title text,status text,workout_date date,notes text);
    create table public.workout_logs(log_id uuid primary key default gen_random_uuid(),user_id uuid,planned_workout_id uuid references public.planned_workout(planned_workout_id),notes text);
    alter table public.match_requests enable row level security;alter table public.match_messages enable row level security;alter table public.planned_workout enable row level security;
    grant all on public.match_requests,public.match_messages,public.planned_workout to authenticated;
    create policy member_requests on public.match_requests for all to authenticated using(auth.uid() in(from_user_id,to_user_id)) with check(auth.uid() in(from_user_id,to_user_id));
    create policy messages_legacy on public.match_messages for all to authenticated using(true) with check(true);
    create policy plans_legacy on public.planned_workout for all to authenticated using(true) with check(true);
    `);
  await db.exec(script('discover'));await db.exec(script('account-sync'));
  await db.exec(script('reliability-safety'));await db.exec(script('reliability-safety'));
  await db.exec(script('reliability-sync'));await db.exec(script('reliability-sync'));
  await db.exec(script('shared-sessions'));await db.exec(script('account-controls'));
  return db;
}
async function as(db,id) {await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${id}';`);}
test('RPC transitions require membership, preserve participants and never autoaccept old declined requests',async()=>{
  const db=await fixture();try{
    await as(db,a);await db.query('select public.send_match_request($1)',[b]);
    const row=(await db.query('select * from public.match_requests')).rows[0];
    await assert.rejects(db.query('update public.match_requests set to_user_id=$1',[c]),/permission denied/i);
    await assert.rejects(db.query('select public.transition_match($1,$2)',[row.id,'accept']),/Invalid match transition/i);
    await as(db,c);await assert.rejects(db.query('select public.transition_match($1,$2)',[row.id,'accept']),/Not a participant/i);
    await as(db,b);await db.query('select public.transition_match($1,$2)',[row.id,'decline']);
    await db.query('select public.send_match_request($1)',[a]);
    const reopened=(await db.query('select * from public.match_requests')).rows[0];
    assert.equal(reopened.status,'pending');assert.equal(reopened.requested_by,b);assert.equal(reopened.from_user_id,a);
    await as(db,a);await db.query('select public.send_match_request($1)',[b]);
    assert.equal((await db.query('select status from public.match_requests')).rows[0].status,'accepted');
    await db.query('select public.transition_match($1,$2)',[row.id,'unmatch']);await db.query('select public.send_match_request($1)',[b]);
    assert.equal((await db.query('select status from public.match_requests')).rows[0].status,'pending');
  }finally{await db.close();}
});
test('blocking in either direction removes discovery, messages and invitations atomically; unblocking keeps match ended',async()=>{
  const db=await fixture();try{
    await db.exec(`insert into public.discover_profiles(id,profile,latitude,longitude) values('${a}','{"fullName":"A","birthDate":"secret","zipCode":"secret"}',40,-74),('${b}','{"fullName":"B","password":"secret"}',40,-74);`);
    await as(db,a);await db.query('select public.send_match_request($1)',[b]);await as(db,b);await db.query('select public.send_match_request($1)',[a]);
    const match=(await db.query('select id from public.match_requests')).rows[0].id;
    await db.query('insert into public.match_messages(match_id,sender_id,body) values($1,$2,$3)',[match,b,'hello']);
    await db.query('insert into public.planned_workout(match_id,created_by,status) values($1,$2,$3)',[match,b,'scheduled']);
    assert.equal((await db.query('select * from public.discover_people()')).rows[0].profile.birthDate,undefined);
    await db.query('select public.block_contact($1)',[a]);await as(db,a);
    assert.equal((await db.query('select * from public.discover_people()')).rows.length,0);
    assert.equal((await db.query('select * from public.match_messages')).rows.length,0);
    assert.equal((await db.query('select * from public.planned_workout')).rows.length,0);
    await assert.rejects(db.query('select public.send_match_request($1)',[b]),/blocked/i);
    await assert.rejects(db.query('insert into public.match_messages(match_id,sender_id,body) values($1,$2,$3)',[match,a,'bypass']),/row-level security/i);
    await db.exec('reset role');assert.equal((await db.query('select status from public.planned_workout')).rows[0].status,'cancelled');
    await db.exec('delete from public.block');assert.equal((await db.query('select status from public.match_requests')).rows[0].status,'unmatched');
  }finally{await db.close();}
});
test('save receipts prevent lost-response duplicates, deltas paginate, ownership and atomic conflicts hold',async()=>{
  const db=await fixture();try{
    await as(db,a);
    const changes=JSON.stringify([{id:'meal',payload:{id:'meal',calories:123},deleted:false,expectedRevision:0}]);
    const save=()=>db.query('select public.account_commit_operation($1,$2::jsonb,$3)',['food',changes,'op-123']);
    await save();await save();assert.equal(Number((await db.query('select revision from public.account_records')).rows[0].revision),1);
    await assert.rejects(db.query('select public.account_commit_operation($1,$2::jsonb,$3)',['food','[]','op-123']),/reused/i);
    await assert.rejects(db.exec("update public.account_records set deleted=true"),/permission denied/i);
    const delta=(await db.query('select * from public.account_read_delta($1,$2,$3)',['food',0,1])).rows;
    assert.equal(delta.length,1);assert.equal((await db.query('select * from public.account_read_delta($1,$2,$3)',['food',delta[0].change_sequence,1])).rows.length,0);
    await as(db,b);assert.equal((await db.query('select * from public.account_read_delta($1,$2,$3)',['food',0,500])).rows.length,0);
    const exported=(await db.query('select public.export_my_account() as data')).rows[0].data;assert.equal(exported.account_records.length,0);
  }finally{await db.close();}
});
test('first start locks shared plans, private logs survive account cleanup, finish shares no attendance',async()=>{
  const db=await fixture();try{
    await as(db,a);await db.query('select public.send_match_request($1)',[b]);await as(db,b);await db.query('select public.send_match_request($1)',[a]);
    const match=(await db.query('select id from public.match_requests')).rows[0].id;
    const plan=(await db.query('insert into public.planned_workout(match_id,created_by,status) values($1,$2,$3) returning planned_workout_id',[match,a,'scheduled'])).rows[0].planned_workout_id;
    await as(db,a);await db.query('select public.workout_session_action($1,$2,$3::jsonb)',[plan,'edit',JSON.stringify([{name:'Squat',sets:3,reps:8}])]);
    await as(db,b);await assert.rejects(db.query('select public.workout_session_action($1,$2,$3::jsonb)',[plan,'edit','[]']),/not its proposer/i);
    await db.query('select public.workout_session_action($1,$2)',[plan,'training']);
    await as(db,a);await assert.rejects(db.query('select public.workout_session_action($1,$2,$3::jsonb)',[plan,'edit','[]']),/locked/i);
    await as(db,b);await db.query('select public.workout_session_action($1,$2)',[plan,'finished']);await db.query('select public.workout_session_action($1,$2)',[plan,'finished']);
    await db.exec('reset role');await db.query('insert into public.workout_logs(user_id,planned_workout_id,notes) values($1,$2,$3)',[b,plan,'private weights']);
    await db.exec('set role service_role');await db.query('select public.remove_account_data($1)',[a]);
    await db.exec('reset role');const logs=(await db.query('select * from public.workout_logs')).rows;
    assert.equal(logs.length,1);assert.equal(logs[0].notes,'private weights');assert.equal(logs[0].planned_workout_id,null);
  }finally{await db.close();}
});
