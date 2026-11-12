import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

const { muscleBalance, muscleSettingId, savedMuscleClassifications, exerciseMuscles } = loadTs('src/lib/exercise-muscles.ts');
const exercise = (name, sets) => ({ id: name, name, sets, reps: 8, weight: 0, unit: 'lb' });
const setting = (name, groups) => ({
  id: muscleSettingId(name),
  value: { updatedAt: 1, content: JSON.stringify({ name, groups }) },
});

test('completed sets use bundled catalog matches and split compound sets without double-counting', () => {
  const result = muscleBalance([{ exercises: [exercise(' BENCH   PRESS ', 3), exercise('Barbell squat', 4), exercise('Lean-away cable lateral raise', 2), exercise('Unknown lift', 1), exercise('Incomplete lift', 0)] }], new Map());
  assert.equal(result.totalSets, 10);
  assert.equal(result.classifiedSets, 9);
  assert.equal(result.groups.reduce((sum, group) => sum + group.sets, 0), 9);
  for (const { group, sets } of result.groups) {
    const contributions = [...result.contributions.get(group).values()];
    assert.equal(contributions.reduce((sum, exercise) => sum + exercise.sets, 0), sets);
  }
  assert.equal(result.groups.find(row => row.group === 'Quads').sets, 2);
  assert.equal(result.groups.find(row => row.group === 'Shoulders').sets, 2);
  assert.equal(result.unclassified[0].name, 'Unknown lift');
});

test('synced classifications apply to legacy exercise names and ignore malformed settings', () => {
  const saved = savedMuscleClassifications([setting('My cable press', ['Chest', 'Triceps', 'Chest']), setting('Broken lift', ['Unknown'])]);
  assert.equal(exerciseMuscles('my CABLE  press', saved).join(','), 'Chest,Triceps');
  assert.equal(exerciseMuscles('Broken lift', saved).length, 0);
  const result = muscleBalance([{ exercises: [exercise('my cable press', 3)] }], saved);
  assert.equal(result.classifiedSets, 3);
  assert.equal(result.groups.find(row => row.group === 'Chest').sets, 1.5);
  assert.equal(result.unclassified.length, 0);
});
