import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/food-products.sql', 'utf8');

test('shared products are client read-only and user corrections are owner-scoped', () => {
  assert.match(sql, /grant select on public\.product_cache to anon, authenticated/i);
  assert.doesNotMatch(sql, /grant[^;]*(insert|update|delete)[^;]*product_cache/i);
  assert.match(sql, /alter table public\.user_products enable row level security/i);
  assert.match(sql, /user_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /primary key \(user_id, barcode\)/i);
});
