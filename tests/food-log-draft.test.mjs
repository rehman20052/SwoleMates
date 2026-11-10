import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => { if (!(name in dependencies)) throw Error(name); return dependencies[name]; } });
  return exports;
}
const scanner = load('src/lib/food-scanner.ts');
const { entryIngredients, draftFood, fillScannedIngredient, portionGrams, mealAt, recentMeals, mealFromTotals, mealTotalsInput, recipeFood, savedRecipeServing } = load('src/lib/food-log-draft.ts', { './food-scanner': scanner });
const chicken = () => ({ id: 'chicken', name: 'Chicken', basis: '100 g', source: 'manual', servings: '1.5', calories: '165', protein: '31', carbs: '0', fats: '3.6' });

test('a scanned meal batches distinct barcodes in one owner-scoped write', async () => {
  let authCalls = 0;
  const writes = [];
  const supabase = {
    auth: { getUser: async () => { authCalls++; return { data: { user: { id: 'owner' } } }; } },
    from: table => ({ upsert: async (rows, options) => { writes.push({ table, rows, options }); return { error: null }; } }),
  };
  const { rememberConfirmedIngredients } = load('src/scanning/product-memory.ts', {
    '@/lib/supabase': { supabase }, './barcodes': load('src/scanning/barcodes.ts'),
  });
  const items = [
    { ...chicken(), barcode: '036000291452' },
    { ...chicken(), barcode: '00036000291452', name: 'Updated chicken' },
    { ...chicken(), barcode: '4006381333931', name: 'Bread' },
    { ...chicken(), barcode: 'invalid' },
  ];
  assert.equal(await rememberConfirmedIngredients(items, 'owner'), true);
  assert.equal(authCalls, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].table, 'user_products');
  assert.equal(writes[0].options.onConflict, 'user_id,barcode');
  assert.deepEqual(Array.from(writes[0].rows, row => [row.user_id, row.barcode, row.name]), [
    ['owner', '00036000291452', 'Updated chicken'], ['owner', '04006381333931', 'Bread'],
  ]);
  assert.equal(await rememberConfirmedIngredients(items, 'different-owner'), false);
  assert.equal(writes.length, 1);
});

test('new meals follow local time across grouping boundaries', () => {
  for (const [hour, minute, category] of [[0, 0, 'Breakfast'], [10, 59, 'Breakfast'], [11, 0, 'Lunch'], [15, 59, 'Lunch'], [16, 0, 'Dinner'], [23, 59, 'Dinner']]) {
    assert.equal(mealAt(new Date(2026, 0, 1, hour, minute)), category);
  }
});

test('recent meals search covers seven local dates across a year boundary', () => {
  const entries = [
    { id: 'old', name: 'Chicken wrap', date: '2025-12-26' },
    { id: 'cutoff', name: 'Chicken salad wrap', date: '2025-12-27' },
    { id: 'same-day-first', name: 'Chicken wrap', date: '2026-01-02' },
    { id: 'different', name: 'Chicken soup', date: '2026-01-01' },
    { id: 'same-day-second', name: 'Chicken and egg wrap', date: '2026-01-02' },
    { id: 'food-1767344400000-example', name: 'Chicken wrap', date: '2026-01-02' },
    { id: 'future', name: 'Chicken wrap', date: '2026-01-03' },
  ];
  const matches = recentMeals(entries, '  WRAP   chicken ', new Date(2026, 0, 2, 0, 5));
  assert.deepEqual(Array.from(matches, item => item.id), ['food-1767344400000-example', 'same-day-first', 'same-day-second', 'cutoff']);
  assert.equal(entries[0].id, 'old', 'search does not reorder the journal');
});

test('whole meal totals distinguish unknown macros from zero and clear ingredient snapshots', () => {
  const values = { calories: '250,5', protein: '0', carbs: '12.5', fats: '' };
  const entry = mealFromTotals(' Sandwich ', 'Lunch', values);
  assert.equal(entry.name, 'Sandwich'); assert.equal(entry.calories, 250.5); assert.equal(entry.protein, 0);
  assert.deepEqual(Array.from(entry.incompleteNutrients), ['fats']); assert.equal(entry.scannedIngredients, undefined);
  assert.deepEqual({ ...mealTotalsInput(entry) }, { ...values, calories: '250.5' });
  for (const calories of ['', '-1', 'NaN', 'Infinity']) assert.equal(mealFromTotals('Sandwich', 'Lunch', { ...values, calories }), null);
  assert.equal(mealFromTotals('Sandwich', 'Lunch', { ...values, calories: '0' }).calories, 0);
  assert.equal(mealFromTotals('Sandwich', 'Lunch', { ...values, fats: 'invalid' }), null);
});

