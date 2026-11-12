import type { AccountSetting } from './account-app-data';
import { exerciseMuscleCatalog } from './exercise-muscle-catalog';
import { exerciseKey } from './workout-logging';
import { isWorkoutExercise, type WorkoutExercise } from './workout-session';

export const muscleGroups = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Core',
  'Glutes', 'Quads', 'Hamstrings', 'Calves', 'Adductors', 'Lower back',
] as const;
export type MuscleGroup = typeof muscleGroups[number];
export type MuscleClassifications = ReadonlyMap<string, { name: string; groups: MuscleGroup[] }>;
const prefix = 'preference:exercise-muscles:';
export const muscleSettingId = (name: string) => prefix + exerciseKey(name);

const catalog = new Map(exerciseMuscleCatalog.map(([key, groups]) => [key, groups.split('|') as MuscleGroup[]]));
// App defaults and commonly logged variants whose names differ from the source catalog.
const common: Record<string, MuscleGroup[]> = {
  'barbell squat': ['Quads', 'Glutes'], 'bench press': ['Chest'],
  deadlift: ['Glutes', 'Hamstrings', 'Lower back'], 'romanian deadlift': ['Hamstrings', 'Glutes'],
  'overhead press': ['Shoulders'], 'incline bench press': ['Chest'], 'dumbbell bench press': ['Chest'],
  'dumbbell shoulder press': ['Shoulders'], 'barbell row': ['Back'], 'dumbbell row': ['Back'],
  'seated cable row': ['Back'], 'lat pulldown': ['Back'], 'pull-up': ['Back'], 'chin-up': ['Back'],
  'leg press': ['Quads', 'Glutes'], 'hack squat': ['Quads'], 'front squat': ['Quads'],
  'bulgarian split squat': ['Quads', 'Glutes'], lunge: ['Quads', 'Glutes'],
  'leg extension': ['Quads'], 'leg curl': ['Hamstrings'], 'hip thrust': ['Glutes'],
  'calf raise': ['Calves'], 'biceps curl': ['Biceps'], 'hammer curl': ['Biceps'],
  'preacher curl': ['Biceps'], 'triceps pushdown': ['Triceps'], 'triceps extension': ['Triceps'],
  'lateral raise': ['Shoulders'], 'rear delt fly': ['Shoulders'], 'face pull': ['Shoulders', 'Back'],
  'chest fly': ['Chest'], 'cable fly': ['Chest'], dip: ['Chest', 'Triceps'],
  'push-up': ['Chest'], 'cable crunch': ['Core'], shrug: ['Back'],
  'good morning': ['Hamstrings', 'Glutes', 'Lower back'], 'sumo deadlift': ['Glutes', 'Quads', 'Adductors'],
  'bayesian curl': ['Biceps'], 'seated cable chest fly': ['Chest'],
  'high-incline smith machine press': ['Shoulders', 'Chest'],
};
for (const [key, groups] of Object.entries(common)) catalog.set(key, groups);

export function savedMuscleClassifications(settings: readonly AccountSetting[]): MuscleClassifications {
  const classifications = new Map<string, { name: string; groups: MuscleGroup[] }>();
  for (const setting of settings) {
    if (!setting.id.startsWith(prefix) || typeof setting.value !== 'object' || !setting.value) continue;
    try {
      const { name, groups } = JSON.parse(setting.value.content);
      if (typeof name !== 'string' || !name.trim() || name.length > 100 || muscleSettingId(name) !== setting.id) continue;
      if (!Array.isArray(groups) || !groups.length || groups.length > muscleGroups.length ||
        !groups.every(group => muscleGroups.includes(group))) continue;
      classifications.set(exerciseKey(name), { name, groups: [...new Set<MuscleGroup>(groups)] });
    } catch { /* An invalid preference does not affect other exercises. */ }
  }
  return classifications;
}

export function exerciseMuscles(name: string, saved: MuscleClassifications): readonly MuscleGroup[] {
  const key = exerciseKey(name);
  return saved.get(key)?.groups ?? catalog.get(key) ?? [];
}

export function muscleBalance(logs: readonly { exercises?: WorkoutExercise[] }[], saved: MuscleClassifications) {
  const distribution = new Map<MuscleGroup, number>();
  const contributions = new Map<MuscleGroup, Map<string, { name: string; sets: number }>>();
  const unclassified = new Map<string, { name: string; sets: number }>();
  let totalSets = 0;
  let classifiedSets = 0;
  for (const log of logs) {
    for (const exercise of log.exercises ?? []) {
      if (!isWorkoutExercise(exercise)) continue;
      totalSets += exercise.sets;
      const groups = exerciseMuscles(exercise.name, saved);
      if (!groups.length) {
        const key = exerciseKey(exercise.name);
        const row = unclassified.get(key) ?? { name: exercise.name, sets: 0 };
        row.sets += exercise.sets;
        unclassified.set(key, row);
        continue;
      }
      classifiedSets += exercise.sets;
      for (const group of groups) {
        const sets = exercise.sets / groups.length;
        distribution.set(group, (distribution.get(group) ?? 0) + sets);
        const exercises = contributions.get(group) ?? new Map();
        const key = exerciseKey(exercise.name);
        exercises.set(key, { name: exercise.name, sets: (exercises.get(key)?.sets ?? 0) + sets });
        contributions.set(group, exercises);
      }
    }
  }
  return {
    totalSets,
    classifiedSets,
    contributions,
    groups: [...distribution].map(([group, sets]) => ({ group, sets })).sort((a, b) => b.sets - a.sets),
    unclassified: [...unclassified.values()].sort((a, b) => b.sets - a.sets),
  };
}
