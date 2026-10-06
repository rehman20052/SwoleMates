export type ScannedFood = {
  name: string; calories: number | null; protein: number | null; carbs: number | null; fats: number | null;
  basis: string; source: "barcode" | "label" | "manual";
};
export const nutritionKeys = ["calories", "protein", "carbs", "fats"] as const;
export type ScanIngredient = {
  id: string; name: string; basis: string; source: ScannedFood["source"]; servings: string;
  calories: string; protein: string; carbs: string; fats: string;
};
export function scannedIngredient(food: ScannedFood): ScanIngredient {
  return { id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, name: food.name,
    basis: food.basis, source: food.source, servings: "1", ...Object.fromEntries(nutritionKeys.map(key => [key, food[key] === null ? "" : String(food[key])])) } as ScanIngredient;
}
export function validScanIngredients(value: unknown): value is ScanIngredient[] {
  return Array.isArray(value) && value.length <= 100 && value.every(item => item &&
    ["id", "name", "basis", "servings", ...nutritionKeys].every(key => typeof item[key] === "string") &&
    ["barcode", "label", "manual"].includes(item.source));
}
export function ingredientTotals(items: ScanIngredient[]) {
  // Keep unknown values unknown, rather than quietly counting them as zero.
  const validServings = items.every(item => { const amount = nutrient(item.servings); return amount !== null && amount > 0 && amount <= 100; });
  const totals = Object.fromEntries(nutritionKeys.map(key => {
    const known = validServings && items.every(item => nutrient(item[key]) !== null);
    return [key, known ? Math.round(items.reduce((sum, item) => sum + nutrient(item[key])! * nutrient(item.servings)!, 0) * 10) / 10 : null];
  })) as Pick<ScannedFood, "calories" | "protein" | "carbs" | "fats">;
  return { ...totals, complete: items.length > 0 && validServings && items.every(item => item.name.trim()) && nutritionKeys.every(key => totals[key] !== null) };
}
const nutrient = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.replace(",", ".")) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100000 ? parsed : null;
};
export function barcodeProduct(data: unknown): ScannedFood {
  const result = data as { status?: number; product?: Record<string, unknown> };
  if (result?.status !== 1 || !result.product) throw new Error("Product not found. Try scanning its nutrition label instead.");
  const product = result.product;
  const values = (product.nutriments ?? {}) as Record<string, unknown>;
  // Use a single basis for every nutrient; never mix per-serving and per-100g values.
  const serving = ["energy-kcal", "energy-kj", "energy", "proteins", "carbohydrates", "fat"].some(key => nutrient(values[key + "_serving"]) !== null);
  const suffix = serving ? "_serving" : "_100g";
  const quantity = nutrient(product.serving_quantity);
  // Filling a missing serving value is safe only with an explicit same-unit serving quantity.
  const unit = product.serving_quantity_unit;
  const ratio = serving && quantity !== null && quantity > 0 && (unit === "g" || unit === "ml") ? quantity / 100 : null;
  const read = (key: string) => nutrient(values[key + suffix]) ?? (ratio !== null && nutrient(values[key + "_100g"]) !== null ? Math.round(nutrient(values[key + "_100g"])! * ratio * 100) / 100 : null);
  const kcal = read("energy-kcal");
  const kj = read("energy-kj") ?? read("energy");
  const servingSize = typeof product.serving_size === "string" && product.serving_size.trim() ? product.serving_size.trim() : "size unspecified";
  return {
    name: String(product.product_name || product.product_name_en || "Scanned food").slice(0, 100),
    calories: kcal ?? (kj === null ? null : Math.round(kj / 4.184)),
    protein: read("proteins"), carbs: read("carbohydrates"), fats: read("fat"),
    basis: serving ? `1 serving (${servingSize})` : "100 g / 100 ml — check the package", source: "barcode",
  };
}
const barcodeCache = new Map<string, ScannedFood>();
export async function lookupBarcode(code: string, signal?: AbortSignal): Promise<ScannedFood> {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) throw new Error("Enter an 8, 12, 13, or 14 digit food barcode.");
  if (barcodeCache.has(code)) return { ...barcodeCache.get(code)! };
  const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_en,nutriments,serving_size,serving_quantity,serving_quantity_unit`, { signal });
  if (!response.ok) throw new Error(response.status === 429 ? "Product lookup is busy. Try again shortly or scan the label." : "Could not look up this barcode. Check your connection or scan the label.");
  const food = barcodeProduct(await response.json());
  if (barcodeCache.size >= 100) barcodeCache.delete(barcodeCache.keys().next().value!);
  barcodeCache.set(code, food);
  return { ...food };
}
export function parseNutritionLabel(text: string): ScannedFood {
  const normalized = text.replace(/\r/g, "").replace(/[|]/g, " ").replace(/[‐‑–]/g, "-")
    .replace(/carbo\s*\n\s*hydrates?/gi, "carbohydrate");
  const lines = normalized.split("\n");
  const find = (pattern: RegExp): number | null => {
    for (let index = 0; index < lines.length; index++) {
      const match = pattern.exec(lines[index]);
      if (!match) continue;
      const tail = lines[index].slice(match.index + match[0].length);
      // OCR commonly confuses O/0 and I/1 in quantities. Only correct numeric tokens,
      // never the nutrient names; ignore % daily values and approximate '<' amounts.
      const amount = tail.match(/^\s*[:.-]?\s*([0-9OoIl]+(?:\s*[.,]\s*[0-9OoIl]+)?)\s*(?:g\b|kcal\b|(?=\s|$))/i);
      if (amount && !/^\s*%/.test(tail.slice(amount[0].length))) return nutrient(amount[1].replace(/\s/g, "").replace(/[Oo]/g, "0").replace(/[Il]/g, "1"));
      // Some labels put the value on the following line.
      const next = lines.slice(index + 1).find(line => line.trim())?.trim().match(/^(\d+(?:[.,]\d+)?)\s*(?:g|kcal)?\s*$/);
      if (next) return nutrient(next[1]);
    }
    return null;
  };
  let calories = find(/\bcalories\b(?!\s+from\s+fat)/i);
  if (calories === null) {
    const kcal = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*kcal\b/i);
    if (kcal) calories = nutrient(kcal[1]);
  }
  const serving = normalized.match(/serving\s+size\s*[:\-]?\s*([^\n]+)/i)?.[1]?.trim();
  const hundredColumn = /(?:per\s*)?100\s*(?:g|ml)\b/i.exec(normalized);
  const servingColumn = /per\s+(?:serving|portion)\b/i.exec(normalized);
  const firstColumnIsHundred = Boolean(hundredColumn && (!servingColumn || hundredColumn.index < servingColumn.index));
  return {
    name: "Scanned food", calories,
    protein: find(/^\s*(?:protein|proteins)(?=\s|\d|:|$)/i),
    carbs: find(/^\s*(?:total\s*carbohydrates?|total\s*carbs|carbohydrates?|carbs)(?=\s|\d|:|$)/i),
    fats: find(/^\s*(?:total\s*fat|fats?)(?=\s|\d|:|$)/i),
    basis: firstColumnIsHundred ? "100 g / 100 ml — check the label" : serving ? `1 serving (${serving.slice(0, 100)})` : "Serving size not detected — check the label",
    source: "label",
  };
}
