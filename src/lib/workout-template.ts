import type { DraftExercise } from './workout-drafts';
import { exerciseName } from './workout-logging';

export function templateRepTarget(value: string) {
  const match = /^(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/.exec(value.trim());
  if (!match) return null;
  const min = Number(match[1]), max = Number(match[2] ?? match[1]);
  return min >= 1 && max <= 100 && max >= min ? { min, label: min === max ? String(min) : `${min}–${max}` } : null;
}

export function validTemplateRows(rows: DraftExercise[]) {
  return rows.length >= 1 && rows.length <= 30 && rows.every(row => exerciseName(row).length > 0
    && Number.isInteger(Number(row.sets)) && Number(row.sets) >= 1 && Number(row.sets) <= 100
    && !!templateRepTarget(row.repRange ?? row.reps));
}

export function normalizeTemplateRows(rows: DraftExercise[]): DraftExercise[] {
  return rows.map(row => {
    const target = templateRepTarget(row.repRange ?? row.reps)!;
    return { ...row, reps: String(target.min), repRange: target.label,
      setValues: row.setValues?.map(set => ({ ...set, completed: false })) };
  });
}
