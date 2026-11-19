import { hasWorkoutDraftInput, parseWorkoutDraft } from './workout-drafts';

export type DraftRecord = { content: string; updatedAt: number };
export function partnerWorkoutHasProgress(local: DraftRecord | null, cloud: DraftRecord | null, finished = false) {
  if (finished) return false;
  const latest = local && (!cloud || local.updatedAt >= cloud.updatedAt) ? local : cloud;
  const draft = latest?.content ? parseWorkoutDraft(latest.content) : null;
  return !!draft && hasWorkoutDraftInput(draft);
}
