import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const modules = new Map();
function loadModule(file) {
  const path = resolve(file);
  if (modules.has(path)) return modules.get(path);
  const exports = {};
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => loadModule(resolve(dirname(path), `${name}.ts`)) });
  modules.set(path, exports);
  return exports;
}
const { createRecipeStore, recipeStorageKey } = loadModule('src/lib/recipe-storage.ts');
const { createFoodJournal, foodJournalKey, sumFoodEntries } = loadModule('src/lib/food-journal.ts');
const { createHiddenChatStore } = loadModule('src/lib/hidden-chats.ts');
const { createDurableList } = loadModule('src/lib/durable-list.ts');
const { mergeVerifiedLogs, workoutLogKey } = loadModule('src/lib/workout-log-sync.ts');
const { moveProfileMedia } = loadModule('src/lib/profile-media-order.ts');
const { profileLifts, legacyLiftFields } = loadModule('src/lib/profile-lifts.ts');

test('optional profile lifts survive JSON reload and explicit removal overrides legacy lifts', () => {
  const old = { bench: '135 lbs', squat: 'N/A', deadlift: '225 lbs', customLiftName: '', customLift: 'N/A' };
  assert.deepEqual(plain(profileLifts(old)).map(lift => lift.name), ['Bench press', 'Deadlift']);
  assert.deepEqual(plain(profileLifts({ ...old, displayLifts: [] })), []);
  const displayLifts = [{ name: 'Cable press', weight: 50, unit: 'kg' }];
  assert.deepEqual(plain(profileLifts(JSON.parse(JSON.stringify({ ...old, displayLifts })))), displayLifts);
  assert.deepEqual(plain(legacyLiftFields([])), { bench: 'N/A', squat: 'N/A', deadlift: 'N/A', customLiftName: '', customLift: 'N/A' });
  assert.equal(profileLifts({ displayLifts: [{ name: 'Bad', weight: -1, unit: 'lb' }, ...displayLifts, ...displayLifts] }).length, 1);
});
const { createNutritionPlanStore, nutritionPlanStorageKey, goalsFromProfile } = loadModule('src/lib/nutrition-plan-storage.ts');
const { withCurrentWeight } = loadModule('src/lib/macro-calculator.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));
function memoryStorage() {
  const data = new Map();
  return { data, failWrite: false, failRead: false,
    async getItem(key) { if (this.failRead) throw new Error('read failure'); return data.get(key) ?? null; },
    async setItem(key, value) { if (this.failWrite) throw new Error('write failure'); data.set(key, value); },
  };
}
const recipe = (id, name = 'My recipe') => ({ id, name, meal: 'Lunch', calories: 600, protein: 40, carbs: 65, fats: 20 });
const validRecipe = (value) => value && typeof value.id === 'string' && typeof value.name === 'string';
const defaultGoals = { calorieGoal: 2500, proteinGoal: 190, carbGoal: 260, fatGoal: 75 };
const macroProfile = { sex: 'Male', age: 28, weightLb: 180, heightIn: 70, goal: 'maintain', targetWeightLb: null,
  targetWeeks: null, steps: '7to10', strengthDays: 4, cardioSessions: 0, cardioLength: null, bodyFat: null,
  weighIns: [], plannedWeeklyLb: 0, calorieAdjustment: 0, calibratedThrough: null };

test('macro plan migrates together and survives a next-day reopen with stale dashboard values', async () => {
  const storage = memoryStorage();
  const store = createNutritionPlanStore(storage);
  const goals = goalsFromProfile(macroProfile);
  await store.load(goals, macroProfile, defaultGoals);
  const manualGoals = { calorieGoal: 2300, proteinGoal: 175, carbGoal: 240, fatGoal: 70 };
  await store.change((current) => ({ ...current, goals: manualGoals }));
  const reopened = await createNutritionPlanStore(storage).load(defaultGoals, null, defaultGoals);
  assert.deepEqual(plain(reopened), { goals: manualGoals, profile: macroProfile });
  assert.ok(!('calories' in reopened.goals));
});
test('next day starts food totals at zero while saved goals and weigh-ins carry forward', async () => {
  const storage = memoryStorage();
  const planStore = createNutritionPlanStore(storage);
  const journal = createFoodJournal(storage);
  await planStore.load(null, macroProfile, defaultGoals);
  await journal.load([]);
  await journal.change(() => [{ ...recipe('friday'), date: '2026-10-02' }]);
  const profile = withCurrentWeight(macroProfile, '2026-10-02', 182);
  await planStore.change(() => ({ profile, goals: goalsFromProfile(profile) }));
  const nextDayPlan = await createNutritionPlanStore(storage).load(defaultGoals, null, defaultGoals);
  const entries = await createFoodJournal(storage).load([]);
  assert.equal(sumFoodEntries(entries, '2026-10-03').calories, 0);
  assert.equal(sumFoodEntries(entries, '2026-10-02').calories, 600);
  assert.deepEqual(plain(nextDayPlan), plain({ profile, goals: goalsFromProfile(profile) }));
});
test('failed macro save preserves the previous targets and profile, then supports retry', async () => {
  const storage = memoryStorage(); const store = createNutritionPlanStore(storage);
  await store.load(defaultGoals, macroProfile, defaultGoals);
  const oldValue = storage.data.get(nutritionPlanStorageKey);
  const profile = { ...macroProfile, goal: 'gain', targetWeightLb: 200, targetWeeks: 20 };
  storage.failWrite = true;
  await assert.rejects(store.change(() => ({ profile, goals: goalsFromProfile(profile) })));
  assert.equal(storage.data.get(nutritionPlanStorageKey), oldValue);
  storage.failWrite = false;
  await store.change(() => ({ profile, goals: goalsFromProfile(profile) }));
  const reopened = await createNutritionPlanStore(storage).load(null, null, defaultGoals);
  assert.deepEqual(plain(reopened), { profile, goals: plain(goalsFromProfile(profile)) });
});
test('unloaded, unreadable, or invalid macro plans cannot overwrite saved targets', async () => {
  const storage = memoryStorage();
  await assert.rejects(createNutritionPlanStore(storage).change(() => ({ profile: null, goals: defaultGoals })));
  storage.data.set(nutritionPlanStorageKey, '{broken');
  await assert.rejects(createNutritionPlanStore(storage).load(null, null, defaultGoals));
  assert.equal(storage.data.get(nutritionPlanStorageKey), '{broken');
  storage.data.delete(nutritionPlanStorageKey);
  const store = createNutritionPlanStore(storage); await store.load(defaultGoals, null, defaultGoals);
  const oldValue = storage.data.get(nutritionPlanStorageKey);
  await assert.rejects(store.change(() => ({ profile: null, goals: { ...defaultGoals, calorieGoal: 0 } })));
  assert.equal(storage.data.get(nutritionPlanStorageKey), oldValue);
});
test('concurrent macro edits are serialized and keep the latest profile and targets together', async () => {
  const storage = memoryStorage(); const store = createNutritionPlanStore(storage);
  await store.load(defaultGoals, macroProfile, defaultGoals);
  await Promise.all([
    store.change((current) => ({ ...current, goals: { ...current.goals, calorieGoal: 2400 } })),
    store.change((current) => ({ ...current, profile: { ...current.profile, age: 29 } })),
  ]);
  const reopened = await createNutritionPlanStore(storage).load(null, null, defaultGoals);
  assert.equal(reopened.goals.calorieGoal, 2400); assert.equal(reopened.profile.age, 29);
});

test('migrates real recipes, removes only placeholder IDs, and keeps deletions after reopening', async () => {
  const storage = memoryStorage();
  const store = createRecipeStore(storage);
  const real = recipe('saved-1234567', 'Chicken burrito bowl');
  assert.deepEqual(plain(await store.load([recipe('saved-1'), real, recipe('saved-2'), recipe('saved-3')], validRecipe)), [real]);
  await store.change((current) => [...current, recipe('saved-new')]);
  assert.deepEqual(plain(await createRecipeStore(storage).load([], validRecipe)), [real, recipe('saved-new')]);
  await store.change((current) => current.filter((row) => row.id !== real.id));
  assert.deepEqual(plain(await createRecipeStore(storage).load([], validRecipe)), [recipe('saved-new')]);
});

test('failed recipe read does not overwrite stored data', async () => {
  const storage = memoryStorage();
  storage.data.set(recipeStorageKey, JSON.stringify([recipe('real')]));
  storage.failRead = true;
  await assert.rejects(createRecipeStore(storage).load([], validRecipe));
  assert.deepEqual(JSON.parse(storage.data.get(recipeStorageKey)), [recipe('real')]);
  storage.failRead = false;
  storage.data.set(recipeStorageKey, 'broken json');
  await assert.rejects(createRecipeStore(storage).load([], validRecipe));
  assert.equal(storage.data.get(recipeStorageKey), 'broken json');
});

test('failed recipe write is rejected and a retry keeps previous recipes', async () => {
  const storage = memoryStorage();
  const store = createRecipeStore(storage);
  await store.load([recipe('existing')], validRecipe);
  storage.failWrite = true;
  await assert.rejects(store.change((current) => [...current, recipe('new')]));
  assert.deepEqual(JSON.parse(storage.data.get(recipeStorageKey)), [recipe('existing')]);
  storage.failWrite = false;
  await store.change((current) => [...current, recipe('new')]);
  assert.deepEqual(JSON.parse(storage.data.get(recipeStorageKey)), [recipe('existing'), recipe('new')]);
});

test('concurrent saves serialize and neither recipe is lost', async () => {
  const storage = memoryStorage();
  const store = createRecipeStore(storage);
  await store.load([], validRecipe);
  await Promise.all([
    store.change((current) => [...current, recipe('first')]),
    store.change((current) => [...current, recipe('second')]),
  ]);
  assert.deepEqual(JSON.parse(storage.data.get(recipeStorageKey)), [recipe('first'), recipe('second')]);
});

test('Friday food survives reopening; editing or deleting Friday does not affect Saturday', async () => {
  const storage = memoryStorage();
  const journal = createFoodJournal(storage);
  const friday = { ...recipe('food-friday'), date: '2026-10-02' };
  const saturday = { ...recipe('food-saturday'), date: '2026-10-03' };
  await journal.load([friday]);
  await journal.change((current) => [...current, saturday]);
  const reopened = createFoodJournal(storage);
  const saved = await reopened.load([]);
  assert.equal(sumFoodEntries(saved, friday.date).calories, 600);
  await reopened.change((current) => current.map((row) => row.id === friday.id ? { ...row, calories: 700 } : row));
  let entries = JSON.parse(storage.data.get(foodJournalKey));
  assert.equal(sumFoodEntries(entries, friday.date).calories, 700);
  assert.equal(sumFoodEntries(entries, saturday.date).calories, 600);
  await reopened.change((current) => current.filter((row) => row.id !== friday.id));
  entries = await createFoodJournal(storage).load([]);
  assert.equal(sumFoodEntries(entries, friday.date).calories, 0);
  assert.equal(sumFoodEntries(entries, saturday.date).calories, 600);
});

test('an empty day starts at zero; nutrition data ignores stale legacy dashboard fallback', async () => {
  const storage = memoryStorage();
  const journal = createFoodJournal(storage);
  await journal.load([{ ...recipe('meal'), date: '2026-10-02' }]);
  await journal.change(() => []);
  const restored = await createFoodJournal(storage).load([{ ...recipe('old'), date: '2026-10-02' }]);
  assert.deepEqual(plain(restored), []);
  assert.equal(sumFoodEntries(restored, '2026-10-03').calories, 0);
});

test('hidden chats persist per account and Show removes them from the hidden list', async () => {
  const storage = memoryStorage();
  const hidden = createHiddenChatStore(storage);
  await Promise.all([hidden.setHidden('alice', 'match-a', true), hidden.setHidden('alice', 'match-b', true)]);
  assert.deepEqual([...await createHiddenChatStore(storage).load('alice')].sort(), ['match-a', 'match-b']);
  assert.equal((await hidden.load('bob')).size, 0);
  await hidden.setHidden('alice', 'match-a', false);
  assert.deepEqual([...await hidden.load('alice')], ['match-b']);
});

test('deleting a partner workout survives server refresh and reopening without removing other workouts', async () => {
  const storage = memoryStorage();
  const store = createDurableList(storage, 'deletions', (value) => typeof value === 'string');
  const partner = { id: 'verified-check-in-plan-a', plannedWorkoutId: 'plan-a', checkedIn: true, date: '2026-10-02', title: 'Legs', verified: true };
  const other = { ...partner, id: 'verified-check-in-plan-b', plannedWorkoutId: 'plan-b' };
  const solo = { id: 'solo', date: partner.date, title: 'Solo', verified: false };
  await store.load([]);
  await store.change((current) => [...current, workoutLogKey(partner)]);
  const reopened = createDurableList(storage, 'deletions', (value) => typeof value === 'string');
  const deleted = await reopened.load([]);
  assert.deepEqual(plain(mergeVerifiedLogs([partner, solo], [partner, other], deleted)), [other, solo]);
  assert.deepEqual(plain(mergeVerifiedLogs([solo], [{ ...partner, id: 'different-server-id' }, other], deleted)), [other, solo]);
});

test('moving profile photos preserves video types and captions in both directions', () => {
  const media = { photos: ['first.jpg', 'second.mp4', 'third.jpg'], photoMedia: ['image', 'video', 'image'], photoCaptions: ['First', 'Second', 'Third'] };
  const moved = moveProfileMedia(media, 2, 0);
  assert.deepEqual(plain(moved), { photos: ['third.jpg', 'first.jpg', 'second.mp4'], photoMedia: ['image', 'image', 'video'], photoCaptions: ['Third', 'First', 'Second'] });
  assert.deepEqual(plain(moveProfileMedia(moved, 0, 2)), media);
  assert.equal(moveProfileMedia(media, 0, -1), media);
  assert.equal(moveProfileMedia(media, 0, 3), media);
});
