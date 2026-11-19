export type ScanPlatform = "ios" | "android" | "web";
export type BarcodeFormat = "upc_a" | "upc_e" | "ean_8" | "ean_13" | "gtin_14" | "itf";

export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BarcodeObservation = {
  value: string;
  format: BarcodeFormat;
  confidence: number;
  bounds?: NormalizedRect;
  frameId: string;
  capturedAt: number;
};

export type TextObservation = {
  id: string;
  text: string;
  confidence: number;
  bounds: NormalizedRect;
};

export type TextFrame = {
  id: string;
  capturedAt: number;
  width: number;
  height: number;
  observations: TextObservation[];
};

export type NutritionField = "servingSize" | "servingsPerContainer" | "calories" | "protein" | "carbs" | "fat";
export type NutritionBasis = "per_serving" | "per_container" | "per_100g" | "unknown";

export type FieldEvidence<T> = {
  value: T | null;
  confidence: number;
  observationIds: string[];
  warnings: string[];
};

export type ParsedNutrition = {
  basis: NutritionBasis;
  servingSize: FieldEvidence<string>;
  servingsPerContainer: FieldEvidence<number>;
  calories: FieldEvidence<number>;
  protein: FieldEvidence<number>;
  carbs: FieldEvidence<number>;
  fat: FieldEvidence<number>;
  confidence: number;
  warnings: string[];
};

export type ProductNutrition = {
  name: string | null;
  barcode: string;
  basis: NutritionBasis;
  servingSize: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  source: "cache" | "open_food_facts" | "user_confirmed";
};

export type ProductQuality = {
  confidence: number;
  complete: boolean;
  requiresReview: boolean;
  warnings: string[];
};