test('saved recipes log their stored serving without copying the batch or original meal group', () => {
  const saved = { ...recipeFood('Chicken', 'Snack', [chicken()], 3, 450), id: 'recipe-test' };
  const serving = savedRecipeServing(saved, new Date(2026, 0, 2, 12));
  assert.equal(serving.meal, 'Lunch'); assert.equal(serving.calories, saved.calories);
  assert.equal(serving.scannedIngredients[0].servings, '0.5');
  assert.equal(serving.recipe, undefined); assert.equal(serving.id, undefined);
  serving.scannedIngredients[0].servings = '1';
  assert.equal(saved.scannedIngredients[0].servings, '0.5');
});

test('scanned grams scale the original nutrition basis and survive reopening', () => {
  const item = fillScannedIngredient({ name: 'Yogurt', basis: '1 serving (170 g)', source: 'barcode', calories: 100, protein: 17, carbs: 6, fats: 0 });
  assert.equal(portionGrams(item), 170);
  item.servings = String(85 / portionGrams(item));
  const food = draftFood('Yogurt', 'Breakfast', [item]);
  assert.equal(food.calories, 50);
  assert.equal(food.protein, 8.5);
  assert.equal(portionGrams(entryIngredients(food)[0]), 170);
  const ambiguous = { ...item, basis: '100 g / 100 ml — check the package' };
  assert.equal(portionGrams(ambiguous), null);
  ambiguous.gramsPerServing = 100;
  assert.equal(portionGrams(ambiguous), 100);
  assert.equal(portionGrams({ ...item, basis: '100 ml' }), null);
  assert.equal(portionGrams(chicken()), 100);
});

test('scanning fills the selected ingredient without changing other draft ingredients', () => {
  const target = chicken();
  const result = fillScannedIngredient({ name: 'Greek yogurt', basis: '1 pot (170 g)', source: 'barcode', barcode: '12345678', calories: 100, protein: 17, carbs: null, fats: 0 }, target);
  assert.equal(result.id, target.id);
  assert.equal(result.name, 'Greek yogurt');
  assert.equal(result.servings, '1');
  assert.equal(result.basis, '1 pot (170 g)');
  assert.equal(result.carbs, '', 'missing nutrition stays visible for review');
  assert.equal(result.fats, '0');
  assert.equal(target.name, 'Chicken');
  assert.equal(target.servings, '1.5');
});

test('mixed database, barcode and manual ingredients form one journal entry', () => {
  const items = [chicken(), { ...chicken(), id: 'milk', name: 'Milk', source: 'barcode', servings: '2', calories: '50', protein: '3.4', carbs: '5', fats: '1.8' }];
  const food = draftFood('Lunch bowl', 'Lunch', items);
  assert.equal(food.calories, 347.5);
  assert.equal(food.protein, 53.3);
  assert.equal(food.carbs, 10);
  assert.equal(food.fats, 9);
  assert.equal(food.scannedIngredients.length, 2);
  food.scannedIngredients[0].servings = '9';
  assert.equal(items[0].servings, '1.5', 'saved data must not mutate the draft');
});

test('reopening preserves recorded nutrition when a legacy entry has overridden totals', () => {
  const entry = { name: 'Adjusted chicken', calories: 300, protein: 50, carbs: 1, fats: 8, scannedIngredients: [chicken()] };
  const items = entryIngredients(entry);
  const food = draftFood('', 'Dinner', items);
  assert.equal(food.name, 'Adjusted chicken');
  for (const key of ['calories', 'protein', 'carbs', 'fats']) assert.equal(food[key], entry[key]);
  const matching = { ...entry, calories: 247.5, protein: 46.5, carbs: 0, fats: 5.4 };
  const reused = entryIngredients(matching);
  assert.equal(reused[0].basis, '100 g');
  assert.notEqual(reused[0].id, entryIngredients(matching)[0].id, 'reusing a saved meal twice needs independent ingredient IDs');
  reused[0].servings = '2';
  assert.equal(matching.scannedIngredients[0].servings, '1.5');
});

test('unknown macros are explicitly incomplete and invalid portions cannot be saved', () => {
  assert.equal(draftFood('', 'Lunch', []), null);
  for (const servings of ['', '0', '-1', 'abc', '101']) assert.equal(draftFood('', 'Lunch', [{ ...chicken(), servings }]), null);
  const partial = draftFood('', 'Lunch', [{ ...chicken(), fats: '' }]);
  assert.deepEqual(Array.from(partial.incompleteNutrients), ['fats']);
  assert.equal(partial.fats, 0, 'compatibility numeric field is only a known subtotal');
  assert.equal(partial.scannedIngredients[0].fats, '', 'snapshot preserves the unknown value');
  assert.equal(draftFood('', 'Lunch', [chicken()]).name, 'Chicken');
});
