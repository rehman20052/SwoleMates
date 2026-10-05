export type DraftExercise = { id: string; exercise: string; customName: string; sets: string; reps: string; weight: string; unit: "lb" | "kg" };
export type WorkoutDraft = { title: string; notes: string; rows: DraftExercise[]; recordId?: string };
export function parseWorkoutDraft(content: string): WorkoutDraft | null {
  try {
    const value = JSON.parse(content);
    if (!value || typeof value.title !== "string" || value.title.length > 100 || typeof value.notes !== "string" || value.notes.length > 10000 || !Array.isArray(value.rows) || value.rows.length > 30) return null;
    if (!value.rows.every((row: DraftExercise) => row && [row.id, row.exercise, row.customName, row.sets, row.reps, row.weight].every(field => typeof field === "string" && field.length <= 200) && ["lb", "kg"].includes(row.unit))) return null;
    if (new Set(value.rows.map((row: DraftExercise) => row.id)).size !== value.rows.length) return null;
    return value;
  } catch { return null; }
}
export const starterWorkoutPlans = [
  { title: "Push", exercises: ["Bench press", "Overhead press", "Lateral raise", "Triceps pushdown"] },
  { title: "Pull", exercises: ["Lat pulldown", "Seated cable row", "Face pull", "Biceps curl"] },
  { title: "Legs", exercises: ["Barbell squat", "Romanian deadlift", "Leg curl", "Calf raise"] },
];
