import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

const { nutritionSnapshot } = loadTs('src/lib/diet-recap.ts');
const meal = (date, overrides = {}) => ({
  id: date, name: 'Sandwich', date, meal: 'Lunch', calories: 450,
  protein: 25, carbs: 40, fats: 15, ...overrides,
});

test('one meal is enough for a protein pick without a repeat', () => {
  const result = nutritionSnapshot('2026-11-10', [meal('2026-11-07')]);
  assert.equal(result.meals, 1);
  assert.equal(result.latestDate, '2026-11-07');
  assert.equal(result.proteinPicks.length, 1);
  assert.equal(result.proteinPicks[0].protein, 25);
  assert.equal(result.repeatMeal, null);
});

test('seven local calendar dates include today and exclude older and future meals', () => {
  const result = nutritionSnapshot('2026-11-04', [
    meal('2026-11-03'), meal('2026-10-29'), meal('2026-10-28'),
    meal('2026-11-05'), meal('2026-10-29', { id: 'second' }),
  ]);
  assert.equal(result.start, '2026-10-29');
  assert.equal(result.end, '2026-11-04');
  assert.equal(result.meals, 3);
  assert.equal(result.latestDate, '2026-11-03');
  assert.equal(result.repeatMeal.count, 3);
  assert.equal(result.repeatMeal.days.length, 7);
  assert.equal(result.repeatMeal.days[0].date, '2026-10-29');
  assert.equal(result.repeatMeal.days[0].count, 2);
  assert.equal(result.repeatMeal.days[5].count, 1);
  assert.equal(result.repeatMeal.maxDailyCount, 2);
  assert.equal(result.repeatMeal.days.reduce((sum, day) => sum + day.count, 0), 3);
});

test('calendar arithmetic handles year boundaries, leap day and DST transitions', () => {
  for (const [today, first, excluded] of [
    ['2027-01-03', '2026-12-28', '2026-12-27'],
    ['2028-03-06', '2028-02-29', '2028-02-28'],
    ['2026-03-09', '2026-03-03', '2026-03-02'],
    ['2026-11-02', '2026-10-27', '2026-10-26'],
  ]) {
    const result = nutritionSnapshot(today, [meal(first), meal(excluded)]);
    assert.equal(result.start, first);
    assert.equal(result.latestDate, first);
    assert.equal(result.meals, 1);
  }
  const dates = ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'];
  assert.equal(nutritionSnapshot('2027-01-03', dates.map(date => meal(date))).meals, 7);
});

test('empty windows contain no highlights or navigation date', () => {
  const result = nutritionSnapshot('2026-11-10', [meal('2026-11-03'), meal('2026-11-11')]);
  assert.equal(result.meals, 0);
  assert.equal(result.latestDate, null);
  assert.equal(result.proteinPicks.length, 0);
  assert.equal(result.recentMeals.length, 0);
  assert.equal(result.repeatMeal, null);
});

test('normalized names group portions, retain the latest artwork and use the largest known protein portion', () => {
  const older = meal('2026-11-08', { name: '  Turkey   SANDWICH ', protein: 40 });
  const latest = meal('2026-11-10', { name: 'Turkey sandwich', protein: 20, artwork: { kind: 'preset', key: 'sandwich' } });
  const result = nutritionSnapshot('2026-11-10', [latest, older]);
  assert.equal(result.proteinPicks.length, 1);
  assert.equal(result.proteinPicks[0].entry, latest);
  assert.equal(result.proteinPicks[0].protein, 40);
  assert.equal(result.repeatMeal.entry, latest);
  assert.equal(result.repeatMeal.count, 2);
});

