export type NutritionNumbers = { calories: number | null; protein: number | null; carbs: number | null; fat: number | null };

export function nutritionPlausibility(values: NutritionNumbers) {
  const warnings: string[] = [];
  const nutrients = Object.entries(values);
  for (const [field, value] of nutrients) {
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 5000)) warnings.push(`${field} is outside the expected range.`);
  }
  if (values.calories !== null && values.protein !== null && values.carbs !== null && values.fat !== null) {
    const derived = values.protein * 4 + values.carbs * 4 + values.fat * 9;
    if (Math.abs(derived - values.calories) > Math.max(80, values.calories * .45)) warnings.push("Calories differ substantially from the listed macros.");
  }
  return { plausible: warnings.length === 0, confidencePenalty: Math.min(.6, warnings.length * .2), warnings };
}
