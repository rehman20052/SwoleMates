import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/activity-log.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports });
const { estimateCalories, activityMet, isActivityDetails, activitySummary } = exports;

test('calories follow MET x kg x hours', () => {
  // 165 lb (74.8 kg) moderate run for 30 min: 9.8 x 74.8 x 0.5 = 367
  assert.equal(estimateCalories({ type: 'Running', effort: 'Moderate' }, 30, 165), 367);
  // No effort means moderate.
  assert.equal(estimateCalories({ type: 'Running' }, 30, 165), 367);
  // Pilates is far lighter than running for the same time.
  assert.ok(estimateCalories({ type: 'Pilates' }, 30, 165) < 120);
});

test('speed from distance overrides effort for running, walking and cycling', () => {
  // 3 mi in 30 min = 6 mph -> MET 9.8, regardless of the effort picked.
  assert.equal(activityMet({ type: 'Running', distance: 3, distanceUnit: 'mi', effort: 'Easy' }, 30), 9.8);
  // 5 km in 30 min is about 6.2 mph, a little above 9.8.
  const met = activityMet({ type: 'Running', distance: 5, distanceUnit: 'km' }, 30);
  assert.ok(met > 9.8 && met < 11);
  // Faster walks burn more than slower ones.
  assert.ok(activityMet({ type: 'Walking', distance: 2, distanceUnit: 'mi' }, 30) > activityMet({ type: 'Walking', distance: 1, distanceUnit: 'mi' }, 30));
});

test('no estimate without a usable weight or time', () => {
  assert.equal(estimateCalories({ type: 'Running' }, 30, null), null);
  assert.equal(estimateCalories({ type: 'Running' }, 0, 165), null);
  assert.equal(estimateCalories({ type: 'Running' }, 30, 10), null);
});

test('saved activities validate calories and show them in the summary', () => {
  assert.ok(isActivityDetails({ type: 'Swimming', distance: 800, distanceUnit: 'm', calories: 250, caloriesSource: 'estimate' }));
  assert.ok(!isActivityDetails({ type: 'Swimming', calories: -5 }));
  assert.equal(activitySummary({ type: 'Running', distance: 3.1, distanceUnit: 'mi', effort: 'Moderate', calories: 370 }, 30), '30 min · 3.1 mi · Moderate · 370 kcal');
});

test('weekly recap adds up sessions, time, calories and distance per activity', () => {
  const { activityRecap } = exports;
  const recap = activityRecap([
    { durationMinutes: 30, activity: { type: 'Running', distance: 3, distanceUnit: 'mi', calories: 360 } },
    { durationMinutes: 25, activity: { type: 'Running', distance: 5, distanceUnit: 'km', calories: 300 } },
    { durationMinutes: 40, activity: { type: 'Pilates', calories: 120 } },
    { durationMinutes: 20, activity: { type: 'Swimming', distance: 500, distanceUnit: 'yd' } },
    { durationMinutes: 60, exercises: [] },
  ]);
  assert.equal(recap.sessions, 4);
  assert.equal(recap.minutes, 115);
  assert.equal(recap.calories, 780);
  const running = recap.byType.find((row) => row.type === 'Running');
  assert.equal(running.sessions, 2); assert.equal(running.unit, 'mi'); assert.equal(running.distance, 6.1);
  const swim = recap.byType.find((row) => row.type === 'Swimming');
  assert.equal(swim.unit, 'm'); assert.equal(swim.distance, 457.2);
  assert.equal(recap.byType[0].type, 'Running');
});
