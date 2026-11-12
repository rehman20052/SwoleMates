import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';
const { buildWorkoutAnalytics, defaultAnalyticsLift, exerciseWorkload, estimatedOneRepMax, repWeightProfile, periodBounds, activityStreaks, strengthSessions, completedAnalyticsLogs, shiftDay } = loadTs('src/lib/workout-analytics.ts');
const exercise = (weight = 100, reps = 8, unit = 'lb', name = 'Bench press') => ({ id: 'bench', name, sets: 1, reps, weight, unit, setDetails: [{ reps, weight }] });
const log = (id, date, exercises = [exercise()], extras = {}) => ({ id, date, title: 'Workout', verified: false, exercises, ...extras });
const analytics = (logs, extra = {}) => buildWorkoutAnalytics({ logs, today: '2026-11-10', unit: 'lb', range: 30, ...extra });

test('default progression prefers the latest lift with two workouts, including same-day workouts', () => {
  const early = log('early', '2026-11-09', [exercise(), { ...exercise(), id: 'extra' }]);
  const later = log('later', '2026-11-09');
  const latest = log('latest', '2026-11-10', [exercise(60, 5, 'lb', 'Cable row')]);
  assert.equal(defaultAnalyticsLift(analytics([early, later, latest]).points).workoutId, 'later');
  assert.equal(defaultAnalyticsLift(analytics([early, latest]).points).workoutId, 'latest');
  assert.equal(defaultAnalyticsLift(analytics([]).points), undefined);
});

test('weekly exercise breakdown reconciles partial weeks, added load, corrections and deletions', () => {
  const baseline = log('base', '2026-11-06', [exercise()]);
  const pullUp = { ...exercise(0, 5, 'lb', 'Pull-up'), id: 'pull' };
  const workout = weight => log('changed', '2026-11-10', [exercise(weight, 8), pullUp, { ...pullUp, id: 'weighted-pull', weight: 20, setDetails: [{ weight: 20, reps: 4 }] }]);
  for (const [weight, deleted, expected, records] of [[110, [], 960, 2], [100, [], 880, 0], [100, ['changed'], 0, 0]]) {
    const data = analytics([baseline, workout(weight)], { range: 7, deleted });
    const week = data.weeks.at(-1);
    assert.equal(week.partial, true);
    assert.equal(week.volume, expected);
    const breakdown = exerciseWorkload(data.points, week);
    assert.equal(breakdown.reduce((sum, row) => sum + row.volume, 0), expected);
    assert.equal(exerciseWorkload(data.points).reduce((sum, row) => sum + row.volume, 0), 800 + expected);
    assert.equal(data.recordsAchieved, records);
    assert.equal(data.selected.length, deleted.length ? 1 : 2);
    if (!deleted.length) {
      assert.equal(data.points.find(point => point.workoutId === 'changed').source.weight.weight, weight);
      assert.equal(breakdown.find(row => row.name === 'Pull-up').reps, 9);
    }
  }
});

