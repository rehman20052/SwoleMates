import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const { partnerWorkoutHasProgress } = loadTs('src/lib/workout-draft-progress.ts');
const base = { title: 'Partner workout', notes: '', inputVersion: 1, hasUserInput: false, started: false, rows: [] };
const row = { id: 'lift', exercise: 'Deadlift', customName: '', sets: '3', reps: '', weight: '', unit: 'lb' };
const record = (draft, updatedAt = 1) => ({ content: JSON.stringify(draft), updatedAt });
const progress = { ...base, rows: [row], hasUserInput: true, started: true };

test('partner workouts resume after adding exercises without completed sets', () => {
  assert.equal(partnerWorkoutHasProgress(record(progress), null), true);
  assert.equal(partnerWorkoutHasProgress(null, record(progress)), true);
  assert.equal(partnerWorkoutHasProgress(record({ ...base, rows: [row] }), null), false, 'prefilled routines do not count as user input');
  assert.equal(partnerWorkoutHasProgress(record(base), null), false);
});
test('local progress beats stale cloud and cleared drafts beat stale progress', () => {
  assert.equal(partnerWorkoutHasProgress(record(progress, 2), record(base, 1)), true);
  assert.equal(partnerWorkoutHasProgress({ content: '', updatedAt: 3 }, record(progress, 2)), false);
  assert.equal(partnerWorkoutHasProgress(record(progress, 2), { content: '', updatedAt: 3 }), false);
  assert.equal(partnerWorkoutHasProgress(record(progress), null, true), false, 'finished workouts cannot appear as in progress');
  assert.equal(partnerWorkoutHasProgress({ content: '{broken', updatedAt: 1 }, null), false);
});
