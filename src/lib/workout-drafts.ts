export type DraftSet = { reps: string; weight: string; completed?: boolean };
export type DraftExercise = { id: string; exercise: string; customName: string; sets: string; reps: string; weight: string; unit: "lb" | "kg"; repRange?: string; restSeconds?: string; setValues?: DraftSet[] };
export type WorkoutDraft = { title: string; notes: string; rows: DraftExercise[]; durationMinutes?: number; durationInput?: string; durationEdited?: boolean; hasUserInput?: boolean; inputVersion?: 1; workoutOrigin?: "manual" | "template"; sourceTemplateId?: string; recordId?: string; activeExercise?: number; workoutDate?: string; started?: boolean };

export function hasWorkoutDraftInput(draft: WorkoutDraft, templates: WorkoutDraft[] = []) {
  const content = !!(draft.title.trim() || draft.notes.trim() || draft.rows.some(row => (row.exercise === 'Other' ? row.customName : row.exercise === 'Choose exercise' ? '' : row.exercise).trim()) || (draft.durationInput?.trim() && (draft.durationEdited || draft.durationInput !== '45')) || (draft.durationMinutes !== undefined && draft.durationMinutes !== 45));
  if (draft.inputVersion === 1 && draft.hasUserInput !== undefined) return draft.hasUserInput && content;
  if (draft.started === false) return false;
  if (draft.workoutOrigin === 'template' && !draft.rows.some(row => row.setValues?.some(set => set.completed))) {
    const fingerprint = (value: WorkoutDraft) => JSON.stringify([value.title.trim(), value.notes.trim(), value.durationMinutes ?? 45, value.rows.map(row => [
      (row.exercise === 'Other' ? row.customName : row.exercise).trim().toLowerCase(), row.unit,
      (row.setValues?.length ? row.setValues : Array.from({ length: Math.min(100, Math.max(1, Number(row.sets) || 1)) }, () => ({ reps: row.reps, weight: row.weight }))).map(set => [set.reps.trim(), set.weight.trim()])
    ])]);
    if (templates.some(template => fingerprint(template) === fingerprint(draft))) return false;
  }
  if (draft.hasUserInput !== undefined) return draft.hasUserInput && content;
  // Legacy drafts had no input flag. Do not mistake an opened empty form or the
  // former Bench press example for user progress, even if started was set.
  const named = !!draft.title.trim() && !['workout', 'untitled workout'].includes(draft.title.trim().toLowerCase());
  if (named || draft.notes.trim() || (draft.durationMinutes !== undefined && draft.durationMinutes !== 45) || (draft.durationInput?.trim() && draft.durationInput !== '45')) return true;
  if (!draft.rows.length) return false;
  const row = draft.rows[0];
  const example = draft.rows.length === 1 && row.exercise === 'Bench press' && !row.customName && row.sets === '3' && row.reps === '8' && row.weight === '60' && row.unit === 'kg' && !row.setValues?.some(set => set.completed || set.reps !== '8' || set.weight !== '60');
  return !example && content;
}
export function uniqueWorkoutTemplates<T extends WorkoutDraft>(templates: T[]): T[] {
  const seen = new Set<string>();
  return templates.filter(template => {
    const key = JSON.stringify([template.title.trim().toLowerCase(), template.durationMinutes ?? 45, template.rows.map(row => [
      (row.exercise === "Other" ? row.customName : row.exercise).trim().toLowerCase(), row.unit, row.repRange ?? row.reps,
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
    if (value.hasUserInput !== undefined && typeof value.hasUserInput !== 'boolean') return null;
    if (value.inputVersion !== undefined && value.inputVersion !== 1) return null;
    if (value.durationEdited !== undefined && typeof value.durationEdited !== 'boolean') return null;
    if (value.durationInput !== undefined && (typeof value.durationInput !== 'string' || value.durationInput.length > 20)) return null;
    if (value.durationMinutes !== undefined && (!Number.isInteger(value.durationMinutes) || value.durationMinutes < 1 || value.durationMinutes > 1440)) return null;
    if (!value.rows.every((row: DraftExercise) => row && [row.id, row.exercise, row.customName, row.sets, row.reps, row.weight].every(field => typeof field === "string" && field.length <= 200) && (row.restSeconds === undefined || typeof row.restSeconds === "string" && row.restSeconds.length <= 20) && ["lb", "kg"].includes(row.unit) && (row.setValues === undefined || Array.isArray(row.setValues) && row.setValues.length <= 100 && row.setValues.every(set => set && typeof set.reps === "string" && typeof set.weight === "string")))) return null;
    if (new Set(value.rows.map((row: DraftExercise) => row.id)).size !== value.rows.length) return null;
    if (value.rows.some((row: DraftExercise) => row.repRange !== undefined && (typeof row.repRange !== 'string' || row.repRange.length > 20))) return null;
    if (value.rows.some((row: DraftExercise) => row.setValues?.some(set => set.completed !== undefined && typeof set.completed !== "boolean"))) return null;
    return value;
  } catch { return null; }
}
export const starterWorkoutPlans = [
  { title: "Push", exercises: ["Bench press", "Overhead press", "Lateral raise", "Triceps pushdown"] },
  { title: "Pull", exercises: ["Lat pulldown", "Seated cable row", "Face pull", "Biceps curl"] },
  { title: "Legs", exercises: ["Barbell squat", "Romanian deadlift", "Leg curl", "Calf raise"] },
];
