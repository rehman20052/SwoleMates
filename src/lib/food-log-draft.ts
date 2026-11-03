import { ingredientTotals, scannedIngredient, type ScanIngredient, type ScannedFood } from "./food-scanner";
import type { FoodLogEntry } from "@/state/app-data";

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
  return { ...scanned, id: target?.id ?? scanned.id };
}

export function entryIngredients(entry: Pick<FoodLogEntry, "name" | "calories" | "protein" | "carbs" | "fats" | "scannedIngredients">): ScanIngredient[] {
  // Older entries may have adjusted totals that differ from their original ingredients.
  const items = entry.scannedIngredients;
  const total = items?.length ? ingredientTotals(items) : null;
  if (total?.complete && (["calories", "protein", "carbs", "fats"] as const).every(key => Math.abs(total[key]! - entry[key]) < 0.11)) return items!.map(item => ({ ...item, id: `${item.id}-${Math.random().toString(36).slice(2)}` }));
  return [scannedIngredient({ ...entry, basis: "1 serving", source: "manual" })];
}

export function draftFood(name: string, meal: FoodLogEntry["meal"], items: ScanIngredient[]) {
  const totals = ingredientTotals(items);
  if (!totals.complete) return null;
  return { name: name.trim() || (items.length === 1 ? items[0].name.trim() : "My meal"), meal,
    calories: totals.calories!, protein: totals.protein!, carbs: totals.carbs!, fats: totals.fats!,
    scannedIngredients: items.map(item => ({ ...item })) };
}
