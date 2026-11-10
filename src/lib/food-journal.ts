import type { FoodLogEntry } from "@/state/app-data";
import { createDurableList, type ListStorage } from "./durable-list";
import { validItemArtwork } from "./item-artwork";
import { validScanIngredients } from "./food-scanner";
import { nutritionSummary } from "./nutrition-tracking";

export const foodJournalKey = "swolemates.food-journal";

export function isFoodEntry(value: unknown): value is FoodLogEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<FoodLogEntry>;
  if (entry.dataVersion !== undefined && entry.dataVersion !== 2) return false;
  if (entry.incompleteNutrients !== undefined && (!Array.isArray(entry.incompleteNutrients) || !entry.incompleteNutrients.every(key => ["protein", "carbs", "fats"].includes(key)))) return false;
  if (entry.recipe && (!Number.isFinite(entry.recipe.servings) || entry.recipe.servings <= 0 || entry.recipe.servings > 100 || !validScanIngredients(entry.recipe.ingredients) || (entry.recipe.finishedWeightGrams !== undefined && (!Number.isFinite(entry.recipe.finishedWeightGrams) || entry.recipe.finishedWeightGrams <= 0)))) return false;
  return typeof entry.id === "string" && typeof entry.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
    typeof entry.name === "string" && validItemArtwork(entry.artwork) && (entry.scannedIngredients === undefined || validScanIngredients(entry.scannedIngredients)) && ["Breakfast", "Lunch", "Dinner", "Snack"].includes(entry.meal ?? "") &&
    [entry.calories, entry.protein, entry.carbs, entry.fats].every((number) => typeof number === "number" && Number.isFinite(number) && number >= 0);
}

export function sumFoodEntries(entries: FoodLogEntry[], date: string) {
  const { calories, protein, carbs, fats } = nutritionSummary(entries, date);
  return { calories, protein, carbs, fats };
}

export function copyMealEntries(entries: FoodLogEntry[], sourceDate: string, sourceMeal: FoodLogEntry["meal"], destinationDate: string, destinationMeal: FoodLogEntry["meal"], makeId: () => string) {
  return entries.filter(entry => entry.date === sourceDate && entry.meal === sourceMeal)
    .map(entry => ({ ...entry, id: makeId(), date: destinationDate, meal: destinationMeal }));
}

export function createFoodJournal(storage: ListStorage) {
  return createDurableList(storage, foodJournalKey, isFoodEntry);
}