test('periods include today and compare exactly the same number of local calendar dates', () => {
  const bounds = periodBounds(7, '2026-11-03');
  assert.equal(bounds.start, '2026-10-28'); assert.equal(bounds.previousStart, '2026-10-21'); assert.equal(bounds.previousEnd, '2026-10-27'); assert.equal(bounds.days, 7);
  assert.equal(shiftDay('2026-03-08', 1), '2026-03-09');
  assert.equal(periodBounds(30, '2026-03-10').days, 30);
  assert.equal(periodBounds('all', '2026-11-10', '2026-10-01').days, 41);
});
test('estimates use one eligibility policy and cap higher reps; singles use actual weight', () => {
  assert.ok(Math.abs(estimatedOneRepMax(' Bench   PRESS ', 100, 6) - 120) < 0.001);
  assert.equal(estimatedOneRepMax('Bench press', 150, 1), 150);
  for (const name of ['Pull-up', 'Push-up', 'Assisted pull-up', 'Dip']) assert.equal(estimatedOneRepMax(name, 100, 5), null);
  for (const reps of [0, 101, 1.5, NaN]) assert.equal(estimatedOneRepMax('Bench press', 100, reps), null);
  assert.equal(estimatedOneRepMax('Custom movement', 100, 20), estimatedOneRepMax('Custom movement', 100, 10));
  for (const weight of [0, -1, NaN, Infinity]) assert.equal(estimatedOneRepMax('Bench press', weight, 5), null);
});
test('normalize mixed units, use individual sets, merge repeated exercise rows within a session', () => {
  const row = exercise(100, 8); row.sets = 2; row.setDetails.push({ reps: 4, weight: 120 });
  const data = analytics([log('one', '2026-11-01', [row, { ...exercise(50, 5, 'kg'), id: 'second' }])]);
  assert.equal(data.points.length, 1);
  const expected = 800 + 480 + 250 / 0.45359237;
  assert.ok(Math.abs(data.volume - expected) < 0.001);
  assert.equal(data.points[0].weight, 120); assert.equal(data.points[0].reps, 8);
  const kg = analytics([log('one', '2026-11-01', [row])], { unit: 'kg' });
  assert.ok(Math.abs(kg.volume - 1280 * 0.45359237) < 0.001);
});
test('the scoped rep profile and session use the same source and estimate', () => {
  const history = [
    log('older', '2026-09-01', [exercise(132, 8)]),
    log('recent', '2026-11-10', [exercise(160, 5), { ...exercise(145, 8), id: 'bench-second' }, { ...exercise(140, 8), id: 'bench-third' }]),
  ];
  const data = analytics(history);
  const profile = repWeightProfile(data.selected, 'Bench press', 'lb');
  assert.deepEqual(Array.from(profile.points, ({ reps, weight }) => [reps, weight]), [[5, 160], [8, 145]]);
  assert.deepEqual([profile.attempt.low, profile.attempt.high, profile.attempt.basis.weight], [175, 185, 160]);
  const [point] = data.points;
  assert.equal(point.workoutId, profile.attempt.basis.workoutId);
  assert.equal(point.source.estimatedMax.rowId, profile.attempt.basis.rowId);
  assert.equal(point.estimatedMax, profile.attempt.basis.estimate);
  assert.equal(point.date, profile.attempt.basis.date);
  const cable = 'Cable Lateral Raises (Single Arm)';
  const cableData = analytics([log('cable', '2026-11-09', [exercise(20, 18, 'lb', cable)])]);
  assert.equal(repWeightProfile(cableData.selected, cable, 'lb').attempt.basis.estimate, cableData.points[0].estimatedMax);
  assert.equal(repWeightProfile([], 'Bench press', 'lb').attempt, null);
});
test('deleted, duplicate and future logs do not contribute; date-only records still count as activity', () => {
  const rows = [log('one', '2026-11-01', [], { plannedWorkoutId: 'plan' }), log('duplicate', '2026-11-01', [exercise(1000)], { plannedWorkoutId: 'plan' }), log('deleted', '2026-11-02'), log('future', '2026-11-11'), log('invalid', '2026-02-30'), log('check-in', '2026-11-03', undefined)];
  const filtered = completedAnalyticsLogs(rows, ['deleted'], '2026-11-10');
  assert.equal(filtered.length, 2); assert.equal(filtered[0].id, 'one');
  assert.equal(completedAnalyticsLogs(rows, ['planned:plan', 'deleted'], '2026-11-10').length, 1);
  const data = analytics([log('checkin', '2026-11-03', [])]);
  assert.equal(data.selected.length, 1); assert.equal(data.detailedWorkouts, 0); assert.equal(data.volume, 0);
});
test('invalid exercise data is excluded without losing a completed workout', () => {
  for (const row of [{ ...exercise(), unit: 'stone' }, exercise(-5), exercise(NaN), { ...exercise(), setDetails: [{ reps: 0, weight: 100 }] }]) {
    assert.equal(strengthSessions([log('one', '2026-11-01', [row])], 'lb').length, 0);
  }
  const legacy = exercise(); delete legacy.setDetails; legacy.sets = 3;
  assert.equal(analytics([log('legacy', '2026-11-01', [legacy])]).volume, 2400);
});
test('PRs use lifetime baselines outside range, equal values are not new records', () => {
  const data = analytics([
    log('base', '2026-09-01', [exercise(100, 8)]), log('equal', '2026-11-01', [exercise(100, 8)]),
    log('new', '2026-11-02', [exercise(110, 8)]), log('newer', '2026-11-03', [exercise(120, 8)]),
  ]);
  assert.equal(data.recordsAchieved, 4);
  assert.equal(data.recordsAchieved, data.improvements.length);
  assert.equal(new Set(data.improvements.map(record => record.key)).size, data.recordsAchieved);
  assert.ok(data.improvements.every(record => ['new', 'newer'].includes(record.workoutId) && record.improved));
  assert.equal(data.lifetimeBests.find(record => record.kind === 'reps').workoutId, 'base');
  const first = analytics([log('base', '2026-11-01')]);
  assert.equal(first.recordsAchieved, 0);
  assert.equal(first.lifetimeBests.length, 3);
  assert.ok(first.lifetimeBests.every(record => !record.improved));
});

