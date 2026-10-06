export type DraftSet = { reps: string; weight: string };
export type DraftExercise = { id: string; exercise: string; customName: string; sets: string; reps: string; weight: string; unit: "lb" | "kg"; restSeconds?: string; setValues?: DraftSet[] };
export type WorkoutDraft = { title: string; notes: string; rows: DraftExercise[]; recordId?: string; activeExercise?: number };
export function parseWorkoutDraft(content: string): WorkoutDraft | null {
  try {
    const value = JSON.parse(content);
    if (!value || typeof value.title !== "string" || value.title.length > 100 || typeof value.notes !== "string" || value.notes.length > 10000 || !Array.isArray(value.rows) || value.rows.length > 30) return null;
    if (value.activeExercise !== undefined && (!Number.isInteger(value.activeExercise) || value.activeExercise < 0 || value.activeExercise >= Math.max(1, value.rows.length))) return null;
    if (!value.rows.every((row: DraftExercise) => row && [row.id, row.exercise, row.customName, row.sets, row.reps, row.weight].every(field => typeof field === "string" && field.length <= 200) && (row.restSeconds === undefined || typeof row.restSeconds === "string" && row.restSeconds.length <= 20) && ["lb", "kg"].includes(row.unit) && (row.setValues === undefined || Array.isArray(row.setValues) && row.setValues.length <= 100 && row.setValues.every(set => set && typeof set.reps === "string" && typeof set.weight === "string")))) return null;
    if (new Set(value.rows.map((row: DraftExercise) => row.id)).size !== value.rows.length) return null;
    return value;
  } catch { return null; }
}
export const starterWorkoutPlans = [
  { title: "Push", exercises: ["Bench press", "Overhead press", "Lateral raise", "Triceps pushdown"] },
  { title: "Pull", exercises: ["Lat pulldown", "Seated cable row", "Face pull", "Biceps curl"] },
  { title: "Legs", exercises: ["Barbell squat", "Romanian deadlift", "Leg curl", "Calf raise"] },
];
