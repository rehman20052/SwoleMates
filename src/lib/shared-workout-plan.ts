import type { DraftExercise } from "./workout-drafts";
import { draftSets, exerciseName } from "./workout-logging";

// Share only exercise names and targets, never personal performance or notes.
export function sharedExercises(rows: DraftExercise[]) {
  return rows.map(row => {
    const sets = draftSets(row);
    const name = exerciseName(row);
    const reps = Number(sets[0].reps || row.reps || 8);
    if (!name || name.length > 100 || !Number.isInteger(reps) || reps < 1 || reps > 100) throw new Error("Choose a routine with named exercises and target reps from 1 to 100.");
    return { name, sets: sets.length, reps };
  });
}

export type RoutinePlan = { title: string; exercises: { name: string; sets: number; reps: number }[] };
export function parseRoutine(value: unknown): RoutinePlan | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as RoutinePlan;
  if (typeof v.title !== 'string' || !v.title.trim() || v.title.length > 100 || !Array.isArray(v.exercises) || !v.exercises.length || v.exercises.length > 30) return null;
  if (!v.exercises.every(e => e && typeof e.name === 'string' && !!e.name.trim() && e.name.length <= 100 && Number.isInteger(e.sets) && e.sets >= 1 && e.sets <= 100 && Number.isInteger(e.reps) && e.reps >= 1 && e.reps <= 100)) return null;
  return { title: v.title, exercises: v.exercises.map(e => ({ name: e.name, sets: e.sets, reps: e.reps })) };
}
