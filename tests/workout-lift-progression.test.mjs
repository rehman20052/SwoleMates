import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const { progressLiftsFromWorkout, matchTrackedLift, workoutLiftGroups, reconcileWorkoutLifts } = loadTs('src/lib/workout-lift-progression.ts');
const { isLift, liftProgress } = loadTs('src/lib/lift-progression.ts');
const exercise = (name, weight, unit = 'lb') => ({ id: name, name, weight, unit, sets: 2, reps: 8, setDetails: [{ weight: weight - 5, reps: 10 }, { weight, reps: 8 }] });
const log = (...exercises) => ({ date: '2026-10-09', exercises });

test('template groups follow logged exercises, share matching lifts and leave manual workouts ungrouped', () => {
  const lifts = progressLiftsFromWorkout([], log(exercise('Bench press', 100), exercise('Lat Pullover', 60), exercise('Squat', 135)));
  const logs = [
    { ...log(exercise('bench press', 100), exercise('lat pullover', 60)), title: 'Renamed session', workoutOrigin: 'template', sourceTemplateId: 'chest' },
    { ...log(exercise('Lat Pullover', 60)), title: 'Pull', workoutOrigin: 'template', sourceTemplateId: 'pull' },
    { ...log(exercise('Squat', 135)), title: 'Chest', workoutOrigin: 'manual' },
  ];
  const groups = workoutLiftGroups(lifts, logs, [{ id: 'chest', title: 'Chest' }, { id: 'pull', title: 'Pull' }]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].title, 'Chest');
  assert.equal(groups[0].liftIds.length, 2);
  assert.equal(groups[1].liftIds.length, 1);
  assert.ok(groups[0].liftIds.includes(groups[1].liftIds[0]));
  assert.equal(groups.some(group => group.liftIds.includes(lifts[2].id)), false);
  assert.equal(workoutLiftGroups(lifts, [{ ...logs[2], title: 'Random workout' }], []).length, 0);
});

test('logged exercises create valid lifts with no invented goal and retries do not duplicate history', () => {
  const lifts = progressLiftsFromWorkout([], log(exercise('Lat Pullover', 100)));
  assert.equal(lifts.length, 1);
  assert.equal(lifts[0].currentWeight, 100);
  assert.equal(lifts[0].minReps, 8);
  assert.equal(lifts[0].goalWeight, 0);
  assert.equal(isLift(lifts[0]), true);
  assert.equal(liftProgress(lifts[0]), 0);
  assert.equal(progressLiftsFromWorkout(lifts, log(exercise('Lat Pullover', 100))), lifts);
});

test('case, punctuation, word order and one small typo reuse the same lift', () => {
  let lifts = progressLiftsFromWorkout([], log(exercise('Lat Pullover', 100)));
  for (const name of ['  LAT   pullover ', 'lat-pullover', 'Pullover Lat', 'Lat Pullovr']) {
    lifts = progressLiftsFromWorkout(lifts, log(exercise(name, lifts[0].currentWeight + 5)));
    assert.equal(lifts.length, 1);
  }
  assert.equal(lifts[0].history.length, 5);
});

test('heavier sets convert units, preserve goals and never reduce the best weight', () => {
  const lifts = progressLiftsFromWorkout([], log(exercise('Bench press', 100, 'kg')));
  lifts[0].goalWeight = 150;
  const updated = progressLiftsFromWorkout(lifts, log(exercise('bench press', 230)));
  assert.equal(updated[0].currentWeight, 104.33);
  assert.equal(updated[0].unit, 'kg');
  assert.equal(updated[0].goalWeight, 150);
  assert.equal(updated[0].history.length, 2);
  assert.equal(progressLiftsFromWorkout(updated, log(exercise('Bench press', 80, 'kg'))), updated);
});

test('different exercise variations remain separate and ambiguous matches are skipped', () => {
  const lifts = progressLiftsFromWorkout([], log(exercise('Barbell bench press', 100), exercise('Dumbbell bench press', 50)));
  assert.equal(lifts.length, 2);
  const duplicates = [lifts[0], { ...lifts[0], id: 'another-record' }];
  assert.equal(matchTrackedLift(duplicates, 'barbell bench press'), undefined);
  assert.equal(progressLiftsFromWorkout(duplicates, log(exercise('Barbell bench press', 120))), duplicates);
});

test('legacy exercises without per-set details also populate progression', () => {
  const row = exercise('Squat', 135); delete row.setDetails;
  const lifts = progressLiftsFromWorkout([], log(row));
  assert.equal(lifts[0].currentWeight, 135);
  assert.equal(lifts[0].history[0].maxReps, 8);
});

test('calendar corrections replace legacy records up or down, retaining goals and other sessions', () => {
  const first = { id: 'first', date: '2026-10-08', exercises: [exercise('Bench press', 100)] };
  const second = { id: 'second', date: '2026-10-09', exercises: [exercise('Bench press', 150)] };
  const current = progressLiftsFromWorkout(progressLiftsFromWorkout([], first), second);
  current[0].goalWeight = 200;
  const corrected = { ...second, exercises: [exercise('Bench press', 90)] };
  const next = reconcileWorkoutLifts(current, [first, corrected], [first, second], corrected);
  assert.equal(next[0].currentWeight, 100);
  assert.equal(next[0].goalWeight, 200);
  assert.equal(next[0].history.length, 2);
  assert.equal(next[0].history.some(entry => entry.weight === 150), false);
  const higher = { ...corrected, exercises: [exercise('Bench press', 170)] };
  const raised = reconcileWorkoutLifts(next, [first, higher], [first, corrected], higher);
  assert.equal(raised[0].currentWeight, 170);
  assert.equal(raised[0].history.find(entry => entry.workoutLogId === 'second').weight, 170);
  assert.equal(reconcileWorkoutLifts(raised, [first, higher], [first, corrected], higher)[0].history.length, 2, 'retry is idempotent');
});

test('same-day sessions, unit conversion, manual entries and renamed or deleted exercises reconcile independently', () => {
  const old = { id: 'a', date: '2026-10-08', exercises: [exercise('Squat', 100, 'kg')] };
  const other = { ...old, id: 'b', exercises: [exercise('Squat', 230)] };
  const current = progressLiftsFromWorkout(progressLiftsFromWorkout([], old), other);
  current[0].history.unshift({ date: '2026-10-01', weight: 80, minReps: 5, maxReps: 5 });
  const corrected = { ...other, exercises: [exercise('Squat', 180)] };
  const next = reconcileWorkoutLifts(current, [old, corrected], [old, other], corrected);
  assert.equal(next[0].currentWeight, 100);
  assert.equal(next[0].history.length, 3);
  const renamed = { ...corrected, exercises: [exercise('Bench press', 60)] };
  const changed = reconcileWorkoutLifts(next, [old, renamed], [old, corrected], renamed);
  assert.equal(changed[0].history.length, 2);
  assert.equal(changed[1].name, 'Bench press');
  const deleted = reconcileWorkoutLifts(changed, [renamed], [old, renamed], { ...old, exercises: [] });
  assert.equal(deleted[0].currentWeight, 80, 'manual baseline survives deletion');
  assert.equal(deleted[1], changed[1], 'unrelated lift is untouched');
});
