import type { SessionLog } from '../state/app-data';
import { convertWeight, type WeightUnit } from './weight-unit';
import { isWorkoutExercise } from './workout-session';
import { catalogLiftArtwork, normalizeExerciseName } from './lift-artwork';
import { exerciseKey } from './workout-logging';

export type AnalyticsRange = 7 | 30 | 90 | 'all';
export type StrengthMetric = 'estimatedMax' | 'weight' | 'volume' | 'reps';
type SourceSet = { rowId: string; setIndex: number; weight: number; reps: number };
export type StrengthPoint = {
  id: string; exerciseId: string; workoutId: string; date: string; name: string;
  weight: number | null; estimatedMax: number | null; volume: number | null; reps: number;
  sets: number; totalReps: number; bodyweight: boolean;
  bodyweightSets: number; bodyweightReps: number;
  source: Partial<Record<StrengthMetric, SourceSet>>;
};
export type AnalyticsRecord = {
  key: string; exerciseId: string; exercise: string; kind: Exclude<StrengthMetric, 'estimatedMax'>; value: number;
  date: string; improved: boolean; workoutId: string; source?: SourceSet; previous?: number;
};
export const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const dayDate = (day: string) => new Date(`${day}T12:00:00`);
export function shiftDay(day: string, offset: number) {
  const date = dayDate(day);
  date.setDate(date.getDate() + offset);
  return localDay(date);
}
const validDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(dayDate(day).getTime()) && localDay(dayDate(day)) === day;
export const analyticsExerciseKey = exerciseKey;

// Saved exercise row IDs are local to a workout. Use the catalog ID when known and
// the app's normalized name key for custom lifts. Keep assisted/weighted variants distinct.
export function analyticsExerciseId(name: string) {
  const entry = catalogLiftArtwork(name);
  const variant = normalizeExerciseName(name).match(/\b(assisted|weighted)\b/)?.[0];
  return entry ? `catalog:${entry.id}${variant ? ':' + variant : ''}` : `custom:${exerciseKey(name)}`;
}

function isBodyweight(name: string) {
  const equipment = catalogLiftArtwork(name)?.equipment ?? [];
  return equipment.some(item => item.toLowerCase().includes('bodyweight')) ||
    /^(?:(?:weighted|assisted) )?(?:pull up|chin up|push up|dips?|sit ups?|plank|hanging (?:leg|knee) raises?)(?: |$)/.test(normalizeExerciseName(name));
}

const beats = (value: number, previous: number) => value > previous && (value - previous) / Math.max(value, previous) > 1e-9;

export function estimatedOneRepMax(name: string, weight: number, reps: number) {
  if (isBodyweight(name) || /\bassisted\b/i.test(name) || !Number.isFinite(weight) || weight <= 0 ||
    !Number.isInteger(reps) || reps < 1 || reps > 100) return null;
  // Epley, capped at 10 reps for higher-rep sets. A logged single uses its actual load.
  return reps === 1 ? weight : weight * (1 + Math.min(reps, 10) / 30);
}

export function repWeightProfile(logs: SessionLog[], name: string, unit: WeightUnit) {
  const id = analyticsExerciseId(name);
  const bestByReps = new Map<number, SourceSet & { date: string; workoutId: string }>();
  let basis: (SourceSet & { date: string; workoutId: string; estimate: number }) | undefined;
  for (const log of logs) {
    for (const row of log.exercises ?? []) {
      if (!isWorkoutExercise(row) || analyticsExerciseId(row.name) !== id) continue;
      const sets = row.setDetails ?? [{ reps: row.reps, weight: row.weight }];
      sets.forEach((set, setIndex) => {
        const weight = convertWeight(set.weight, row.unit, unit);
        if (weight <= 0) return;
        const candidate = { reps: set.reps, weight, date: log.date, workoutId: log.id, rowId: row.id, setIndex };
        const best = bestByReps.get(set.reps);
        if (!best || beats(weight, best.weight)) bestByReps.set(set.reps, candidate);
        const estimate = estimatedOneRepMax(row.name, weight, set.reps);
        if (estimate !== null && (!basis || beats(estimate, basis.estimate))) basis = { ...candidate, estimate };
      });
    }
  }
  const points = [...bestByReps.values()].sort((a, b) => a.reps - b.reps);
  if (!basis) return { points, attempt: null };
  const plateIncrement = unit === 'lb' ? 5 : 2.5;
  const increment = basis.estimate >= plateIncrement * 20 ? plateIncrement : basis.estimate >= 20 ? 1 : 0.1;
  const low = Math.floor(basis.estimate * 0.95 / increment) * increment;
  const high = Math.floor(basis.estimate / increment) * increment;
  return { points, attempt: high > low && low > 0 ? { low, high, basis } :
    { low: basis.estimate * 0.95, high: basis.estimate, basis } };
}

