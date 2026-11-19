export type ServingUnit = "serving" | "g" | "ml" | "oz" | "piece" | "container" | "unknown";
export type ServingAmount = { amount: number; unit: ServingUnit };
export type MacroValues = { calories: number; protein: number; carbs: number; fat: number };

export function servingMultiplier(base: ServingAmount, used: ServingAmount): number | null {
  if (![base.amount, used.amount].every(value => Number.isFinite(value) && value > 0)) return null;
  if (base.unit === used.unit) return used.amount / base.amount;
  if (base.unit === "g" && used.unit === "oz") return used.amount * 28.349523125 / base.amount;
  if (base.unit === "oz" && used.unit === "g") return used.amount / 28.349523125 / base.amount;
  return null;
}

export function scaleMacros(values: MacroValues, multiplier: number): MacroValues | null {
  if (!Number.isFinite(multiplier) || multiplier <= 0 || Object.values(values).some(value => !Number.isFinite(value) || value < 0)) return null;
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Math.round(value * multiplier * 10) / 10])) as MacroValues;
}
