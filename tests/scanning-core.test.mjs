import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

const { createDuplicateGuard, expandUpce, gtinCheckDigit, hasValidGtinCheckDigit, normalizeBarcode } = loadTs('src/scanning/barcodes.ts');
const { createMemoryProductCache, lookupProduct, mapOpenFoodFacts, productQuality } = loadTs('src/scanning/products.ts');
const { servingMultiplier, scaleMacros } = loadTs('src/scanning/servings.ts');
const { parseNutritionFrame } = loadTs('src/scanning/nutrition/parser.ts');
const { NutritionFrameAggregator, hasReliableNutrition } = loadTs('src/scanning/nutrition/aggregate.ts');

test('normalizes valid UPC/EAN/GTIN values and rejects bad check digits', () => {
  assert.equal(gtinCheckDigit('03600029145'), 2);
  assert.equal(normalizeBarcode('0 36000-29145 2').gtin14, '00036000291452');
  assert.equal(normalizeBarcode('4006381333931').format, 'ean_13');
  assert.equal(normalizeBarcode('96385074').format, 'ean_8');
  assert.ok(hasValidGtinCheckDigit('4006381333931'));
  assert.throws(() => normalizeBarcode('4006381333932'), /check digit/);
  assert.throws(() => normalizeBarcode('1234abcd'), /digits/);
});

test('expands and validates UPC-E when the scanner identifies that format', () => {
  assert.equal(expandUpce('04210007'), '042000001007');
  const result = normalizeBarcode('04210007', 'upc_e');
  assert.equal(result.value, '042000001007');
  assert.equal(result.gtin14, '00042000001007');
  assert.throws(() => normalizeBarcode('04210005', 'upc_e'), /check digit/);
});

test('debounces repeated detections only inside the configured window', () => {
  const duplicate = createDuplicateGuard(1000);
  assert.equal(duplicate('0001', 100), false);
  assert.equal(duplicate('0001', 900), true);
  assert.equal(duplicate('0002', 950), false);
  assert.equal(duplicate('0001', 2001), false);
});

test('maps incomplete Open Food Facts data without inventing nutrients', () => {
  const product = mapOpenFoodFacts('036000291452', { status: 1, product: { product_name: 'Snack', serving_size: '40 g', serving_quantity: 40, serving_quantity_unit: 'g', nutriments: { 'energy-kcal_serving': 120, proteins_100g: 15, carbohydrates_100g: 30 } } });
  assert.equal(product.calories, 120); assert.equal(product.protein, 6); assert.equal(product.carbs, 12); assert.equal(product.fat, null);
  const quality = productQuality(product);
  assert.equal(quality.complete, false); assert.equal(quality.requiresReview, true);
  assert.equal(mapOpenFoodFacts('036000291452', { status: 0 }), null);
});

test('product lookup uses the cache before Open Food Facts', async () => {
  const cache = createMemoryProductCache();
  let requests = 0;
  const fetcher = async () => { requests++; return { ok: true, status: 200, json: async () => ({ status: 1, product: { product_name: 'Milk', nutriments: { 'energy-kcal_100g': 60, proteins_100g: 3, carbohydrates_100g: 5, fat_100g: 3 } } }) }; };
  const first = await lookupProduct('036000291452', { cache, fetcher });
  const second = await lookupProduct('036000291452', { cache, fetcher });
  assert.equal(first.status, 'found'); assert.equal(second.status, 'found');
  assert.equal(second.product.source, 'cache'); assert.equal(requests, 1);
});

function token(id, text, x, y, width = .12, confidence = .95) {
  return { id, text, confidence, bounds: { x, y, width, height: .035 } };
}
function frame(observations, id = 'frame-1') { return { id, capturedAt: 1, width: 1000, height: 1400, observations }; }