export function completedAnalyticsLogs(logs: SessionLog[], deleted: string[], today: string) {
  const hidden = new Set(deleted), seen = new Set<string>();
  return logs.filter(log => {
    const key = log.plannedWorkoutId ? `planned:${log.plannedWorkoutId}` : log.id;
    if (hidden.has(key) || hidden.has(log.id) || seen.has(key) || !validDay(log.date) || log.date > today) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date) || (a.loggedAt ?? '').localeCompare(b.loggedAt ?? '') || a.id.localeCompare(b.id));
}

export function strengthSessions(logs: SessionLog[], unit: WeightUnit): StrengthPoint[] {
  return logs.flatMap(log => {
    const groups = new Map<string, StrengthPoint>();
    for (const row of log.exercises ?? []) {
      if (!isWorkoutExercise(row)) continue;
      const exerciseId = analyticsExerciseId(row.name);
      const point = groups.get(exerciseId) ?? {
        id: `${log.id}:${exerciseId}`, exerciseId, workoutId: log.id, date: log.date, name: row.name.trim(),
        weight: null, estimatedMax: null, volume: null, reps: 0, sets: 0, totalReps: 0, bodyweight: isBodyweight(row.name),
        bodyweightSets: 0, bodyweightReps: 0, source: {},
      };
      const sets = row.setDetails ?? Array.from({ length: row.sets }, () => ({ reps: row.reps, weight: row.weight }));
      const assisted = /\bassisted\b/i.test(row.name);
      sets.forEach((set, setIndex) => {
        const weight = convertWeight(set.weight, row.unit, unit);
        const source = { rowId: row.id, setIndex, weight, reps: set.reps };
        if (!assisted && (point.weight === null || beats(weight, point.weight))) { point.weight = weight; point.source.weight = source; }
        if (set.reps > point.reps) { point.reps = set.reps; point.source.reps = source; }
        const estimate = estimatedOneRepMax(row.name, weight, set.reps);
        if (estimate !== null && (point.estimatedMax === null || beats(estimate, point.estimatedMax))) {
          point.estimatedMax = estimate;
          point.source.estimatedMax = source;
        }
        if (!assisted) point.volume = (point.volume ?? 0) + weight * set.reps;
        point.sets++;
        point.totalReps += set.reps;
        // The workout logger uses zero to record a set without added weight.
        if (point.bodyweight || (!assisted && set.weight === 0)) {
          point.bodyweightSets++;
          point.bodyweightReps += set.reps;
        }
      });
      groups.set(exerciseId, point);
    }
    return [...groups.values()];
  });
}

export function defaultAnalyticsLift(points: StrengthPoint[]) {
  const counts = new Map<string, number>();
  let latestProgression: StrengthPoint | undefined;
  for (const point of points) {
    const count = (counts.get(point.exerciseId) ?? 0) + 1;
    counts.set(point.exerciseId, count);
    if (count >= 2) latestProgression = point;
  }
  return latestProgression ?? points.at(-1);
}

