import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const { hasWorkoutDraftInput, parseWorkoutDraft } = loadTs('src/lib/workout-drafts.ts');
const empty = { title: '', notes: '', rows: [], durationMinutes: 45 };
const example = { id: 'example', exercise: 'Bench press', customName: '', sets: '3', reps: '8', weight: '60', unit: 'kg' };

test('opening an empty or prefilled workout does not count as entered progress', () => {
  assert.equal(hasWorkoutDraftInput({ ...empty, hasUserInput: false }), false);
  assert.equal(hasWorkoutDraftInput({ ...empty, title: 'Planned push', rows: [example], hasUserInput: false, started: true }), false);
  assert.equal(hasWorkoutDraftInput({ ...empty, started: true }), false);
  assert.equal(hasWorkoutDraftInput({ ...empty, title: 'Workout', started: true }), false);
  assert.equal(hasWorkoutDraftInput({ ...empty, rows: [example], started: true }), false);
});

test('names, notes, exercises and partial numeric input create resumable progress', () => {
  for (const edits of [{ title: 'Push day' }, { title: 'Workout' }, { notes: 'Feeling strong' }, { rows: [example] }, { durationInput: '12' }, { durationInput: '0' }]) {
    assert.equal(hasWorkoutDraftInput({ ...empty, ...edits, hasUserInput: true }), true);
  }
  assert.equal(hasWorkoutDraftInput({ ...empty, title: '   ', hasUserInput: true }), false);
  assert.equal(hasWorkoutDraftInput({ ...empty, durationInput: '45', hasUserInput: true }), false);
  assert.equal(hasWorkoutDraftInput({ ...empty, durationInput: '45', durationEdited: true, hasUserInput: true }), true, 'explicitly entering even the default number counts');
});

test('legacy real progress survives while untouched placeholders are ignored', () => {
  assert.equal(hasWorkoutDraftInput({ ...empty, title: 'My session' }), true);
  assert.equal(hasWorkoutDraftInput({ ...empty, rows: [{ ...example, weight: '72' }] }), true);
  assert.equal(hasWorkoutDraftInput({ ...empty, rows: [{ ...example, setValues: [{ reps: '8', weight: '60', completed: true }] }] }), true);
});

test('legacy prefilled routines require a change before showing Resume', () => {
  const template = { ...empty, title: 'Leg Day', rows: [{ ...example, exercise: 'Leg press', reps: '', weight: '', unit: 'lb' }] };
  const draft = { ...template, workoutOrigin: 'template', started: true };
  assert.equal(hasWorkoutDraftInput(draft, [template]), false);
  assert.equal(hasWorkoutDraftInput({ ...draft, title: 'My Leg Day' }, [template]), true);
  assert.equal(hasWorkoutDraftInput({ ...draft, rows: [{ ...template.rows[0], weight: '0' }] }, [template]), true);
  assert.equal(hasWorkoutDraftInput({ ...draft, rows: [{ ...template.rows[0], setValues: [{ reps: '8', weight: '60', completed: true }] }] }, [template]), true);
  assert.equal(hasWorkoutDraftInput({ ...draft, hasUserInput: true }, [template]), false, 'older inferred input flags cannot turn an untouched routine into user input');
  assert.equal(hasWorkoutDraftInput({ ...draft, hasUserInput: true, inputVersion: 1 }, [template]), true);
});

test('draft input intent and partial duration round-trip with schema validation', () => {
  const draft = { ...empty, hasUserInput: true, durationInput: '0' };
  const recovered = parseWorkoutDraft(JSON.stringify(draft));
  assert.equal(recovered.durationInput, '0'); assert.equal(recovered.hasUserInput, true);
  assert.equal(parseWorkoutDraft(JSON.stringify({ ...draft, hasUserInput: 'yes' })), null);
  assert.equal(parseWorkoutDraft(JSON.stringify({ ...draft, durationInput: '1'.repeat(21) })), null);
});
