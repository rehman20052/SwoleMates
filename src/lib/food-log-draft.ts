import { ingredientTotals, nutritionKeys, scannedIngredient, type ScanIngredient, type ScannedFood } from "./food-scanner";
import type { FoodLogEntry, SavedMeal } from "@/state/app-data";

export type MealTotals = Record<(typeof nutritionKeys)[number], string>;
export const emptyMealTotals: MealTotals = { calories: "", protein: "", carbs: "", fats: "" };

export function mealAt(time = new Date()): Exclude<FoodLogEntry["meal"], "Snack"> {
  const hour = time.getHours();
  return hour < 11 ? "Breakfast" : hour < 16 ? "Lunch" : "Dinner";
}

function localDay(time: Date) {
  return `${time.getFullYear()}-${String(time.getMonth() + 1).padStart(2, "0")}-${String(time.getDate()).padStart(2, "0")}`;
}

// Current journal IDs include their creation time; older imports only have a date.
const loggedAt = (id: string) => Number(/^food-(\d{13})(?:-|$)/.exec(id)?.[1] ?? 0);

export function recentMeals(entries: FoodLogEntry[], query: string, now = new Date()) {
  const earliest = new Date(now.getTime());
  earliest.setDate(earliest.getDate() - 6);
  const from = localDay(earliest), through = localDay(now);
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter(entry => entry.date >= from && entry.date <= through && words.every(word => entry.name.toLocaleLowerCase().includes(word)))
    .sort((a, b) => b.date.localeCompare(a.date) || loggedAt(b.id) - loggedAt(a.id));
}

export function mealTotalsInput(entry: Pick<FoodLogEntry, "calories" | "protein" | "carbs" | "fats" | "incompleteNutrients">): MealTotals {
  return {
    calories: String(entry.calories),
    protein: entry.incompleteNutrients?.includes("protein") ? "" : String(entry.protein),
    carbs: entry.incompleteNutrients?.includes("carbs") ? "" : String(entry.carbs),
    fats: entry.incompleteNutrients?.includes("fats") ? "" : String(entry.fats),
  };
}

export function mealFromTotals(name: string, meal: FoodLogEntry["meal"], values: MealTotals) {
  if (!name.trim() || !values.calories.trim()) return null;
  const parsed = nutritionKeys.map(key => values[key].trim() ? Number(values[key].replace(",", ".")) : 0);
  if (parsed.some(value => !Number.isFinite(value) || value < 0 || value > 100000)) return null;
  const [calories, protein, carbs, fats] = parsed;
  return { name: name.trim(), meal, calories, protein, carbs, fats, dataVersion: 2 as const,
    incompleteNutrients: (["protein", "carbs", "fats"] as const).filter(key => !values[key].trim()), scannedIngredients: undefined };
}

export function savedRecipeServing(recipe: SavedMeal, time = new Date()): Omit<FoodLogEntry, "id" | "date"> {
  const { id: _id, recipe: _batch, ...serving } = recipe;
  const items = entryIngredients(recipe);
  return { ...serving, meal: mealAt(time), scannedIngredients: items.some(item => item.provider !== "legacy") ? items : undefined };
}

export function portionGrams(item: ScanIngredient): number | null {
  if (item.gramsPerServing && Number.isFinite(item.gramsPerServing) && item.gramsPerServing > 0) return item.gramsPerServing;
  const basis = item.basis.trim();
  // Never interpret an ambiguous weight/volume basis as grams.
  if (/\bml\b|\/|—/.test(basis)) return null;
  const match = basis.match(/^(\d+(?:[.,]\d+)?)\s*g$/i) ?? basis.match(/^1 serving\s*\([^)]*?(\d+(?:[.,]\d+)?)\s*g\s*\)$/i);
  const amount = match ? Number(match[1].replace(",", ".")) : NaN;
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function fillScannedIngredient(food: ScannedFood, target?: ScanIngredient | null): ScanIngredient {
  const scanned = scannedIngredient(food);
  // A different product has its own serving basis; reset quantity instead of
  // applying the previous product's multiplier to the new nutrition values.
  return { ...scanned, reviewed: false, id: target?.id ?? scanned.id };
}

export function entryIngredients(entry: Pick<FoodLogEntry, "name" | "calories" | "protein" | "carbs" | "fats" | "scannedIngredients" | "incompleteNutrients">): ScanIngredient[] {
  // Older entries may have adjusted totals that differ from their original ingredients.
  const items = entry.scannedIngredients;
  const total = items?.length ? ingredientTotals(items) : null;
  if (total?.loggable && (["calories", "protein", "carbs", "fats"] as const).every(key => Math.abs(total.known[key] - entry[key]) < 0.11)) return items!.map(item => ({ ...item, portion: item.portion ? { ...item.portion } : undefined, id: `${item.id}-${Math.random().toString(36).slice(2)}` }));
  const legacy = scannedIngredient({ ...entry, basis: "1 serving", source: "manual" });
  for (const key of entry.incompleteNutrients ?? []) legacy[key] = "";
  legacy.provider = "legacy";
  return [legacy];
}

export function draftFood(name: string, meal: FoodLogEntry["meal"], items: ScanIngredient[]) {
  const totals = ingredientTotals(items);
  if (!totals.loggable) return null;
  return { name: name.trim() || (items.length === 1 ? items[0].name.trim() : "My meal"), meal,
    ...totals.known,
    incompleteNutrients: (["protein", "carbs", "fats"] as const).filter(key => totals[key] === null),
    dataVersion: 2 as const,
    scannedIngredients: items.map(item => ({ ...item, portion: item.portion ? { ...item.portion } : { unit: "serving" as const, amount: Number(item.servings.replace(",", ".")) } })) };
}

export function withPortion(item: ScanIngredient, amount: string, unit: "g" | "oz" | "serving"): ScanIngredient {
  const value = Number(amount.replace(",", "."));
  const grams = portionGrams(item);
  const servings = unit === "serving" ? value : grams ? value * (unit === "oz" ? 28.349523125 : 1) / grams : NaN;
  return { ...item, servings: amount.trim() && Number.isFinite(servings) ? String(servings) : "", portion: { unit, amount: Number.isFinite(value) && value >= 0 ? value : 0, text: amount } };
}

export function reusableFoodIngredient(food: Pick<FoodLogEntry, "id" | "name" | "calories" | "protein" | "carbs" | "fats" | "incompleteNutrients" | "recipe">): ScanIngredient {
  const grams = food.recipe?.finishedWeightGrams ? food.recipe.finishedWeightGrams / food.recipe.servings : undefined;
  const item = { ...scannedIngredient({ ...food, basis: grams ? `1 serving (${grams} g)` : "1 serving", source: "manual" }), gramsPerServing: grams, provider: "Saved portion", externalId: food.id };
  for (const key of food.incompleteNutrients ?? []) item[key] = "";
  return item;
}

export function recipeFood(name: string, meal: FoodLogEntry["meal"], items: ScanIngredient[], servings: number, finishedWeightGrams?: number) {
  if (!Number.isFinite(servings) || servings <= 0 || servings > 100 || (finishedWeightGrams !== undefined && (!Number.isFinite(finishedWeightGrams) || finishedWeightGrams <= 0))) return null;
  const portions = items.map(item => ({ ...item, servings: String(Number(item.servings.replace(",", ".")) / servings), portion: undefined }));
  const food = draftFood(name, meal, portions);
  if (!food) return null;
  return { ...food, recipe: { servings, finishedWeightGrams, ingredients: items.map(item => ({ ...item, portion: item.portion ? { ...item.portion } : undefined })) } };
}