export function exerciseWorkload(points: StrengthPoint[], week?: { start: string; end: string }) {
  const totals = new Map<string, { name: string; volume: number; sets: number; reps: number }>();
  for (const point of points) {
    if (week && (point.date < week.start || point.date > week.end)) continue;
    const row = totals.get(point.exerciseId) ?? { name: point.name, volume: 0, sets: 0, reps: 0 };
    row.volume += point.volume ?? 0;
    row.sets += point.bodyweightSets;
    row.reps += point.bodyweightReps;
    totals.set(point.exerciseId, row);
  }
  return [...totals.values()].sort((a, b) => b.volume - a.volume || a.name.localeCompare(b.name));
}

function dateParts(day: string): [number, number, number] {
  const [year, month, date] = day.split('-').map(Number);
  return [year, month - 1, date];
}
export const dayNumber = (day: string) => Date.UTC(...dateParts(day)) / 86400000;
export const weekStart = (day: string) => shiftDay(day, -((dayDate(day).getDay() + 6) % 7));
export function periodBounds(range: AnalyticsRange, today: string, firstDay?: string, lastDay = today) {
  const start = range === 'all' ? firstDay ?? today : shiftDay(today, 1 - range);
  const end = range === 'all' ? lastDay : today;
  const days = dayNumber(end) - dayNumber(start) + 1;
  return { start, end, days, previousStart: shiftDay(start, -days), previousEnd: shiftDay(start, -1) };
}

