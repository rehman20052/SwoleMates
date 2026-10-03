import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports });
  return exports;
}
const { weekBounds, weeklyRecap, liftMilestones } = load('src/lib/progress-recap.ts');
const { validWorkoutExercises, exerciseSummary } = load('src/lib/workout-session.ts');
const lift = { currentWeight: 130, goalWeight: 150, name: 'Bench', unit: 'lb', history: [
  { date: '2026-09-27', weight: 120 }, { date: '2026-09-28', weight: 135 }, { date: '2026-09-30', weight: 130 }, { date: '2026-10-02', weight: 140 },
] };
test('weekly recap uses Monday weeks, ignores future entries, and averages only logged nutrition days', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(weekBounds('2026-10-04'))), { start: '2026-09-28', end: '2026-10-04' });
  const recap = weeklyRecap('2026-10-03', 0, [{ date: '2026-09-28' }, { date: '2026-09-28' }, { date: '2026-10-02' }, { date: '2026-10-04' }], [
    { date: '2026-09-28', calories: 1000, protein: 60 }, { date: '2026-09-28', calories: 1000, protein: 80 },
    { date: '2026-10-02', calories: 2400, protein: 160 }, { date: '2026-10-04', calories: 9000, protein: 1000 },
  ], [lift]);
  assert.equal(recap.workoutDays, 2); assert.equal(recap.sessions, 3);
  assert.equal(recap.nutritionDays, 2); assert.equal(recap.averageCalories, 2200); assert.equal(recap.averageProtein, 150);
  assert.equal(recap.bests.length, 2);
  const previous = weeklyRecap('2026-10-03', -1, [], [], [lift]);
  assert.equal(previous.start, '2026-09-21'); assert.equal(previous.averageCalories, null); assert.equal(previous.bests.length, 0);
});
test('personal bests distinguish a baseline from improvements and do not celebrate recovering old weight', () => {
  const milestones = liftMilestones(lift);
  assert.equal(milestones.best, 140); assert.equal(milestones.records.length, 2);
  assert.equal(milestones.records[0].increase, 15); assert.equal(milestones.records[1].increase, 5);
  assert.equal(milestones.reached, false);
  assert.equal(liftMilestones({ ...lift, currentWeight: 150 }).reached, true);
  assert.equal(liftMilestones({ ...lift, history: [{ date: '2026-10-03', weight: 140 }] }).records.length, 0);
});
test('workout rows preserve bodyweight and reject invalid sets, reps, weights and duplicate IDs', () => {
  const row = { id: 'row-1', name: 'Push-up', sets: 3, reps: 12, weight: 0, unit: 'lb' };
  assert.equal(validWorkoutExercises([row]), true);
  for (const patch of [{ sets: 0 }, { reps: 101 }, { weight: -1 }, { weight: NaN }, { name: '' }, { unit: 'stone' }]) assert.equal(validWorkoutExercises([{ ...row, ...patch }]), false);
  assert.equal(validWorkoutExercises([row, row]), false);
  assert.match(exerciseSummary([row]), /Push-up: 3 × 12 at 0 lb/);
});
