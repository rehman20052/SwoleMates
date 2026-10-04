import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/food-search.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports });
const { foodChoices } = exports;
const food = { meal: 'Breakfast', name: 'Greek yogurt', calories: 100, protein: 15, carbs: 5, fats: 0 };
test('recent reuse prefers the newest same-day image choice', () => {
  const entries = [{ ...food, id: 'new', date: '2026-10-04', artwork: { kind: 'preset', key: 'oats' } }, { ...food, id: 'old', date: '2026-10-04', artwork: { kind: 'preset', key: 'yogurt' } }];
  assert.equal(foodChoices(entries, [], '')[0].food.artwork.key, 'oats');
});
test('recent foods deduplicate repeat logs, keep portion variants, and search recipes together', () => {
  const entries = [
    { ...food, id: 'old', date: '2026-10-01' },
    { ...food, id: 'latest', name: ' Greek   Yogurt ', date: '2026-10-03' },
    { ...food, id: 'larger', date: '2026-10-02', calories: 200, protein: 30 },
  ];
  const recipes = [{ ...food, id: 'recipe', name: 'Greek yogurt bowl' }];
  const choices = foodChoices(entries, recipes, ' YOGURT greek ');
  assert.equal(choices.length, 3);
  assert.equal(choices[0].food.id, 'latest');
  assert.equal(choices[1].food.id, 'larger');
  assert.equal(choices[2].source, 'recipe');
  assert.equal(foodChoices(entries, recipes, 'pizza').length, 0);
  assert.equal(entries.length, 3, 'search never changes the saved journal');
  assert.equal(foodChoices([], [], '').length, 0, 'no seeded placeholder foods');
});
