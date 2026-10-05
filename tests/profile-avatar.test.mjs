import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('social avatars prefer the saved crop while retaining visibility and legacy photo fallback', async () => {
  const db = new PGlite();
  const visible = '11111111-1111-4111-8111-111111111111';
  const legacy = '22222222-2222-4222-8222-222222222222';
  const hidden = '33333333-3333-4333-8333-333333333333';
  try {
    await db.exec(`create role authenticated; create role anon;
      create table user_account(id uuid, full_name text);
      create table discover_profiles(id uuid, profile jsonb);
      create table profile_photo(user_id uuid, storage_path text, sort_order int);
      create table post(id uuid, author_id uuid);
      create table post_comment(id uuid, author_id uuid, post_id uuid);
      create table post_like(user_id uuid, post_id uuid);
      create table comment_like(user_id uuid, comment_id uuid);
      create function can_see_author(person uuid) returns boolean language sql as $$ select person <> '${hidden}'::uuid $$;
      insert into user_account values ('${visible}','New'), ('${legacy}','Legacy'), ('${hidden}','Hidden');
      insert into discover_profiles values ('${visible}','{"avatar":"user/avatar.jpg","photos":["user/original.jpg"]}'), ('${hidden}','{"avatar":"hidden/avatar.jpg"}');
      insert into profile_photo values ('${visible}','user/original.jpg',1), ('${legacy}','user/clip.mp4',1), ('${legacy}','user/photo.jpg',2);`);
    const sql = readFileSync('supabase/profile-avatar.sql', 'utf8');
    await db.exec(sql); await db.exec(sql);
    await db.exec('set role authenticated');
    const rows = (await db.query('select * from social_people($1::uuid[]) order by full_name', [[visible, legacy, hidden]])).rows;
    assert.deepEqual(rows.map(row => [row.full_name, row.photo_path]), [['Legacy','user/photo.jpg'], ['New','user/avatar.jpg']]);
    await db.exec('reset role');
    assert.equal((await db.query('select profile->\'photos\'->>0 as photo from discover_profiles where id=$1', [visible])).rows[0].photo, 'user/original.jpg');
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from social_people($1::uuid[])', [[visible]]), /permission denied/i);
  } finally { await db.close(); }
});
