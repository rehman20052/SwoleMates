import AsyncStorage from "@react-native-async-storage/async-storage";
import { accountList, mayImportLegacy } from "./account-sync";
import { isFoodEntry } from "./food-journal";
import { goalsFromProfile, isNutritionGoals, isSavedPlan, type NutritionGoals } from "./nutrition-plan-storage";
import { parseNutritionProfile } from "./macro-calculator";
import { workoutLogKey } from "./workout-log-sync";
import { isLift } from "./lift-progression";
import { validWorkoutExercises } from "./workout-session";
import type { SavedMeal, SessionLog } from "@/state/app-data";

export type AccountSetting = { id: string; value: number | { updatedAt: number; content: string } };
function isSetting(value: unknown): value is AccountSetting {
  if (!value || typeof value !== "object") return false;
  const item = value as AccountSetting;
  if (item.id === "weekly-workout-goal") return typeof item.value === "number" && Number.isInteger(item.value) && item.value >= 1 && item.value <= 7;
  return /^(draft|workout-plan|workout-split|favorite-food|nutrition-day):/.test(item.id) && typeof item.value === "object" && item.value !== null && Number.isFinite(item.value.updatedAt) && typeof item.value.content === "string" && item.value.content.length <= 50000;
}
function isRecipe(value: unknown): value is SavedMeal {
  return isFoodEntry({ ...(value as object), date: "2000-01-01" });
}
export function isWorkoutLog(value: unknown): value is SessionLog {
  if (!value || typeof value !== "object") return false;
  const log = value as SessionLog;
  return typeof log.id === "string" && typeof log.title === "string"
    && typeof log.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(log.date) && typeof log.verified === "boolean"
    && (log.exercises === undefined || validWorkoutExercises(log.exercises))
    && (log.durationMinutes === undefined || Number.isInteger(log.durationMinutes) && log.durationMinutes >= 1 && log.durationMinutes <= 1440);
}
export function createAccountStores(userId: string) {
  return {
    userId,
    recipes: accountList(userId, "recipes", (item: SavedMeal) => item.id, isRecipe),
    food: accountList(userId, "food", (item) => item.id, isFoodEntry),
    plan: accountList(userId, "nutrition_plan", () => "plan", isSavedPlan),
    logs: accountList(userId, "workout_logs", workoutLogKey, isWorkoutLog),
    deletions: accountList(userId, "workout_deletions", (item: string) => item, (value): value is string => typeof value === "string"),
    settings: accountList(userId, "settings", (item: AccountSetting) => item.id, isSetting),
    lifts: accountList(userId, "lifts", (item) => item.id, isLift),
  };
}
export async function loadAccountStores(stores: ReturnType<typeof createAccountStores>, defaults: NutritionGoals) {
  const namespaces = ["recipes", "food", "nutrition_plan", "workout_logs", "workout_deletions", "settings", "lifts"];
  const imported = await Promise.all(namespaces.map((namespace) => AsyncStorage.getItem(`swolemates.account-import.${stores.userId}.${namespace}`)));
  // Once migration is complete, obsolete browser data must not block cloud loading.
  if (imported.every(Boolean)) return refreshAccountStores(stores, defaults);
  const legacy = await mayImportLegacy(stores.userId);
  const read = async (key: string, fallback: unknown) => {
    if (!legacy) return fallback;
    const raw = await AsyncStorage.getItem(key); return raw === null ? fallback : JSON.parse(raw);
  };
  const dashboard = await read("swolemates.dashboard-state", {});
  if (!dashboard || typeof dashboard !== "object" || Array.isArray(dashboard)) throw new Error("Could not read legacy calendar data. Your stored data has been preserved.");
  const [legacyRecipes, legacyFood, legacyPlan, legacyDeleted, legacyGoal] = await Promise.all([
    read("swolemates.saved-recipes", dashboard.savedMeals ?? []),
    read("swolemates.food-journal", dashboard.foodEntries ?? []),
    read("swolemates.nutrition-plan", null),
    read("swolemates.deleted-workout-logs", dashboard.deletedWorkoutIds ?? []),
    read("swolemates.weekly-workout-goal", null),
  ]);
  if (!Array.isArray(legacyRecipes)) throw new Error("Could not read your recipes.");
  const profile = parseNutritionProfile(dashboard.nutritionProfile);
  const goals = isNutritionGoals(dashboard.nutrition) ? dashboard.nutrition : profile ? goalsFromProfile(profile) : defaults;
  const oldPlan = legacyPlan ?? [{ goals: { calorieGoal: goals.calorieGoal, proteinGoal: goals.proteinGoal, carbGoal: goals.carbGoal, fatGoal: goals.fatGoal }, profile }];
  const oldLiftRaw = await AsyncStorage.getItem(`swolemates.lift-progression.${stores.userId}`);
  const [recipes, foodEntries, plans, logs, deletedWorkoutIds, settings, lifts] = await Promise.all([
    stores.recipes.load(legacyRecipes.filter((item: SavedMeal) => !["saved-1", "saved-2", "saved-3"].includes(item.id))),
    stores.food.load(legacyFood), stores.plan.load(oldPlan), stores.logs.load(dashboard.logs ?? []),
    stores.deletions.load(legacyDeleted),
    stores.settings.load(isSetting({ id: "weekly-workout-goal", value: Number(legacyGoal) }) ? [{ id: "weekly-workout-goal", value: Number(legacyGoal) }] : []),
    stores.lifts.load(oldLiftRaw ? JSON.parse(oldLiftRaw) : []),
  ]);
  return { recipes, foodEntries, plan: plans[0] ?? { goals: defaults, profile: null }, logs, deletedWorkoutIds, weeklyWorkoutGoal: Number(settings.find(item => item.id === "weekly-workout-goal")?.value ?? 3), workspaceSettings: settings.filter(item => item.id !== "weekly-workout-goal"), lifts };
}
export async function refreshAccountStores(stores: ReturnType<typeof createAccountStores>, defaults: NutritionGoals) {
  const [recipes, foodEntries, plans, logs, deletedWorkoutIds, settings, lifts] = await Promise.all([
    stores.recipes.refresh(), stores.food.refresh(), stores.plan.refresh(), stores.logs.refresh(),
    stores.deletions.refresh(), stores.settings.refresh(), stores.lifts.refresh(),
  ]);
  return { recipes, foodEntries, plan: plans[0] ?? { goals: defaults, profile: null }, logs, deletedWorkoutIds, weeklyWorkoutGoal: Number(settings.find(item => item.id === "weekly-workout-goal")?.value ?? 3), workspaceSettings: settings.filter(item => item.id !== "weekly-workout-goal"), lifts };
}
