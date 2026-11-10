import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const { dietWeek, dietPeriod, energyWeightLabel } = loadTs('src/lib/diet-recap.ts');
const row = (date, calories, protein = 100) => ({ date, calories, protein, carbs: 150, fats: 50 });

test('month navigation uses calendar boundaries, including leap years and January', () => {
  const feb = dietPeriod('2028-03-31', '2028-03-31', -1, 'month', [row('2028-02-29', 2000), row('2028-03-01', 2400)], 2500);
  assert.equal(feb.start, '2028-02-01'); assert.equal(feb.end, '2028-02-29');
  assert.equal(feb.days.length, 29); assert.equal(feb.totals.calories, 2000); assert.equal(feb.balance, -500);
  const dec = dietPeriod('2027-01-10', '2027-01-10', -1, 'month', [], null);
  assert.equal(dec.start, '2026-12-01'); assert.equal(dec.end, '2026-12-31'); assert.equal(dec.days.length, 31);
  const march = dietPeriod('2026-04-05', '2026-04-05', -1, 'month', [], null);
  assert.equal(march.days.length, 31); assert.equal(march.days.at(-1).date, '2026-03-31');
});

test('week navigation moves exactly one Monday-based week at a time', () => {
  const first = dietPeriod('2026-11-03', '2026-11-03', 0, 'week', [], null);
  const previous = dietPeriod('2026-11-03', '2026-11-03', -1, 'week', [], null);
  const older = dietPeriod('2026-11-03', '2026-11-03', -2, 'week', [], null);
  assert.equal(first.start, '2026-11-02'); assert.equal(previous.start, '2026-10-26'); assert.equal(older.start, '2026-10-19');
  assert.equal(previous.days.length, 7);
});

test('weekly intake totals aggregate meals, include today and exclude future logs', () => {
  const result = dietWeek('2026-11-03', '2026-11-03', 0, [row('2026-11-02', 1000), row('2026-11-02', 800), row('2026-11-03', 400), row('2026-11-04', 3000)], 2300);
  assert.equal(result.start, '2026-11-02'); assert.equal(result.end, '2026-11-08');
  assert.equal(result.loggedDays, 2); assert.equal(result.totals.calories, 2200);
  assert.equal(result.averageCalories, 1100); assert.equal(result.averageProtein, 150);
  assert.equal(result.days[0].totals.calories, 1800);
  assert.equal(result.days[2].future, true);
  assert.equal(result.balanceDays, 1); assert.equal(result.balance, -500);
});

test('unlogged days never become deficits and today alone cannot predict weight change', () => {
  const empty = dietWeek('2026-11-03', '2026-11-03', 0, [], 2300);
  assert.equal(empty.averageCalories, null); assert.equal(empty.balance, null);
  assert.equal(empty.days.filter(day => day.totals === null).length, 7);
  const today = dietWeek('2026-11-03', '2026-11-03', 0, [row('2026-11-03', 300)], 2300);
  assert.equal(today.balance, null); assert.equal(today.equivalentLb, null);
});

test('completed calendar weeks show surplus or deficit equivalents in both units', () => {
  const food = Array.from({ length: 7 }, (_, index) => row(`2026-10-${String(26 + index).padStart(2, '0')}`, 2000));
  food[6].date = '2026-11-01';
  const deficit = dietWeek('2026-11-03', '2026-11-03', -1, food, 2500);
  assert.equal(deficit.loggedDays, 7); assert.equal(deficit.balance, -3500);
  assert.equal(deficit.equivalentLb, -1);
  assert.equal(energyWeightLabel(deficit.equivalentLb, 'lb'), '1.00 lb loss');
  assert.equal(energyWeightLabel(deficit.equivalentLb, 'kg'), '0.45 kg loss');
  const surplus = dietWeek('2026-11-03', '2026-11-03', -1, food, 1500);
  assert.equal(surplus.balance, 3500); assert.equal(energyWeightLabel(surplus.equivalentLb, 'lb'), '1.00 lb gain');
});

test('unknown maintenance, invalid rows and year boundaries are handled without invented estimates', () => {
  for (const baseline of [null, 0, NaN, Infinity]) {
    const result = dietWeek('2027-01-05', '2027-01-05', -1, [row('2026-12-31', 2000), row('2027-01-01', NaN)], baseline);
    assert.equal(result.start, '2026-12-28'); assert.equal(result.end, '2027-01-03');
    assert.equal(result.loggedDays, 1); assert.equal(result.balance, null);
  }
});

test('coverage distinguishes missing past days from today and upcoming dates', () => {
  const partial = dietWeek('2026-11-03', '2026-11-03', 0, [row('2026-11-03', 718)], 2500);
  assert.equal(partial.elapsedDays, 2);
  assert.equal(partial.pastDays, 1);
  assert.equal(partial.missingDays, 1);
  assert.equal(partial.coverage, 'missing');
  assert.equal(partial.canEstimate, false);
  assert.equal(partial.averageCalories, 718); // Missing days are unknown, never zero.
  const monday = dietWeek('2026-11-02', '2026-11-02', 0, [], 2500);
  assert.equal(monday.coverage, 'in-progress');
  assert.equal(monday.missingDays, 0);
  assert.equal(monday.canEstimate, false);
});

test('estimates require a finished period with every day marked complete', () => {
  const food = ['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01'].map(date => row(date, 2000));
  const complete = dietWeek('2026-11-03', '2026-11-03', -1, food, 2500);
  assert.equal(complete.coverage, 'recorded');
  assert.equal(complete.canEstimate, true);
  assert.equal(complete.missingDays, 0);
  assert.equal(dietWeek('2026-11-01', '2026-11-01', 0, food, 2500).canEstimate, false);
  const partial = dietWeek('2026-11-03', '2026-11-03', -1, food.slice(1), 2500);
  assert.equal(partial.coverage, 'partial');
  assert.equal(partial.canEstimate, false);
  assert.equal(partial.averageCalories, 2000);
  assert.equal(dietWeek('2026-11-03', '2026-11-03', -1, food, null).canEstimate, false);
});
