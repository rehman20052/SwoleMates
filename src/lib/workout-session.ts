export type WorkoutExercise = { id: string; name: string; sets: number; reps: number; weight: number; unit: "lb" | "kg" };

export function isWorkoutExercise(value: unknown): value is WorkoutExercise {
  if (!value || typeof value !== "object") return false;
  const row = value as WorkoutExercise;
  return typeof row.id === "string" && row.id.length > 0 && row.id.length <= 100
    && typeof row.name === "string" && row.name.trim().length > 0 && row.name.length <= 100
    && Number.isInteger(row.sets) && row.sets >= 1 && row.sets <= 100
    && Number.isInteger(row.reps) && row.reps >= 1 && row.reps <= 100
    && Number.isFinite(row.weight) && row.weight >= 0
    && (row.unit === "lb" || row.unit === "kg");
}

export function validWorkoutExercises(value: unknown): value is WorkoutExercise[] {
  return Array.isArray(value) && value.length <= 30 && value.every(isWorkoutExercise)
    && new Set(value.map(row => row.id)).size === value.length;
}

export function exerciseSummary(rows: WorkoutExercise[]) {
  return rows.map(row => `${row.name}: ${row.sets} × ${row.reps} at ${row.weight} ${row.unit}`).join("\n");
}