export function activityStreaks(days: string[], today: string) {
  const unique = [...new Set(days)].sort(), active = new Set(unique);
  let longest = 0, run = 0, previous = '';
  for (const day of unique) {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  let cursor = active.has(today) ? today : shiftDay(today, -1), current = 0;
  while (active.has(cursor)) { current++; cursor = shiftDay(cursor, -1); }
  return { current, longest };
}
export function percentageChange(current: number, previous: number) {
  return previous > 0 ? (current - previous) / previous * 100 : null;
}

type AnalyticsHistoryInput = { logs: SessionLog[]; deleted?: string[]; unit: WeightUnit; today: string };

export function prepareAnalyticsHistory(input: AnalyticsHistoryInput) {
  const logs = completedAnalyticsLogs(input.logs, input.deleted ?? [], input.today);
  return { logs, allPoints: strengthSessions(logs, input.unit), today: input.today };
}

export function summarizeWorkoutAnalytics({ logs, allPoints, today }: ReturnType<typeof prepareAnalyticsHistory>, range: AnalyticsRange) {
  const bounds = periodBounds(range, today, logs[0]?.date, logs.at(-1)?.date);
  const inside = (day: string) => day >= bounds.start && day <= bounds.end;
  const prior = (day: string) => range !== 'all' && day >= bounds.previousStart && day <= bounds.previousEnd;
  const selected = logs.filter(log => inside(log.date)), previous = logs.filter(log => prior(log.date));
  const points = allPoints.filter(point => inside(point.date));
  const lifts = new Map<string, { id: string; name: string; bodyweight: boolean; metrics: StrengthMetric[] }>();
  const best = new Map<string, AnalyticsRecord>(), improvements: AnalyticsRecord[] = [];
  const kinds: StrengthMetric[] = ['weight', 'estimatedMax', 'volume', 'reps'];
  for (const point of allPoints) {
    const lift = lifts.get(point.exerciseId) ?? { id: point.exerciseId, name: point.name, bodyweight: point.bodyweight, metrics: ['reps'] as StrengthMetric[] };
    lift.name = point.name;
    lifts.set(lift.id, lift);
    for (const kind of kinds) {
      const value = point[kind];
      if (value === null) continue;
      if ((value > 0 || kind === 'volume' || kind === 'weight' && !point.bodyweight) && !lift.metrics.includes(kind)) lift.metrics.push(kind);
      if (kind === 'estimatedMax' || value <= 0) continue;
      const key = `${point.exerciseId}:${kind}`, old = best.get(key);
      if (old && !beats(value, old.value)) continue;
      const record = { key, exerciseId: point.exerciseId, exercise: point.name, kind, value, date: point.date, improved: !!old,
        workoutId: point.workoutId, source: point.source[kind], previous: old?.value };
      best.set(key, record);
      if (old && inside(point.date)) improvements.push({ ...record, key: `${point.id}:${kind}` });
    }
  }
  const volume = points.reduce((sum, point) => sum + (point.volume ?? 0), 0);
  const previousPoints = allPoints.filter(point => point.volume !== null && prior(point.date));
  const previousVolume = previousPoints.reduce((sum, point) => sum + (point.volume ?? 0), 0);
  const activity = new Map<string, SessionLog[]>();
  for (const log of selected) {
    const day = activity.get(log.date) ?? [];
    day.push(log);
    activity.set(log.date, day);
  }
  const weekly = new Map<string, { sessions: number; count: number; volume: number; hasSets: boolean }>();
  const bucket = (date: string) => {
    const key = weekStart(date), week = weekly.get(key) ?? { sessions: 0, count: 0, volume: 0, hasSets: false };
    weekly.set(key, week);
    return week;
  };
  for (const [date, sessions] of activity) {
    const week = bucket(date);
    week.sessions += sessions.length;
    week.count++;
  }
  for (const point of points) {
    const week = bucket(point.date);
    if (point.volume !== null) { week.volume += point.volume; week.hasSets = true; }
  }
  const first = weekStart(bounds.start), last = weekStart(bounds.end);
  const cap = shiftDay(last, -77);
  const weeks = [];
  for (let date = range === 'all' && first < cap ? cap : first; date <= last; date = shiftDay(date, 7)) {
    const start = date < bounds.start ? bounds.start : date;
    const end = shiftDay(date, 6) > bounds.end ? bounds.end : shiftDay(date, 6);
    weeks.push({ date, start, end, partial: start !== date || end !== shiftDay(date, 6),
      ...(weekly.get(date) ?? { sessions: 0, count: 0, volume: 0, hasSets: false }) });
  }
  const week = weekStart(today);
  const currentWeekDays = new Set(logs.filter(log => log.date >= week).map(log => log.date)).size;
  const scopedLiftIds = new Set(points.map(point => point.exerciseId));
  const detailedWorkouts = new Set(points.map(point => point.workoutId)).size;
  const hasVolume = points.some(point => point.volume !== null);
  const insights: string[] = [];
  const loadChange = hasVolume && previousPoints.length ? percentageChange(volume, previousVolume) : null;
  if (loadChange !== null && Math.abs(loadChange) >= 1) insights.push(`Recorded-load volume ${loadChange > 0 ? 'rose' : 'fell'} ${Math.abs(loadChange).toFixed(0)}% vs the previous ${bounds.days} days.`);
  const estimates = new Map<string, { first: number; latest: number; name: string }>();
  for (const point of points) {
    if (point.estimatedMax === null) continue;
    const entry = estimates.get(point.exerciseId);
    if (entry) entry.latest = point.estimatedMax;
    else estimates.set(point.exerciseId, { first: point.estimatedMax, latest: point.estimatedMax, name: point.name });
  }
  for (const { name, first, latest } of estimates.values()) {
    const change = percentageChange(latest, first);
    if (change !== null && change >= 1) { insights.push(`${name} estimated 1RM rose ${change.toFixed(0)}% from the first to the latest qualifying session in this period.`); break; }
  }
  return {
    bounds, selected, logs, lifts: [...lifts.values()].sort((a, b) => a.name.localeCompare(b.name)), scopedLiftIds, points,
    improvements: improvements.reverse(), lifetimeBests: [...best.values()].sort((a, b) => a.exercise.localeCompare(b.exercise) || a.kind.localeCompare(b.kind)),
    recordsAchieved: improvements.length, volume, hasVolume, insights, previousVolume, hasPreviousVolume: previousPoints.length > 0, previousWorkouts: previous.length,
    activity, weeks, currentWeek: { start: week, end: shiftDay(week, 6), days: currentWeekDays },
    streaks: activityStreaks([...activity.keys()], today), frequency: activity.size / (bounds.days / 7), detailedWorkouts,
  };
}

export function buildWorkoutAnalytics(input: AnalyticsHistoryInput & { range: AnalyticsRange }) {
  return summarizeWorkoutAnalytics(prepareAnalyticsHistory(input), input.range);
}

