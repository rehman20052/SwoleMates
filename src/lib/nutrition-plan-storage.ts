import { createDurableList, type ListStorage } from "./durable-list";
import { calculateMacroPlan, parseNutritionProfile, type NutritionProfile } from "./macro-calculator";

export type NutritionGoals = {
  calorieGoal: number;
  proteinGoal: number;
  carbGoal: number;
  fatGoal: number;
};
export type SavedNutritionPlan = { goals: NutritionGoals; profile: NutritionProfile | null };
export const nutritionPlanStorageKey = "swolemates.nutrition-plan";

export function isNutritionGoals(value: unknown): value is NutritionGoals {
  if (!value || typeof value !== "object") return false;
  const goals = value as NutritionGoals;
  return [goals.calorieGoal, goals.proteinGoal, goals.carbGoal, goals.fatGoal]
    .every((number) => typeof number === "number" && Number.isFinite(number) && number >= 0)
    && goals.calorieGoal > 0;
}
export function goalsFromProfile(profile: NutritionProfile): NutritionGoals {
  const plan = calculateMacroPlan(profile);
  return { calorieGoal: plan.calories, proteinGoal: plan.protein, carbGoal: plan.carbs, fatGoal: plan.fat };
}
export function isSavedPlan(value: unknown): value is SavedNutritionPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as SavedNutritionPlan;
  return isNutritionGoals(plan.goals) && (plan.profile === null || parseNutritionProfile(plan.profile) !== null);
}
export function createNutritionPlanStore(storage: ListStorage) {
  const store = createDurableList(storage, nutritionPlanStorageKey, isSavedPlan);
  return {
    async load(legacyGoals: unknown, legacyProfile: unknown, defaults: NutritionGoals) {
      const profile = parseNutritionProfile(legacyProfile);
      const source = isNutritionGoals(legacyGoals) ? legacyGoals : profile ? goalsFromProfile(profile) : defaults;
      const goals = { calorieGoal: source.calorieGoal, proteinGoal: source.proteinGoal, carbGoal: source.carbGoal, fatGoal: source.fatGoal };
      const records = await store.load([{ goals, profile }]);
      if (records.length !== 1) throw new Error("Saved macro plan could not be read.");
      return records[0];
    },
    async change(edit: (current: SavedNutritionPlan) => SavedNutritionPlan) {
      const records = await store.change((current) => {
        if (current.length !== 1) throw new Error("Saved macro plan could not be read.");
        const next = edit(current[0]);
        if (!isSavedPlan(next)) throw new Error("Enter valid daily targets.");
        return [next];
      });
      return records[0];
    },
  };
}
