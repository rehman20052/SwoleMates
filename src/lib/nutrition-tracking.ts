import type { FoodLogEntry } from "@/state/app-data";

export const macroKeys = ["protein", "carbs", "fats"] as const;
export function nutritionSummary(entries: FoodLogEntry[], date?: string) {
  const rows = date ? entries.filter(entry => entry.date === date) : entries;
  const totals = rows.reduce((sum, row) => ({ calories: sum.calories + row.calories, protein: sum.protein + row.protein, carbs: sum.carbs + row.carbs, fats: sum.fats + row.fats }), { calories: 0, protein: 0, carbs: 0, fats: 0 });
  const incomplete = macroKeys.filter(key => rows.some(row => row.incompleteNutrients?.includes(key)));
  return { ...totals, incomplete, count: rows.length };
}
