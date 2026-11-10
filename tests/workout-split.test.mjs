import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const { matchesSplitTemplate, isSplitWorkoutCompleted } = loadTs('src/lib/workout-split.ts');
const legs = { id: 'legs', title: 'Leg Day' };
const days = ['chest', 'legs', '', 'chest', 'legs', '', ''];
const log = (date, extra = {}) => ({ date, title: 'Leg Day', sourceTemplateId: 'legs', ...extra });

test('resume matching uses template identity, with a legacy title fallback', () => {
  assert.equal(matchesSplitTemplate(log('2026-11-03'), legs), true);
  assert.equal(matchesSplitTemplate(log('2026-11-03', { sourceTemplateId: 'chest' }), legs), false);
  assert.equal(matchesSplitTemplate({ title: ' leg day ' }, legs), true);
  assert.equal(matchesSplitTemplate({ title: 'Chest Day' }, legs), false);
});

test('Tuesday remains scheduled after training legs on Monday', () => {
  assert.equal(isSplitWorkoutCompleted('2026-11-03', legs, [log('2026-11-02')]), false);
  assert.equal(isSplitWorkoutCompleted('2026-11-03', legs, [log('2026-11-03')]), true);
  assert.equal(isSplitWorkoutCompleted('2026-11-03', legs, [log('2026-11-03', { sourceTemplateId: 'chest' })]), false);
});

test('one completion cannot satisfy later occurrences or alter the weekly split', () => {
  const snapshot = [...days];
  assert.equal(isSplitWorkoutCompleted('2026-11-06', legs, [log('2026-11-03')]), false);
  assert.equal(isSplitWorkoutCompleted('2026-11-03', legs, [log('2026-10-30')]), false);
  assert.equal(isSplitWorkoutCompleted('2026-11-03', legs, [log('2026-11-04')]), false);
  assert.deepEqual(days, snapshot);
});

test('only the scheduled date completes a workout, including across week boundaries', () => {
  assert.equal(isSplitWorkoutCompleted('2026-11-03', legs, [log('2026-11-01')]), false);
  assert.equal(isSplitWorkoutCompleted('2026-11-06', legs, [log('2026-11-05')]), false);
  assert.equal(isSplitWorkoutCompleted('2026-11-06', legs, [log('2026-11-06', { title: 'Renamed legs' })]), true);
  assert.equal(isSplitWorkoutCompleted('2026-11-03', legs, [{ date: '2026-11-03', title: ' leg day ' }]), true);
});
