import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const { templateRepTarget, validTemplateRows, normalizeTemplateRows } = loadTs('src/lib/workout-template.ts');
const { parseWorkoutDraft, uniqueWorkoutTemplates } = loadTs('src/lib/workout-drafts.ts');
const { draftSets, completedExercises } = loadTs('src/lib/workout-logging.ts');
const row = { id: 'bench', exercise: 'Bench press', customName: '', sets: '3', reps: '8', repRange: '8–12', weight: '', unit: 'lb' };

test('template ranges keep usable numeric logging targets without requiring weight', () => {
  assert.equal(validTemplateRows([row]), true);
  const normalized = normalizeTemplateRows([row]);
  assert.equal(normalized[0].reps, '8'); assert.equal(normalized[0].repRange, '8–12'); assert.equal(normalized[0].weight, '');
  assert.equal(draftSets(normalized[0]).length, 3);
  assert.equal(draftSets(normalized[0])[0].reps, '8');
  assert.equal(completedExercises(normalized).length, 0, 'a saved template never counts as performed work');
  const draft = { title: 'Push', notes: '', rows: normalized };
  assert.equal(parseWorkoutDraft(JSON.stringify(draft)).rows[0].repRange, '8–12');
});
test('ranges validate bounds, order, format and set counts', () => {
  for (const value of ['0', '101', '12–8', '8–101', '8.5', '', '8-12-15']) assert.equal(templateRepTarget(value), null, value);
  assert.equal(templateRepTarget(' 6 - 10 ').label, '6–10');
  assert.equal(templateRepTarget('10').min, 10);
  assert.equal(validTemplateRows([{ ...row, sets: '0' }]), false);
  assert.equal(validTemplateRows([{ ...row, sets: '101' }]), false);
  assert.equal(validTemplateRows([{ ...row, repRange: '12–8' }]), false);
  assert.equal(validTemplateRows([]), false);
});
test('existing templates retain notes, per-set weights and completion is cleared', () => {
  const legacy = { ...row, repRange: undefined, weight: '135', setValues: [{ reps: '8', weight: '135', completed: true }, { reps: '6', weight: '145' }] };
  const normalized = normalizeTemplateRows([legacy])[0];
  assert.equal(normalized.setValues[1].weight, '145');
  assert.equal(normalized.setValues[1].reps, '6');
  assert.equal(normalized.setValues[0].completed, false);
  assert.equal(legacy.setValues[0].completed, true, 'normalization never mutates source data');
});
test('different rep ranges remain distinct saved templates', () => {
  const draft = { title: 'Push', notes: '', rows: [row] };
  assert.equal(uniqueWorkoutTemplates([draft, { ...draft, rows: [{ ...row, repRange: '8–15' }] }]).length, 2);
  assert.equal(parseWorkoutDraft(JSON.stringify({ ...draft, rows: [{ ...row, repRange: 12 }] })), null);
});
