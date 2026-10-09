import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const { parseWorkoutDraft, uniqueWorkoutTemplates } = loadTs('src/lib/workout-drafts.ts');
const { exerciseToDraft, draftSets, prefillExercise, completedExercises, workoutStats, workoutRecords, performanceHistory, lastPerformance, validDraftSet, volumeLabel } = loadTs('src/lib/workout-logging.ts');
const { validWorkoutExercises, exerciseSummary } = loadTs('src/lib/workout-session.ts');
const exercise = { id: 'bench', name: 'Bench press', sets: 2, reps: 8, weight: 100, unit: 'lb', setDetails: [{ reps: 8, weight: 100 }, { reps: 6, weight: 110 }] };
const history = [{ id: 'last', date: '2026-10-07', exercises: [exercise] }];
test('template picker removes equivalent duplicates but retains different per-set prescriptions', () => {
  const original = { id: 'one', title: 'Chest day!', notes: '', rows: [exerciseToDraft(exercise, 'row')] };
  const duplicate = { ...original, id: 'two', title: 'CHEST DAY!', rows: [exerciseToDraft(exercise, 'another-row')] };
  const different = { ...original, id: 'three', rows: [exerciseToDraft({ ...exercise, setDetails: [{ reps: 8, weight: 100 }, { reps: 6, weight: 120 }] }, 'row')] };
  const result = uniqueWorkoutTemplates([original, duplicate, different]);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'one');
  assert.equal(result[1].id, 'three');
});

test('draft recovery retains manual versus template origin and rejects invalid origins', () => {
  const draft = { title: 'Chest day', notes: '', rows: [exerciseToDraft(exercise, 'row')] };
  for (const workoutOrigin of ['manual', 'template']) {
    assert.equal(parseWorkoutDraft(JSON.stringify({ ...draft, workoutOrigin })).workoutOrigin, workoutOrigin);
  }
  assert.equal(parseWorkoutDraft(JSON.stringify({ ...draft, workoutOrigin: 'unknown' })), null);
});

