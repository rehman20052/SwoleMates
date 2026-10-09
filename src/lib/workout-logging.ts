import type { DraftExercise, DraftSet } from "./workout-drafts";
import { validWorkoutExercises, type WorkoutExercise } from "./workout-session";

export type PerformanceLog = { id: string; date: string; loggedAt?: string; exercises?: WorkoutExercise[] };
export const exerciseName = (row: DraftExercise) => (row.exercise === "Other" ? row.customName : row.exercise === "Choose exercise" ? "" : row.exercise).trim();
export const exerciseKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
export function comparePerformanceLogs(a: { date: string; loggedAt?: string }, b: { date: string; loggedAt?: string }) {
  return b.date.localeCompare(a.date) || (b.loggedAt ?? "").localeCompare(a.loggedAt ?? "");
}
export const draftSets = (row: DraftExercise): DraftSet[] => row.setValues?.length ? row.setValues : Array.from({ length: Math.min(100, Math.max(1, Number(row.sets) || 1)) }, () => ({ reps: row.reps, weight: row.weight, completed: false }));
export function validDraftSet(set: DraftSet) {
  return !!set.reps.trim() && !!set.weight.trim() && Number.isInteger(Number(set.reps)) && Number(set.reps) >= 1 && Number(set.reps) <= 100 && Number.isFinite(Number(set.weight)) && Number(set.weight) >= 0;
}
export function performanceHistory<T extends PerformanceLog>(logs: T[], date: string, excludeId?: string): T[] {
  return logs.filter(log => log.id !== excludeId && log.date <= date && log.exercises?.length)
    .sort(comparePerformanceLogs);
}
export function lastPerformance(logs: PerformanceLog[], name: string) {
  return logs.flatMap(log => log.exercises ?? []).find(row => exerciseKey(row.name) === exerciseKey(name));
}
export function exerciseToDraft(row: WorkoutExercise, id: string, completed = false): DraftExercise {
  const sets = row.setDetails ?? Array.from({ length: row.sets }, () => ({ reps: row.reps, weight: row.weight }));
  return { id, exercise: row.name, customName: row.name, sets: String(sets.length), reps: String(row.reps), weight: String(row.weight), unit: row.unit,
    setValues: sets.map(set => ({ reps: String(set.reps), weight: String(set.weight), completed })) };
}
export function prefillExercise(row: DraftExercise, previous?: WorkoutExercise): DraftExercise {
  const last = previous ? exerciseToDraft(previous, row.id) : undefined;
  const count = Math.min(100, Math.max(1, Number(row.sets) || 3));
  const source = last ? draftSets(last) : draftSets(row);
  const sets = Array.from({ length: count }, (_, index) => ({ ...source[Math.min(index, source.length - 1)], completed: false }));
  return { ...row, unit: previous?.unit ?? row.unit, reps: sets[0].reps, weight: sets[0].weight, setValues: sets };
}
export function completedExercises(rows: DraftExercise[]): WorkoutExercise[] {
  return rows.flatMap(row => {
    const sets = draftSets(row).filter(set => set.completed);
    if (!sets.length) return [];
    return [{ id: row.id, name: exerciseName(row), sets: sets.length, reps: Number(sets[0].reps), weight: Number(sets[0].weight), unit: row.unit,
      setDetails: sets.map(set => ({ reps: Number(set.reps), weight: Number(set.weight) })) }];
  });
}
export function workoutStats(rows: DraftExercise[]) {
  const exercises = completedExercises(rows);
  const volume = { lb: 0, kg: 0 };
  for (const row of exercises) for (const set of row.setDetails ?? []) volume[row.unit] += set.reps * set.weight;
  return { exercises, sets: exercises.reduce((sum, row) => sum + row.sets, 0), plannedSets: rows.reduce((sum, row) => sum + draftSets(row).length, 0), volume };
}
export function volumeLabel(volume: { lb: number; kg: number }) {
  const parts = (["lb", "kg"] as const).filter(unit => volume[unit] > 0).map(unit => `${Math.round(volume[unit]).toLocaleString()} ${unit}`);
  return parts.join(" + ") || "0";
}
export function workoutRecords(exercises: WorkoutExercise[], history: PerformanceLog[]) {
  if (!validWorkoutExercises(exercises)) return [];
  return exercises.flatMap(row => {
    const prior = history.flatMap(log => log.exercises ?? []).filter(item => exerciseKey(item.name) === exerciseKey(row.name));
    if (!prior.length) return []; // A first session establishes a baseline.
    const normalized = (weight: number, unit: "lb" | "kg") => weight * (unit === "lb" ? 0.45359237 : 1);
    const previousSets = prior.flatMap(item => (item.setDetails ?? Array.from({ length: item.sets }, () => ({ reps: item.reps, weight: item.weight }))).map(set => ({ ...set, weight: normalized(set.weight, item.unit) })));
    const current = row.setDetails ?? [];
    const bestWeight = Math.max(...previousSets.map(set => set.weight));
    const heaviest = current.reduce((best, set) => set.weight > best.weight ? set : best, current[0]);
    if (heaviest && normalized(heaviest.weight, row.unit) > bestWeight + 0.01) return [`${row.name}: weight PR — ${heaviest.weight} ${row.unit} × ${heaviest.reps}`];
    const repRecords = current.filter(set => {
      const weight = normalized(set.weight, row.unit);
      const comparable = previousSets.filter(old => Math.abs(old.weight - weight) < 0.01);
      return comparable.length > 0 && set.reps > Math.max(...comparable.map(old => old.reps));
    });
    const best = repRecords.sort((a, b) => b.reps - a.reps)[0];
    return best ? [`${row.name}: rep PR — ${best.reps} at ${best.weight} ${row.unit}`] : [];
  });
}
