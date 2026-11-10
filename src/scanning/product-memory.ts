import { supabase } from "@/lib/supabase";
import { normalizeBarcode } from "./barcodes";
import type { ProductNutrition } from "./types";

type ProductRow = { barcode: string; name: string | null; basis: ProductNutrition["basis"]; serving_size: string | null; calories: number | null; protein: number | null; carbs: number | null; fat: number | null };
const fromRow = (row: ProductRow, source: ProductNutrition["source"]): ProductNutrition => ({ barcode: row.barcode, name: row.name, basis: row.basis, servingSize: row.serving_size, calories: row.calories, protein: row.protein, carbs: row.carbs, fat: row.fat, source });

export async function rememberedProduct(barcode: string): Promise<ProductNutrition | null> {
  const gtin14 = normalizeBarcode(barcode).gtin14;
  const session = await supabase.auth.getSession();
  if (session.data.session?.user.id) {
    const own = await supabase.from("user_products").select("barcode,name,basis,serving_size,calories,protein,carbs,fat").eq("barcode", gtin14).maybeSingle();
    if (!own.error && own.data) return fromRow(own.data as ProductRow, "user_confirmed");
  }
  const shared = await supabase.from("product_cache").select("barcode,name,basis,serving_size,calories,protein,carbs,fat").eq("barcode", gtin14).maybeSingle();
  return !shared.error && shared.data ? fromRow(shared.data as ProductRow, "cache") : null;
}

type ConfirmedIngredient = { barcode?: string; name: string; basis: string; calories: string; protein: string; carbs: string; fats: string };

export async function rememberConfirmedIngredients(items: readonly ConfirmedIngredient[], owner?: string): Promise<boolean> {
  const products = new Map<string, ConfirmedIngredient>();
  for (const item of items) {
    if (!item.barcode) continue;
    try { products.set(normalizeBarcode(item.barcode).gtin14, item); } catch { /* Ignore invalid older barcodes. */ }
  }
  if (!products.size) return false;

  const user = await supabase.auth.getUser();
  const userId = user.data.user?.id;
  if (!userId || (owner && userId !== owner)) return false;
  const confirmedAt = new Date().toISOString();
  const read = (value: string) => {
    const number = value.trim() ? Number(value.replace(",", ".")) : NaN;
    return Number.isFinite(number) && number >= 0 ? number : null;
  };
  const rows = Array.from(products, ([barcode, item]) => ({
    user_id: userId, barcode, name: item.name.trim() || null,
    basis: /100\s*(g|ml)/i.test(item.basis) ? "per_100g" : "per_serving", serving_size: item.basis,
    calories: read(item.calories), protein: read(item.protein), carbs: read(item.carbs), fat: read(item.fats), confirmed_at: confirmedAt,
  }));
  const { error } = await supabase.from("user_products").upsert(rows, { onConflict: "user_id,barcode" });
  if (error && !["42P01", "PGRST205"].includes(error.code ?? "")) throw error;
  return !error;
}
