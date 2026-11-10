import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

const { nutritionSummary } = loadTs('src/lib/nutrition-tracking.ts');
const { draftFood, entryIngredients, recipeFood, reusableFoodIngredient, withPortion, portionGrams } = loadTs('src/lib/food-log-draft.ts');
const { isFoodEntry, createFoodJournal } = loadTs('src/lib/food-journal.ts');
const { recognizedTextFrame } = loadTs('src/scanning/nutrition/text-frame.ts');
const { parseNutritionFrame } = loadTs('src/scanning/nutrition/parser.ts');
const { foodChoices } = loadTs('src/lib/food-search.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const ingredient = (patch = {}) => ({ id: 'ingredient', name: 'Rice, cooked', basis: '100 g', servings: '1', source: 'manual', calories: '130', protein: '2.7', carbs: '28', fats: '0.3', provider: 'USDA', externalId: 'usda-rice', ...patch });
const entry = (patch = {}) => ({ id: 'food', date: '2026-11-03', ...draftFood('Rice', 'Lunch', [ingredient()]), ...patch });
const goals = { calorieGoal: 2200, proteinGoal: 150, carbGoal: 250, fatGoal: 65 };

test('calories-only entries retain unknowns through persistence, editing and summaries', async () => {
  const food = entry({ ...draftFood('Snack', 'Snack', [ingredient({ protein: '', carbs: '', fats: '' })]) });
  const storage = new Map();
  const local = { getItem: async key => storage.get(key) ?? null, setItem: async (key, value) => { storage.set(key, value); } };
  const journal = createFoodJournal(local); await journal.load([]); await journal.change(() => [food]);
  const [reopened] = await createFoodJournal(local).load([]);
  assert.equal(isFoodEntry(reopened), true);
  assert.deepEqual(plain(reopened.incompleteNutrients), ['protein', 'carbs', 'fats']);
  assert.equal(entryIngredients(reopened)[0].protein, '');
  assert.equal(nutritionSummary([reopened]).calories, 130);
  assert.equal(nutritionSummary([reopened]).incomplete.length, 3);
  const explicitZero = entry({ ...draftFood('Zero', 'Snack', [ingredient({ protein: '0', carbs: '0', fats: '0' })]) });
  assert.equal(nutritionSummary([explicitZero]).incomplete.length, 0);
});

test('partial meals preserve known nutrient subtotals and exclude them from complete-day macro averages', () => {
  const partial = entry({ ...draftFood('Mixed', 'Lunch', [ingredient(), ingredient({ id: 'unknown', protein: '', carbs: '10', fats: '' })]) });
  assert.equal(partial.protein, 2.7);
  assert.equal(partial.carbs, 38);
  const result = nutritionSummary([partial]);
  assert.equal(result.calories, 260);
  assert.deepEqual(plain(result.incomplete), ['protein', 'fats']);
});

test('grams and ounces scale the immutable nutrition basis; ambiguous volume has no weight conversion', () => {
  const item = ingredient();
  const ounce = withPortion(item, '2', 'oz');
  assert.equal(ounce.portion.unit, 'oz');
  assert.ok(Math.abs(Number(ounce.servings) - .5669904625) < .000001);
  assert.equal(draftFood('', 'Lunch', [ounce]).calories, 73.7);
  assert.equal(withPortion(item, '50', 'g').servings, '0.5');
  assert.equal(withPortion(item, '1,5', 'serving').servings, '1.5');
  assert.equal(portionGrams(ingredient({ basis: '100 ml' })), null);
  assert.equal(withPortion(ingredient({ basis: '1 cup' }), '100', 'g').servings, '');
  assert.equal(item.servings, '1');
  const decimal = withPortion(item, '1.', 'oz');
  assert.equal(decimal.portion.text, '1.', 'typing a decimal separator must not erase it');
  const partial = withPortion(item, '.', 'g');
  assert.equal(partial.portion.text, '.');
  assert.equal(draftFood('', 'Lunch', [partial]), null);
});

test('batch recipes calculate per-serving snapshots and finished-weight portions', () => {
  const items = [ingredient({ servings: '4' })];
  const saved = { id: 'recipe', ...recipeFood('Meal prep', 'Lunch', items, 4, 600) };
  assert.equal(saved.calories, 130);
  assert.equal(saved.recipe.ingredients[0].servings, '4');
  const portion = reusableFoodIngredient(saved);
  assert.equal(portionGrams(portion), 150);
  const logged = draftFood('', 'Lunch', [withPortion(portion, '225', 'g')]);
  assert.equal(logged.calories, 195);
  saved.calories = 999; saved.recipe.ingredients[0].calories = '999';
  assert.equal(logged.calories, 195, 'editing recipe does not change a journal snapshot');
  assert.equal(recipeFood('Bad', 'Lunch', items, 0), null);
  assert.equal(recipeFood('Bad', 'Lunch', items, 4, 0), null);
});

test('search prioritizes exact and personal matches without hiding preparation state', () => {
  const personal = entry({ name: 'Rice, cooked' });
  const catalog = [{ id: 'raw', name: 'Rice, raw', per100g: goals }, { id: 'cooked', name: 'Rice, cooked', per100g: goals }];
  assert.equal(foodChoices([personal], [], 'rice', catalog)[0].source, 'recent');
  assert.equal(foodChoices([personal], [], 'rice, cooked', catalog)[0].source, 'recent');
  assert.equal(foodChoices([], [], 'raw rice', catalog)[0].food.id, 'raw');
});

test('native OCR token adapter retains geometry for column-aware nutrition parsing', () => {
  const words = [
    ['Calories', '200'], ['Total', 'Fat', '5g'], ['Total', 'Carbohydrate', '30g'], ['Protein', '10g'],
  ];
  const result = { blocks: [{ lines: words.map((row, y) => ({ elements: row.map((text, x) => ({ text, frame: { left: x * 120, right: x * 120 + 100, top: y * 40, bottom: y * 40 + 20 } })) })) }] };
  const frame = recognizedTextFrame(result, 600, 400);
  assert.equal(frame.observations[0].bounds.width, 100 / 600);
  const parsed = parseNutritionFrame(frame);
  assert.equal(parsed.calories.value, 200); assert.equal(parsed.protein.value, 10);
  assert.equal(parsed.carbs.value, 30); assert.equal(parsed.fat.value, 5);
});

test('native OCR recognizes split per-100g column headings instead of assuming per serving', () => {
  const rows = [['Per', '100', 'g'], ['Calories', '200'], ['Protein', '10g']];
  const result = { blocks: [{ lines: rows.map((row, y) => ({ elements: row.map((text, x) => ({ text, frame: { left: x * 100, right: x * 100 + 80, top: y * 40, bottom: y * 40 + 20 } })) })) }] };
  const parsed = parseNutritionFrame(recognizedTextFrame(result, 600, 400));
  assert.equal(parsed.basis, 'per_100g');
  assert.equal(parsed.calories.value, 200);
  assert.equal(parsed.protein.value, 10);
});