test('a higher estimated 1RM remains a strength statistic and does not earn a PR', () => {
  const baseline = exercise(100, 1);
  baseline.sets = 2;
  baseline.setDetails.push({ weight: 70, reps: 10 });
  const data = analytics([log('base', '2026-11-09', [baseline]), log('latest', '2026-11-10', [exercise(95, 5)])]);
  assert.ok(data.points[1].estimatedMax > data.points[0].estimatedMax);
  assert.ok(data.lifts[0].metrics.includes('estimatedMax'));
  assert.equal(data.recordsAchieved, 0);
  assert.deepEqual(Array.from(data.lifetimeBests, record => record.kind).sort(), ['reps', 'volume', 'weight']);
});
test('bodyweight reps count; zero-load sets do not invent strength or volume', () => {
  const custom = exercise(0, 12, 'lb', 'Custom movement');
  custom.sets = 2;
  custom.setDetails.push({ weight: 10, reps: 8 });
  const [mixed] = analytics([log('mixed', '2026-11-01', [custom])]).points;
  assert.equal(mixed.bodyweightSets, 1);
  assert.equal(mixed.bodyweightReps, 12);
  assert.equal(mixed.volume, 80);
  const raises = analytics([log('raises', '2026-11-01', [
    exercise(0, 12, 'lb', 'Hanging Leg Raises'),
    exercise(0, 8, 'lb', 'Bench Press'),
  ])]);
  assert.equal(raises.points.find(point => point.name === 'Hanging Leg Raises').bodyweight, true);
  assert.equal(raises.points.find(point => point.name === 'Bench Press').bodyweight, false);
  assert.equal(raises.points.find(point => point.name === 'Hanging Leg Raises').totalReps, 12);
  const data = analytics([log('bw', '2026-11-01', [exercise(0, 5, 'lb', 'Pull-up')])]);
  assert.equal(data.volume, 0);
  assert.equal(data.hasVolume, true);
  assert.equal(data.points[0].estimatedMax, null);
  assert.equal(data.points[0].bodyweight, true);
  assert.equal(data.points[0].reps, 5);
  assert.equal(data.points[0].source.reps.weight, 0);
  assert.equal(data.lifetimeBests.length, 1);
  assert.equal(data.lifetimeBests[0].kind, 'reps');
  const added = analytics([log('added', '2026-11-03', [exercise(25, 5, 'lb', 'Pull-up')])]);
  assert.ok(added.lifts[0].metrics.includes('weight'));
  assert.equal(added.volume, 125);
  const assisted = analytics([log('assisted', '2026-11-04', [exercise(25, 5, 'lb', 'Assisted pull-up')])]);
  assert.equal(assisted.hasVolume, false);
  assert.equal(assisted.points[0].weight, null);
});
test('streaks use unique calendar days and allow today to remain a rest day', () => {
  const days = ['2026-11-01', '2026-11-02', '2026-11-02', '2026-11-08', '2026-11-09'];
  const streaks = activityStreaks(days, '2026-11-10');
  assert.equal(streaks.current, 2); assert.equal(streaks.longest, 2);
  assert.equal(activityStreaks(days, '2026-11-11').current, 0);
  const data = analytics(days.map((date, i) => log(String(i), date)), { range: 7 });
  assert.equal(data.selected.length, 2); assert.equal(data.frequency, 2); assert.equal(data.activity.size, 2);
});
test('previous periods and deterministic insights use actual load and are not fabricated from no history', () => {
  const data = analytics([log('prior', '2026-10-01', [exercise(100, 5)]), log('start', '2026-10-15', [exercise(100, 5)]), log('latest', '2026-11-10', [exercise(110, 5)])]);
  assert.equal(data.previousWorkouts, 1); assert.equal(data.previousVolume, 500); assert.equal(data.volume, 1050);
  assert.ok(data.insights.some(text => text.includes('110%'))); assert.ok(data.insights.some(text => text.includes('10%')));
  const empty = analytics([]); assert.equal(empty.insights.length, 0); assert.equal(empty.improvements.length, 0); assert.equal(empty.frequency, 0);
});
test('all-time weekly rendering is bounded while totals preserve older history', () => {
  const data = analytics([log('old', '2020-01-01'), log('now', '2026-11-10')], { range: 'all' });
  assert.equal(data.weeks.length, 12); assert.equal(data.selected.length, 2); assert.equal(data.volume, 1600);
  assert.ok(!data.insights.some(text => text.includes('previous')));
  assert.equal(data.bounds.end, '2026-11-10');
});

test('90-day weeks reconcile to exact totals and keep workout days distinct from sessions', () => {
  const data = analytics([
    log('oldest', '2026-08-13', [exercise(50, 5, 'kg')]),
    log('one', '2026-11-09', [exercise(40, 8)]),
    log('two', '2026-11-09', [exercise(75, 8)]),
    log('three', '2026-11-10', []),
  ], { range: 90 });
  assert.ok(Math.abs(data.weeks.reduce((sum, week) => sum + week.volume, 0) - data.volume) < 1e-9);
  assert.equal(data.weeks[0].partial, true);
  assert.equal(data.weeks.at(-1).partial, true);
  assert.equal(data.weeks.at(-1).count, 2);
  assert.equal(data.weeks.at(-1).sessions, 3);
  assert.equal(data.currentWeek.days, 2);
  assert.equal(data.activity.get('2026-11-09').length, 2);
  assert.equal(data.hasPreviousVolume, false);
});

test('an older catalog lift stays identifiable when the selected range has no matching sessions', () => {
  const history = [log('bench', '2026-11-01', [exercise()]), log('pull', '2026-11-10', [exercise(0, 5, 'lb', 'Pull-up')])];
  const bench = analytics(history).lifts.find(lift => lift.name === 'Bench press');
  const recent = analytics(history, { range: 7 });
  assert.equal(recent.lifts.find(lift => lift.id === bench.id).name, 'Bench press');
  assert.equal(recent.scopedLiftIds.has(bench.id), false);
});
