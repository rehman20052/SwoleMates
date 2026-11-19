type SplitTemplate = { id: string; title: string };
type WorkoutIdentity = { title: string; sourceTemplateId?: string };

export function matchesSplitTemplate(workout: WorkoutIdentity, template: SplitTemplate) {
  return workout.sourceTemplateId ? workout.sourceTemplateId === template.id : workout.title.trim().toLowerCase() === template.title.trim().toLowerCase();
}

// Weekly assignments stay tied to their calendar date. An extra session on a
// different day must not complete or shift a scheduled workout.
export function isSplitWorkoutCompleted(date: string, template: SplitTemplate, logs: (WorkoutIdentity & { date: string })[]) {
  return logs.some(log => log.date === date && matchesSplitTemplate(log, template));
}
