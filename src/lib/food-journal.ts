import type { FoodLogEntry } from "@/state/app-data";
import { createDurableList, type ListStorage } from "./durable-list";
import { validItemArtwork } from "./item-artwork";

export const foodJournalKey = "swolemates.food-journal";

export function isFoodEntry(value: unknown): value is FoodLogEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<FoodLogEntry>;
  return typeof entry.id === "string" && typeof entry.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
    typeof entry.name === "string" && validItemArtwork(entry.artwork) && ["Breakfast", "Lunch", "Dinner", "Snack"].includes(entry.meal ?? "") &&
    [entry.calories, entry.protein, entry.carbs, entry.fats].every((number) => typeof number === "number" && Number.isFinite(number) && number >= 0);
}

export function sumFoodEntries(entries: FoodLogEntry[], date: string) {
  return entries.filter((entry) => entry.date === date).reduce((totals, entry) => ({
    calories: totals.calories + entry.calories,
    protein: totals.protein + entry.protein,
    carbs: totals.carbs + entry.carbs,
    fats: totals.fats + entry.fats,
  }), { calories: 0, protein: 0, carbs: 0, fats: 0 });
}

export function createFoodJournal(storage: ListStorage) {
  return createDurableList(storage, foodJournalKey, isFoodEntry);
}
