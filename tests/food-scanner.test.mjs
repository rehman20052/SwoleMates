import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/food-scanner.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports });
const { barcodeProduct, parseNutritionLabel, scannedIngredient, ingredientTotals, validScanIngredients } = exports;
test('barcode nutrition uses one basis and preserves missing values and real zeroes', () => {
  const food = barcodeProduct({ status: 1, product: { product_name: 'Protein snack', serving_size: '40 g', nutriments: { 'energy-kcal_serving': 120, proteins_serving: 6, carbohydrates_serving: 0, fat_100g: 10 } } });
  assert.equal(food.calories, 120); assert.equal(food.protein, 6); assert.equal(food.carbs, 0); assert.equal(food.fats, null);
  assert.match(food.basis, /40 g/);
  const hundred = barcodeProduct({ status: 1, product: { nutriments: { 'energy-kj_100g': 418.4, proteins_100g: 3.5, carbohydrates_100g: 10, fat_100g: 2 } } });
  assert.equal(hundred.calories, 100); assert.equal(hundred.protein, 3.5); assert.match(hundred.basis, /100/);
  assert.throws(() => barcodeProduct({ status: 0 }), /not found/);
});
test('nutrition label reading distinguishes total nutrients from saturated fat and daily value percentages', () => {
  const food = parseNutritionLabel('Nutrition Facts\nServing Size 2 pieces (40 g)\nCalories 120\nTotal Fat 4.5g 6%\nSaturated Fat 2g\nTotal Carbohydrate 12g 4%\nDietary Fiber 2g\nProtein 6g\n');
  assert.equal(food.calories, 120); assert.equal(food.protein, 6); assert.equal(food.carbs, 12); assert.equal(food.fats, 4.5);
  assert.match(food.basis, /40 g/);
  const missing = parseNutritionLabel('Total Fat 10%\nProtein 3,5 g\nEnergy 400 kJ / 96 kcal\nper 100 g');
  assert.equal(missing.fats, null); assert.equal(missing.protein, 3.5); assert.equal(missing.calories, 96); assert.equal(missing.carbs, null);
});
test('label parsing handles cramped print, OCR number substitutions and separated lines without using percentages', () => {
  const food = parseNutritionLabel('Serving Size 40g\nCalories\n\n120\nTotalFat4.5g 6%\nTotalCarbohydrate I2g 4%\nProtein 6 g\nSaturated Fat 2g');
  assert.equal(food.calories, 120); assert.equal(food.fats, 4.5); assert.equal(food.carbs, 12); assert.equal(food.protein, 6);
  assert.equal(parseNutritionLabel('Total Fat 10%\nProtein <1g').fats, null);
  assert.equal(parseNutritionLabel('Total Fat 10%\nProtein <1g').protein, null);
  const european = parseNutritionLabel('Serving Size 40 g\nPer 100g  Per serving\nEnergy 1000 kJ / 239 kcal\nFat 10g 4g\nCarbohydrate 20g 8g\nProtein 6g 2.4g');
  assert.equal(european.calories, 239); assert.equal(european.protein, 6); assert.match(european.basis, /100/);
});
test('a known serving quantity converts only compatible per-100g nutrients into the same serving basis', () => {
  const product = { status: 1, product: { serving_size: '40 g', serving_quantity: 40, serving_quantity_unit: 'g', nutriments: { 'energy-kcal_serving': 120, proteins_100g: 15, carbohydrates_100g: 30, fat_100g: 10 } } };
  const food = barcodeProduct(product);
  assert.equal(food.calories, 120); assert.equal(food.protein, 6); assert.equal(food.carbs, 12); assert.equal(food.fats, 4);
  product.product.serving_quantity_unit = 'oz';
  assert.equal(barcodeProduct(product).protein, null, 'an incompatible unit cannot be silently converted');
});
test('ingredient totals scale each serving, support decimals, edits and removal, and survive JSON reload', () => {
  const first = scannedIngredient({ name: 'Milk', calories: 120, protein: 6, carbs: 12, fats: 4.5, basis: '40g', source: 'barcode' });
  const second = scannedIngredient({ name: 'Whey', calories: 100, protein: 20, carbs: 2, fats: 1, basis: '30g', source: 'label' });
  first.servings = '1,5'; second.servings = '2';
  const items = JSON.parse(JSON.stringify([first, second]));
  assert.ok(validScanIngredients(items));
  const total = ingredientTotals(items);
  assert.equal(total.calories, 380); assert.equal(total.protein, 49); assert.equal(total.carbs, 22); assert.equal(total.fats, 8.8); assert.equal(total.complete, true);
  items[1].protein = '21'; assert.equal(ingredientTotals(items).protein, 51);
  assert.equal(ingredientTotals(items.slice(0, 1)).protein, 9);
});
test('missing nutrition or invalid serving amounts do not become zero or a complete total', () => {
  const item = scannedIngredient({ name: 'Food', calories: 0, protein: 0, carbs: 0, fats: null, basis: '1 serving', source: 'label' });
  assert.equal(ingredientTotals([item]).fats, null); assert.equal(ingredientTotals([item]).calories, 0); assert.equal(ingredientTotals([item]).complete, false);
  item.fats = '0'; assert.equal(ingredientTotals([item]).complete, true);
  for (const amount of ['', '0', '-2', 'Infinity', '101']) { item.servings = amount; assert.equal(ingredientTotals([item]).complete, false); assert.equal(ingredientTotals([item]).calories, null); }
  assert.equal(ingredientTotals([]).complete, false);
  assert.equal(validScanIngredients([{ ...item, source: 'unknown' }]), false);
});
