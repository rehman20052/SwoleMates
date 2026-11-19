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
test('common-food search returns per-100g macro data ahead of personal matches', () => {
  const catalog = [{ id: 'banana', name: 'Banana', per100g: { calories: 89, protein: 1.1, carbs: 22.8, fats: 0.3 } }];
  const choices = foodChoices([], [], 'banana', catalog);
  assert.equal(choices.length, 1);
  assert.equal(foodChoices([], [], 'peeled banana', catalog).length, 0, 'explicit preparations require a matching description');
  const banana = choices[0];
  assert.equal(banana.source, 'common');
  assert.equal(banana.food.per100g.calories, 89);
});
test('bundled USDA catalog includes broad cooked-food coverage with complete macros', () => {
  const catalog = JSON.parse(readFileSync('src/data/usda-foods.json', 'utf8'));
  assert.ok(catalog.length > 10000, `expected more than 10,000 foods, found ${catalog.length}`);
  assert.ok(catalog.filter(food => /cooked|boiled|baked|roasted|grilled|fried|steamed/i.test(food.name)).length > 1000, 'prepared foods are broadly represented');
  assert.ok(catalog.every(food => food.id.startsWith('usda-') && food.name && ['calories', 'protein', 'carbs', 'fats'].every(key => Number.isFinite(food.per100g[key]))));
});
test('specific preparations never fall back to a generic cooked description', () => {
  const catalog = [{ id: 'broccoli-cooked', name: 'Broccoli, cooked', per100g: { calories: 35, protein: 2.4, carbs: 7.2, fats: 0.4 } }];
  assert.equal(foodChoices([], [], 'steamed broccoli', catalog).length, 0);
  assert.equal(foodChoices([], [], 'cooked broccoli', [{ ...catalog[0], name: 'Broccoli, uncooked' }]).length, 0, 'cooked does not accidentally match uncooked');
});
test('raw, boiled, grilled and fried queries preserve preparation distinctions', () => {
  const catalog = ['raw','boiled','grilled','fried','cooked','uncooked'].map(preparation => ({ id:preparation,name:`Chicken, ${preparation}`,per100g:{calories:100,protein:10,carbs:0,fats:5} }));
  assert.deepEqual(Array.from(foodChoices([],[],'raw chicken',catalog),choice => choice.food.id).sort(),['raw','uncooked'].sort());
  for (const preparation of ['boiled','grilled','fried']) assert.deepEqual(Array.from(foodChoices([],[],`${preparation} chicken`,catalog),choice => choice.food.id),[preparation]);
  assert.equal(foodChoices([],[],'cooked chicken',catalog).length,4);
});
