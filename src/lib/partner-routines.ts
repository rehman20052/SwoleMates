import { supabase } from './supabase';
import { sharedExercises } from './shared-workout-plan';
import { parseWorkoutDraft } from './workout-drafts';

import { parseRoutine, type RoutinePlan } from './shared-workout-plan';
export { parseRoutine, type RoutinePlan } from './shared-workout-plan';
export type PartnerRoutine = RoutinePlan & { id: string; ownerId: string };
export function localRoutines(settings: { id: string; value: unknown }[], ownerId: string): PartnerRoutine[] {
  return settings.flatMap(item => {
    if (!item.id.startsWith('workout-plan:') || !item.value || typeof item.value !== 'object') return [];
    const draft = parseWorkoutDraft((item.value as { content: string }).content);
    if (!draft?.rows.length) return [];
    try { return [{ id: item.id, ownerId, title: draft.title, exercises: sharedExercises(draft.rows) }]; } catch { return []; }
  });
}
export async function listPartnerRoutines(partnerId: string): Promise<PartnerRoutine[]> {
  const { data, error } = await supabase.rpc('partner_workout_routines', { person: partnerId });
  if (error) throw new Error('Could not load your partner’s routines.');
  return (data ?? []).flatMap((row: { id: string; routine: unknown }) => {
    const plan = parseRoutine(row.routine);
    return plan ? [{ ...plan, id: row.id, ownerId: partnerId }] : [];
  });
}