test('unknown protein, explicit zero and invalid protein do not become protein picks', () => {
  const result = nutritionSnapshot('2026-11-10', [
    meal('2026-11-10', { id: 'a', name: 'Unknown', protein: 90, incompleteNutrients: ['protein'] }),
    meal('2026-11-09', { id: 'b', name: 'Zero', protein: 0 }),
    meal('2026-11-08', { id: 'c', name: 'Invalid', protein: NaN }),
    meal('2026-11-07', { id: 'd', name: 'Negative', protein: -1 }),
  ]);
  assert.equal(result.proteinPicks.length, 0);
  assert.equal(result.repeatMeal, null);
  assert.equal(result.recentMeals.length, 3);
  assert.equal(result.recentMeals[0].name, 'Unknown');
});

test('top three protein picks use portion dates and IDs to resolve ties regardless of input order', () => {
  const rows = [
    meal('2026-11-10', { id: 'a', name: 'A', protein: 30 }),
    meal('2026-11-09', { id: 'z', name: 'B', protein: 30 }),
    meal('2026-11-10', { id: 'z', name: 'C', protein: 30 }),
    meal('2026-11-08', { id: 'd', name: 'D', protein: 40 }),
    meal('2026-11-10', { id: 'e', name: 'B', protein: 0 }),
  ];
  for (const entries of [rows, [...rows].reverse()]) {
    const result = nutritionSnapshot('2026-11-10', entries);
    assert.equal(result.proteinPicks.map(pick => pick.entry.name).join(','), 'D,C,A');
  }
});

test('repeat highlight resolves equal counts by newest date then normalized name', () => {
  const rows = [
    meal('2026-11-09', { name: 'Zucchini' }), meal('2026-11-08', { name: 'Zucchini' }),
    meal('2026-11-10', { name: 'Beans' }), meal('2026-11-08', { name: 'Beans' }),
    meal('2026-11-10', { name: 'Apples' }), meal('2026-11-09', { name: 'Apples' }),
  ];
  for (const entries of [rows, [...rows].reverse()]) {
    assert.equal(nutritionSnapshot('2026-11-10', entries).repeatMeal.entry.name, 'Apples');
  }
});

test('repeats with no known protein still provide a highlight', () => {
  const result = nutritionSnapshot('2026-11-10', [
    meal('2026-11-10', { protein: 0, incompleteNutrients: ['protein'] }),
    meal('2026-11-09', { protein: 0 }),
  ]);
  assert.equal(result.proteinPicks.length, 0);
  assert.equal(result.repeatMeal.count, 2);
});

test('overview averages only logged days and retains totals for calories and every macro', () => {
  const result = nutritionSnapshot('2026-11-10', [
    meal('2026-11-09'), meal('2026-11-09', { id: 'second' }), meal('2026-11-10'),
    meal('2026-11-03'), meal('2026-11-11'),
  ]);
  assert.equal(result.loggedDays, 2);
  assert.deepEqual({ ...result.totals }, { calories: 1350, protein: 75, carbs: 120, fats: 45 });
  assert.deepEqual({ ...result.averages }, { calories: 675, protein: 37.5, carbs: 60, fats: 22.5 });
  assert.equal(result.days.length, 7);
  assert.equal(result.days[0].meals, 0);
  assert.equal(result.days[0].calories, 0);
  assert.equal(result.days[5].calories, 900);
  assert.equal(result.days[6].calories, 450);
});

test('overview distinguishes unknown macros from complete explicit zero and keeps known subtotals', () => {
  const unknown = nutritionSnapshot('2026-11-10', [meal('2026-11-10', { protein: 10, carbs: 0, fats: 0, incompleteNutrients: ['protein', 'carbs'] })]);
  assert.deepEqual({ ...unknown.missing }, { protein: true, carbs: true, fats: false });
  assert.deepEqual({ ...unknown.averages }, { calories: 450, protein: 10, carbs: 0, fats: 0 });
  const empty = nutritionSnapshot('2026-11-10', []);
  assert.equal(empty.loggedDays, 0);
  assert.deepEqual({ ...empty.averages }, { calories: 0, protein: 0, carbs: 0, fats: 0 });
});