test('template duration round-trips without assigning a workout date and rejects invalid durations', () => {
  const template = { title: 'Push', notes: '', rows: [exerciseToDraft(exercise, 'template')], durationMinutes: 45 };
  const saved = parseWorkoutDraft(JSON.stringify(template));
  assert.equal(saved.durationMinutes, 45);
  assert.equal(saved.workoutDate, undefined);
  for (const durationMinutes of [0, -1, 1.5, 1441, '45', null]) assert.equal(parseWorkoutDraft(JSON.stringify({ ...template, durationMinutes })), null);
  assert.ok(parseWorkoutDraft(JSON.stringify({ ...template, durationMinutes: undefined })), 'old templates remain usable');
});
test('repeat and template prefill preserve every set and reset completion', () => {
  const row = exerciseToDraft(exercise, 'new');
  assert.equal(row.setValues[1].weight, '110');
  assert.equal(row.setValues.every(set => !set.completed), true);
  const template = prefillExercise({ ...row, sets: '3' }, exercise);
  assert.equal(template.setValues.length, 3);
  assert.equal(template.setValues[2].reps, '6');
  assert.equal(template.setValues[2].weight, '110');
  assert.equal(completedExercises([template]).length, 0);
});
test('draft recovery preserves completion, original date, order, and stable session ID', () => {
  const row = exerciseToDraft(exercise, 'new'); row.setValues[1].completed = true;
  const draft = { title: 'Push', notes: '', rows: [row], recordId: 'session-stable', workoutDate: '2026-10-07', started: true };
  const recovered = parseWorkoutDraft(JSON.stringify(draft));
  assert.equal(recovered.recordId, 'session-stable'); assert.equal(recovered.workoutDate, '2026-10-07');
  assert.equal(workoutStats(recovered.rows).sets, 1);
  assert.equal(parseWorkoutDraft(JSON.stringify({ ...draft, rows: [{ ...row, setValues: [{ reps: '8', weight: '0', completed: 'yes' }] }] })), null);
  assert.equal(parseWorkoutDraft(JSON.stringify({ ...draft, recordId: {} })), null);
  assert.ok(parseWorkoutDraft(JSON.stringify({ title: 'Old', notes: '', rows: [{ ...row, setValues: [{ reps: '8', weight: '100' }] }] })));
});
test('only completed sets contribute to history, exercises, and unit-specific volume', () => {
  const row = exerciseToDraft(exercise, 'new'); row.setValues[1].completed = true;
  const kg = exerciseToDraft({ ...exercise, unit: 'kg' }, 'kg', true);
  const stats = workoutStats([row, kg]);
  assert.equal(stats.sets, 3); assert.equal(stats.exercises.length, 2);
  assert.equal(stats.volume.lb, 660); assert.equal(stats.volume.kg, 1460);
  assert.equal(validWorkoutExercises(stats.exercises), true);
  assert.equal(volumeLabel(stats.volume), '660 lb + 1,460 kg');
  row.setValues[1].completed = false;
  assert.equal(completedExercises([row]).length, 0);
});
test('removing a set keeps completion attached to the remaining set', () => {
  const row = exerciseToDraft(exercise, 'new'); row.setValues[1].completed = true;
  row.setValues.splice(0, 1);
  assert.equal(workoutStats([row]).sets, 1);
  assert.equal(completedExercises([row])[0].setDetails[0].weight, 110);
  const added = { ...draftSets(row).at(-1), completed: false };
  row.setValues.push(added);
  assert.equal(workoutStats([row]).sets, 1); assert.equal(added.weight, '110');
});
test('previous performance excludes future sessions and the workout being edited', () => {
  const sorted = performanceHistory([...history, { id: 'future', date: '2026-10-09', exercises: [exercise] }, { id: 'edit', date: '2026-10-08', exercises: [exercise] }], '2026-10-08', 'edit');
  assert.equal(sorted.length, 1); assert.equal(lastPerformance(sorted, ' bench PRESS ').id, 'bench');
  const sameDay = performanceHistory([{ ...history[0], id: 'early', loggedAt: '2026-10-07T10:00:00Z' }, { ...history[0], id: 'late', loggedAt: '2026-10-07T12:00:00Z' }], '2026-10-08');
  assert.equal(sameDay[0].id, 'late');
});
test('records compare compatible units, distinguish baseline, and support bodyweight reps', () => {
  const heavier = { ...exercise, setDetails: [{ weight: 120, reps: 8 }, { weight: 110, reps: 6 }] };
  assert.match(workoutRecords([heavier], history)[0], /weight PR/);
  assert.equal(workoutRecords([heavier], []).length, 0);
  assert.equal(workoutRecords([exercise], history).length, 0);
  const kg = { ...exercise, weight: 49.9, setDetails: [{ weight: 49.9, reps: 6 }, { weight: 45.36, reps: 8 }], unit: 'kg' };
  assert.equal(workoutRecords([kg], history).length, 0);
  const bw = { ...exercise, weight: 0, sets: 1, reps: 8, setDetails: [{ weight: 0, reps: 8 }] };
  const improved = { ...bw, reps: 10, setDetails: [{ weight: 0, reps: 10 }] };
  assert.match(workoutRecords([improved], [{ id: 'bw', date: '2026-10-07', exercises: [bw] }])[0], /rep PR/);
});
test('invalid or missing values cannot be checked, but bodyweight zero is valid', () => {
  assert.equal(validDraftSet({ reps: '8', weight: '0' }), true);
  for (const set of [{ reps: '', weight: '0' }, { reps: '8', weight: '' }, { reps: '1.5', weight: '10' }, { reps: '8', weight: '-1' }, { reps: '101', weight: '0' }]) assert.equal(validDraftSet(set), false);
});
test('history summaries preserve different weights and reps across completed sets', () => {
  assert.equal(exerciseSummary([exercise]), 'Bench press: 8 reps at 100 lb; 6 reps at 110 lb');
  assert.equal(exerciseSummary([{ ...exercise, setDetails: undefined }]), 'Bench press: 2 × 8 at 100 lb');
});
