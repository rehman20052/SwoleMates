import type { TrackedLift } from "./lift-progression";
import { validWorkoutExercises, type WorkoutExercise } from "./workout-session";

type ProgressionLog = { id: string; date: string; exercises?: WorkoutExercise[] };

// Rebuild workout contributions, retaining manually entered progression and goals.
// Old records did not have provenance, so recognize their exact date/weight/reps once.
export function reconcileWorkoutLifts(current: TrackedLift[], logs: ProgressionLog[], previous: ProgressionLog[], changed: ProgressionLog) {
  const before = previous.find(log => log.id === changed.id);
  const names = [...(before?.exercises ?? []), ...(changed.exercises ?? [])].map(row => row.name);
  const seeded = progressLiftsFromWorkout(current, changed);
  return seeded.map(lift => {
    if (!names.some(name => matchTrackedLift(seeded, name)?.id === lift.id)) return lift;
    const contributions = (source: ProgressionLog[]) => source.flatMap(log => {
      if (!log.exercises?.length || !validWorkoutExercises(log.exercises)) return [];
      const sets = log.exercises.filter(row => matchTrackedLift(seeded, row.name)?.id === lift.id).flatMap(row => {
        const factor = row.unit === lift.unit ? 1 : lift.unit === "kg" ? 0.45359237 : 1 / 0.45359237;
        return (row.setDetails ?? [{ weight: row.weight, reps: row.reps }]).map(set => ({ ...set, weight: Math.round(set.weight * factor * 100) / 100 }));
      });
      if (!sets.length) return [];
      const weight = Math.max(...sets.map(set => set.weight));
      const reps = sets.filter(set => set.weight === weight).map(set => set.reps);
      return [{ date: log.date, weight, minReps: Math.min(...reps), maxReps: Math.max(...reps), workoutLogId: log.id }];
    });
    const legacy = contributions([...previous, ...logs]);
    const manual = lift.history.filter(entry => !entry.workoutLogId && !legacy.some(old => old.date === entry.date
      && Math.abs(old.weight - entry.weight) < 0.01 && old.minReps === entry.minReps && old.maxReps === entry.maxReps));
    const history = [...manual, ...contributions(logs)].sort((a, b) => a.date.localeCompare(b.date));
    const best = history.reduce<(typeof history)[number] | undefined>((best, entry) => !best || entry.weight >= best.weight ? entry : best, undefined);
    return { ...lift, history, currentWeight: best?.weight ?? 0, minReps: best?.minReps ?? lift.minReps, maxReps: best?.maxReps ?? lift.maxReps };
  });
}

export function liftNameKey(name: string) {
  return name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).sort().join(" ");
}

function oneTypo(a: string, b: string) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, differences = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++differences > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return differences + (a.length - i) + (b.length - j) <= 1;
}

function closeName(a: string, b: string) {
  const left = a.split(" "), right = b.split(" ");
  return left.length === right.length && left.filter((word, i) => word !== right[i]).length <= 1
    && left.every((word, i) => oneTypo(word, right[i]));
}

// Only an unambiguous match may update a lift. Equipment and variation words stay significant.
export function matchTrackedLift(lifts: TrackedLift[], name: string) {
  const key = liftNameKey(name);
  const exact = lifts.filter(lift => liftNameKey(lift.name) === key);
  if (exact.length) return exact.length === 1 ? exact[0] : undefined;
  const close = lifts.filter(lift => closeName(key, liftNameKey(lift.name)));
  return close.length === 1 ? close[0] : undefined;
}

export function workoutLiftGroups(lifts: TrackedLift[], logs: { title: string; workoutOrigin?: string; sourceTemplateId?: string; exercises?: WorkoutExercise[] }[], templates: { id: string; title: string }[]) {
  const groups = new Map<string, { id: string; title: string; liftIds: string[] }>();
  for (const log of logs) {
    if (log.workoutOrigin === "manual") continue;
    const template = log.sourceTemplateId ? templates.find(item => item.id === log.sourceTemplateId)
      : templates.find(item => item.title.trim().toLowerCase() === log.title.trim().toLowerCase());
    if (log.workoutOrigin !== "template" && !template) continue;
    const id = log.sourceTemplateId ?? template?.id ?? `template-title:${log.title.trim().toLowerCase()}`;
    const group = groups.get(id) ?? { id, title: template?.title ?? log.title, liftIds: [] };
    for (const exercise of log.exercises ?? []) {
      const lift = matchTrackedLift(lifts, exercise.name);
      if (lift && !group.liftIds.includes(lift.id)) group.liftIds.push(lift.id);
    }
    if (group.liftIds.length) groups.set(id, group);
  }
  return [...groups.values()];
}

export function progressLiftsFromWorkout(current: TrackedLift[], log: { date: string; exercises?: WorkoutExercise[] }) {
  if (!log.exercises?.length || !validWorkoutExercises(log.exercises)) return current;
  let next = current;
  for (const exercise of log.exercises) {
    const lift = matchTrackedLift(next, exercise.name);
    const key = liftNameKey(exercise.name);
    // Do not add another record when an existing name is ambiguous.
    if (!lift && next.some(item => closeName(key, liftNameKey(item.name)))) continue;
    const unit = lift?.unit ?? exercise.unit;
    const factor = unit === exercise.unit ? 1 : unit === "kg" ? 0.45359237 : 1 / 0.45359237;
    const sets = (exercise.setDetails ?? [{ weight: exercise.weight, reps: exercise.reps }])
      .map(set => ({ ...set, weight: Math.round(set.weight * factor * 100) / 100 }));
    const weight = Math.max(...sets.map(set => set.weight));
    if (lift && weight <= lift.currentWeight + 0.01) continue;
    const reps = sets.filter(set => set.weight === weight).map(set => set.reps);
    const entry = { date: log.date, weight, minReps: Math.min(...reps), maxReps: Math.max(...reps) };
    const updated: TrackedLift = lift
      ? { ...lift, currentWeight: weight, minReps: entry.minReps, maxReps: entry.maxReps, history: [...lift.history, entry].sort((a, b) => a.date.localeCompare(b.date)) }
      : { id: `lift-auto-${encodeURIComponent(key)}`, name: exercise.name.trim(), unit, currentWeight: weight,
        minReps: entry.minReps, maxReps: entry.maxReps, goalWeight: 0, history: [entry] };
    next = lift ? next.map(item => item.id === lift.id ? updated : item) : [...next, updated];
  }
  return next;
}
