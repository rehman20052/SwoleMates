import { normalizeBarcode } from "./barcodes";
import { nutritionPlausibility } from "./confidence";
import type { NutritionBasis, ProductNutrition, ProductQuality } from "./types";

type OffProduct = { status?: number; product?: Record<string, unknown> };
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

export function productQuality(product: ProductNutrition): ProductQuality {
  const warnings: string[] = [];
  const values = [product.calories, product.protein, product.carbs, product.fat];
  if (!product.name?.trim()) warnings.push("Product name is missing.");
  if (values.some(value => value === null)) warnings.push("One or more required nutrition values are missing.");
  if (product.basis === "unknown") warnings.push("Nutrition basis is unknown.");
  warnings.push(...nutritionPlausibility({ calories: product.calories, protein: product.protein, carbs: product.carbs, fat: product.fat }).warnings);
  const complete = Boolean(product.name?.trim()) && values.every(value => value !== null) && product.basis !== "unknown";
  return { confidence: Math.max(0, Math.min(1, 1 - warnings.length * .2)), complete, requiresReview: !complete || warnings.length > 0, warnings };
}

export function mapOpenFoodFacts(barcode: string, data: unknown): ProductNutrition | null {
  const result = data as OffProduct;
  if (result?.status !== 1 || !result.product) return null;
  const product = result.product;
  const nutrients = (product.nutriments ?? {}) as Record<string, unknown>;
  const servingKeys = ["energy-kcal", "energy-kj", "energy", "proteins", "carbohydrates", "fat"];
  const useServing = servingKeys.some(key => finite(nutrients[`${key}_serving`]) !== null);
  const basis: NutritionBasis = useServing ? "per_serving" : "per_100g";
  const suffix = useServing ? "_serving" : "_100g";
  const quantity = finite(product.serving_quantity);
  const compatible = useServing && quantity !== null && quantity > 0 && ["g", "ml"].includes(String(product.serving_quantity_unit));
  const read = (key: string) => finite(nutrients[key + suffix]) ?? (compatible && finite(nutrients[key + "_100g"]) !== null ? Math.round(finite(nutrients[key + "_100g"])! * quantity! * 100) / 10000 : null);
  const kcal = read("energy-kcal");
  const kj = read("energy-kj") ?? read("energy");
  const normalized = normalizeBarcode(barcode);
  return {
    barcode: normalized.gtin14,
    name: typeof product.product_name === "string" && product.product_name.trim() ? product.product_name.trim().slice(0, 100) : typeof product.product_name_en === "string" ? product.product_name_en.trim().slice(0, 100) || null : null,
    basis,
    servingSize: typeof product.serving_size === "string" ? product.serving_size.trim() || null : null,
    calories: kcal ?? (kj === null ? null : Math.round(kj / 4.184)),
    protein: read("proteins"), carbs: read("carbohydrates"), fat: read("fat"), source: "open_food_facts",
  };
}

export type ProductLookupResult =
  | { status: "found" | "incomplete" | "suspicious"; product: ProductNutrition; quality: ProductQuality }
  | { status: "not_found" }
  | { status: "rate_limited" | "network_error"; message: string };

export async function lookupOpenFoodFacts(barcode: string, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<ProductLookupResult> {
  const normalized = normalizeBarcode(barcode);
  try {
    const response = await fetcher(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(normalized.value)}.json?fields=product_name,product_name_en,nutriments,serving_size,serving_quantity,serving_quantity_unit`, { signal });
    if (response.status === 429) return { status: "rate_limited", message: "Product lookup is busy." };
    if (!response.ok) return { status: "network_error", message: "Product lookup failed." };
    const product = mapOpenFoodFacts(normalized.value, await response.json());
    if (!product) return { status: "not_found" };
    const quality = productQuality(product);
    return { status: !quality.complete ? "incomplete" : quality.warnings.length ? "suspicious" : "found", product, quality };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { status: "network_error", message: error instanceof Error ? error.message : "Product lookup failed." };
  }
}

export interface ProductCache {
  get(gtin14: string): Promise<ProductNutrition | null>;
  set(product: ProductNutrition): Promise<void>;
}

export function createMemoryProductCache(maxEntries = 100): ProductCache {
  const products = new Map<string, ProductNutrition>();
  return {
    async get(gtin14) { const product = products.get(gtin14); return product ? { ...product, source: "cache" } : null; },
    async set(product) {
      products.delete(product.barcode); products.set(product.barcode, { ...product });
      while (products.size > maxEntries) products.delete(products.keys().next().value!);
    },
  };
}

export async function lookupProduct(barcode: string, options: { cache?: ProductCache; fetcher?: typeof fetch; signal?: AbortSignal } = {}): Promise<ProductLookupResult> {
  const normalized = normalizeBarcode(barcode);
  const cached = await options.cache?.get(normalized.gtin14);
  if (cached) {
    const quality = productQuality(cached);
    return { status: !quality.complete ? "incomplete" : quality.warnings.length ? "suspicious" : "found", product: cached, quality };
  }
  const result = await lookupOpenFoodFacts(normalized.value, options.fetcher, options.signal);
  if ("product" in result && options.cache) await options.cache.set(result.product);
  return result;
}
