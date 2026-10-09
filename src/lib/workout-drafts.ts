export type DraftSet = { reps: string; weight: string; completed?: boolean };
export type DraftExercise = { id: string; exercise: string; customName: string; sets: string; reps: string; weight: string; unit: "lb" | "kg"; restSeconds?: string; setValues?: DraftSet[] };
export type WorkoutDraft = { title: string; notes: string; rows: DraftExercise[]; durationMinutes?: number; workoutOrigin?: "manual" | "template"; sourceTemplateId?: string; recordId?: string; activeExercise?: number; workoutDate?: string; started?: boolean };
export function uniqueWorkoutTemplates<T extends WorkoutDraft>(templates: T[]): T[] {
  const seen = new Set<string>();
  return templates.filter(template => {
    const key = JSON.stringify([template.title.trim().toLowerCase(), template.durationMinutes ?? 45, template.rows.map(row => [
      (row.exercise === "Other" ? row.customName : row.exercise).trim().toLowerCase(), row.unit,
      row.setValues?.length ? row.setValues.map(set => [Number(set.reps), Number(set.weight)]) : Array.from({ length: Math.min(100, Math.max(1, Number(row.sets) || 1)) }, () => [Number(row.reps), Number(row.weight)])
    ])]);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
export function parseWorkoutDraft(content: string): WorkoutDraft | null {
  try {
    const value = JSON.parse(content);
    if (!value || typeof value.title !== "string" || value.title.length > 100 || typeof value.notes !== "string" || value.notes.length > 10000 || !Array.isArray(value.rows) || value.rows.length > 30) return null;
    if (value.activeExercise !== undefined && (!Number.isInteger(value.activeExercise) || value.activeExercise < 0 || value.activeExercise >= Math.max(1, value.rows.length))) return null;
    if (value.recordId !== undefined && (typeof value.recordId !== "string" || !value.recordId.length || value.recordId.length > 100)) return null;
    if (value.workoutDate !== undefined && (typeof value.workoutDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.workoutDate) || Number.isNaN(Date.parse(value.workoutDate)))) return null;
    if (value.sourceTemplateId !== undefined && (typeof value.sourceTemplateId !== "string" || !value.sourceTemplateId.length || value.sourceTemplateId.length > 200)) return null;
    if (value.workoutOrigin !== undefined && !["manual", "template"].includes(value.workoutOrigin)) return null;
    if (value.started !== undefined && typeof value.started !== "boolean") return null;
    if (value.durationMinutes !== undefined && (!Number.isInteger(value.durationMinutes) || value.durationMinutes < 1 || value.durationMinutes > 1440)) return null;
    if (!value.rows.every((row: DraftExercise) => row && [row.id, row.exercise, row.customName, row.sets, row.reps, row.weight].every(field => typeof field === "string" && field.length <= 200) && (row.restSeconds === undefined || typeof row.restSeconds === "string" && row.restSeconds.length <= 20) && ["lb", "kg"].includes(row.unit) && (row.setValues === undefined || Array.isArray(row.setValues) && row.setValues.length <= 100 && row.setValues.every(set => set && typeof set.reps === "string" && typeof set.weight === "string")))) return null;
    if (new Set(value.rows.map((row: DraftExercise) => row.id)).size !== value.rows.length) return null;
    if (value.rows.some((row: DraftExercise) => row.setValues?.some(set => set.completed !== undefined && typeof set.completed !== "boolean"))) return null;
    return value;
  } catch { return null; }
}
export const starterWorkoutPlans = [
  { title: "Push", exercises: ["Bench press", "Overhead press", "Lateral raise", "Triceps pushdown"] },
  { title: "Pull", exercises: ["Lat pulldown", "Seated cable row", "Face pull", "Biceps curl"] },
  { title: "Legs", exercises: ["Barbell squat", "Romanian deadlift", "Leg curl", "Calf raise"] },
];
