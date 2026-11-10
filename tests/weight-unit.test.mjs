import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const { convertWeight } = loadTs('src/lib/weight-unit.ts');
test('weight conversion preserves physical load and round trips without display rounding', () => {
  assert.equal(convertWeight(225, 'lb', 'lb'), 225);
  assert.ok(Math.abs(convertWeight(225, 'lb', 'kg') - 102.05828325) < 1e-8);
  assert.ok(Math.abs(convertWeight(convertWeight(225, 'lb', 'kg'), 'kg', 'lb') - 225) < 1e-8);
  assert.equal(convertWeight(0, 'kg', 'lb'), 0);
});