test('spatial parser selects gram quantities instead of adjacent daily-value percentages', () => {
  const parsed = parseNutritionFrame(frame([
    token('s1', 'Serving Size', .08, .12, .18), token('s2', '2 pieces (40 g)', .30, .12, .2),
    token('c1', 'Calories', .08, .22), token('c2', '120', .55, .22),
    token('f1', 'Total Fat', .08, .32), token('f2', '8g', .55, .32), token('f3', '10%', .80, .32),
    token('a1', 'Total Carbohydrate', .08, .42, .24), token('a2', '12g', .55, .42), token('a3', '4%', .80, .42),
    token('p1', 'Protein', .08, .52), token('p2', '6g', .55, .52),
  ]));
  assert.equal(parsed.servingSize.value, '2 pieces (40 g)');
  assert.equal(parsed.calories.value, 120); assert.equal(parsed.fat.value, 8);
  assert.equal(parsed.carbs.value, 12); assert.equal(parsed.protein.value, 6);
});

test('spatial parser chooses the per-serving column when several numeric columns exist', () => {
  const parsed = parseNutritionFrame(frame([
    token('h1', 'Per 100g', .42, .16), token('h2', 'Per serving', .68, .16),
    token('c1', 'Calories', .08, .25), token('c2', '250', .44, .25), token('c3', '100', .69, .25),
    token('f1', 'Total Fat', .08, .34), token('f2', '10g', .44, .34), token('f3', '4g', .69, .34), token('f4', '5%', .86, .34),
    token('a1', 'Total Carbohydrate', .08, .43, .24), token('a2', '20g', .44, .43), token('a3', '8g', .69, .43),
    token('p1', 'Protein', .08, .52), token('p2', '6g', .44, .52), token('p3', '2.4g', .69, .52),
  ]));
  assert.equal(parsed.basis, 'per_serving');
  assert.equal(parsed.calories.value, 100); assert.equal(parsed.fat.value, 4);
  assert.equal(parsed.carbs.value, 8); assert.equal(parsed.protein.value, 2.4);
});

test('parser safely repairs numeric O/0 and l/1 confusion but leaves missing fields unknown', () => {
  const parsed = parseNutritionFrame(frame([
    token('c1', 'Calories', .1, .2), token('c2', 'I2O', .6, .2),
    token('p1', 'Protein', .1, .3), token('p2', '6g', .6, .3),
    token('f1', 'Total Fat', .1, .4), token('f2', '10%', .8, .4),
  ]));
  assert.equal(parsed.calories.value, 120); assert.equal(parsed.protein.value, 6);
  assert.equal(parsed.fat.value, null); assert.equal(parsed.carbs.value, null);
});

test('repeated frames stabilize values and resist one later bad observation', () => {
  const make = calories => ({ basis: 'per_serving', servingSize: { value: '40 g', confidence: .9, observationIds: ['s'], warnings: [] }, servingsPerContainer: { value: null, confidence: 0, observationIds: [], warnings: [] }, calories: { value: calories, confidence: .9, observationIds: ['c'], warnings: [] }, protein: { value: 6, confidence: .9, observationIds: ['p'], warnings: [] }, carbs: { value: 12, confidence: .9, observationIds: ['a'], warnings: [] }, fat: { value: 4, confidence: .9, observationIds: ['f'], warnings: [] }, confidence: .9, warnings: [] });
  const aggregator = new NutritionFrameAggregator();
  assert.equal(aggregator.add(make(120)).calories.value, null);
  const stable = aggregator.add(make(120));
  assert.equal(stable.calories.value, 120); assert.ok(hasReliableNutrition(stable));
  assert.equal(aggregator.add(make(720)).calories.value, 120);
});

test('custom serving quantities scale macros across compatible units', () => {
  assert.equal(servingMultiplier({ amount: 40, unit: 'g' }, { amount: 60, unit: 'g' }), 1.5);
  assert.ok(Math.abs(servingMultiplier({ amount: 28.349523125, unit: 'g' }, { amount: 2, unit: 'oz' }) - 2) < 1e-9);
  assert.equal(servingMultiplier({ amount: 1, unit: 'piece' }, { amount: 50, unit: 'g' }), null);
  assert.deepEqual({ ...scaleMacros({ calories: 100, protein: 5, carbs: 10, fat: 4 }, 1.5) }, { calories: 150, protein: 7.5, carbs: 15, fat: 6 });
});
