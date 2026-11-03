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
const { entryIngredients, draftFood, fillScannedIngredient } = load('src/lib/food-log-draft.ts', { './food-scanner': scanner });
const chicken = () => ({ id: 'chicken', name: 'Chicken', basis: '100 g', source: 'manual', servings: '1.5', calories: '165', protein: '31', carbs: '0', fats: '3.6' });

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

test('missing scanned nutrients and invalid portions cannot be saved as zero', () => {
  assert.equal(draftFood('', 'Lunch', []), null);
  for (const servings of ['', '0', '-1', 'abc', '101']) assert.equal(draftFood('', 'Lunch', [{ ...chicken(), servings }]), null);
  assert.equal(draftFood('', 'Lunch', [{ ...chicken(), fats: '' }]), null);
  assert.equal(draftFood('', 'Lunch', [chicken()]).name, 'Chicken');
});
