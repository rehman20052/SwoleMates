import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const cache = new Map();
function load(file) {
  const path = resolve(file);
  if (path.endsWith('.json')) return JSON.parse(readFileSync(path, 'utf8'));
  if (cache.has(path)) return cache.get(path);
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
    { exports, require: name => load(resolve(dirname(path), name.endsWith('.json') ? name : `${name}.ts`)) });
  cache.set(path, exports); return exports;
}
const { foodArtworkKind } = load('src/lib/food-artwork.ts');
const { catalogLiftArtwork, liftArtworkKind } = load('src/lib/lift-artwork.ts');
const { saveLiftDetails, isLift } = load('src/lib/lift-progression.ts');
const { validItemArtwork } = load('src/lib/item-artwork.ts');
const { isFoodEntry } = load('src/lib/food-journal.ts');
test('new meal names choose dishes before ingredients and keep unknown meals neutral', () => {
  for (const [name, category] of [['Chicken salad', 'salad'], ['Turkey sandwich', 'sandwich'], ['Salmon with rice', 'fish'], ['Coffee w/ Fairlife', 'coffee'], ['Protein chips', 'chips'], ['Protein shake', 'smoothie'], ['Overnight oats', 'oats'], ['Scrambled eggs', 'eggs'], ['Cheeseburger', 'burger'], ['Banana', 'fruit'], ['Spicy chicken pasta', 'pasta'], ['Unspecified family recipe', 'other']]) assert.equal(foodArtworkKind(name), category, name);
});
test('exercise aliases resolve exact credited images; unknown exercises are never fuzzy-matched', () => {
  assert.equal(catalogLiftArtwork('benchpress')?.id, catalogLiftArtwork('Bench press')?.id);
  assert.ok(catalogLiftArtwork('Incline bench press')?.image.startsWith('https://wger.de/'));
  assert.ok(catalogLiftArtwork('Dumbbell bench press')?.licenseUrl);
  assert.equal(catalogLiftArtwork('my niche bench movement'), undefined);
  for (const [name, kind] of [['Dumbbell row', 'dumbbell'], ['Leg extension', 'legs'], ['Kettlebell swing', 'kettlebell'], ['Pull-up', 'bodyweight'], ['Lat pulldown', 'cable'], ['Unknown movement', 'other']]) assert.equal(liftArtworkKind(name), kind);
});
test('artwork survives JSON reload and lift updates; returning to automatic removes the override', () => {
  const artwork = { kind: 'photo', path: '11111111-1111-4111-8111-111111111111/item-artwork/123-photo.jpg' };
  const details = { name: 'Custom lift', unit: 'lb', currentWeight: 50, goalWeight: 100, minReps: 6, maxReps: 10, artwork };
  let lifts = JSON.parse(JSON.stringify(saveLiftDetails([], 'lift', details, '2026-10-04')));
  assert.equal(isLift(lifts[0]), true); assert.deepEqual(lifts[0].artwork, artwork);
  lifts = JSON.parse(JSON.stringify(saveLiftDetails(lifts, 'lift', { ...details, currentWeight: 60, artwork: undefined }, '2026-10-05')));
  assert.equal(lifts[0].artwork, undefined); assert.equal(lifts[0].history.length, 2);
  assert.equal(isFoodEntry({ id: 'food', date: '2026-10-04', meal: 'Lunch', name: 'Family meal', calories: 500, protein: 20, carbs: 50, fats: 10, artwork }), true);
  assert.equal(validItemArtwork({ kind: 'photo', path: 'https://unknown.example/photo.jpg' }), false);
  assert.equal(validItemArtwork({ kind: 'local', uri: 'blob:temporary' }), false);
});
