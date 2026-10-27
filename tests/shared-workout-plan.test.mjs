import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const { sharedExercises } = loadTs('src/lib/shared-workout-plan.ts');
const { parseRoutine } = loadTs('src/lib/shared-workout-plan.ts');

test('invite routine snapshots retain targets, strip private fields and reject invalid exercises', () => {
  const parsed = parseRoutine({ title: 'Push', notes: 'private', exercises: [{ name: 'Bench press', sets: 3, reps: 8, weight: 200 }] });
  assert.equal(JSON.stringify(parsed), JSON.stringify({ title: 'Push', exercises: [{ name: 'Bench press', sets: 3, reps: 8 }] }));
  assert.equal(parseRoutine(null), null);
  assert.equal(parseRoutine({ title: 'Push', exercises: [] }), null);
  assert.equal(parseRoutine({ title: 'Push', exercises: [{ name: '', sets: 3, reps: 8 }] }), null);
  assert.equal(parseRoutine({ title: 'Push', exercises: [{ name: 'Bench', sets: 101, reps: 8 }] }), null);
});

test('routine selection shares targets but strips weights and completed state', () => {
  const plan = sharedExercises([{ id: 'one', exercise: 'Other', customName: 'Home squat', sets: '3', reps: '8', weight: '100', unit: 'kg', setValues: [{ reps: '10', weight: '110', completed: true }] }]);
  assert.equal(JSON.stringify(plan), JSON.stringify([{ name: 'Home squat', sets: 1, reps: 10 }]));
});
test('templates without performance values get target reps, while invalid exercises cannot be shared', () => {
  const row = { id: 'one', exercise: 'Squat', customName: '', sets: '3', reps: '', weight: '', unit: 'kg' };
  assert.equal(sharedExercises([row])[0].reps, 8);
  assert.throws(() => sharedExercises([{ ...row, exercise: 'Choose exercise' }]));
  assert.throws(() => sharedExercises([{ ...row, reps: '101' }]));
});
