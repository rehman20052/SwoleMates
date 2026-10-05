import AsyncStorage from "@react-native-async-storage/async-storage";

import ingredientData from "@/data/ingredients.json";
import recipeData from "@/data/recipes.json";
import swapData from "@/data/swaps.json";

export type Diet = "Vegan" | "Vegetarian" | "Pescatarian" | "Halal" | "Kosher" | "Gluten-free";

export type Macros = {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
};

export type Ingredient = {
  id: string;
  name: string;
  traits: string[];
  allergens: string[];
  per100g: Macros;
};

export type RecipeLine = {
  id: string;
  grams: number;
  amount: string;
  optional?: boolean;
};

export type Recipe = {
  id: string;
  name: string;
  cuisine: string;
  region: string;
  blueZone?: string;
  description: string;
  minutes: number;
  servings: number;
  ingredients: RecipeLine[];
  steps: string[];
};

export type SwapOption = {
  to: string | null;
  ratio: number;
  note: string;
};

export type Swaps = Record<string, string | null>;

export const diets: Diet[] = ["Vegan", "Vegetarian", "Pescatarian", "Halal", "Kosher", "Gluten-free"];
export const allergens = ["Milk", "Egg", "Fish", "Shellfish", "Tree nuts", "Peanuts", "Wheat", "Soy", "Sesame"];

export const recipes = recipeData as Recipe[];
const ingredients = new Map((ingredientData as Ingredient[]).map((item) => [item.id, item]));
const swapOptions = swapData as Record<string, SwapOption[]>;

const blockedTraits: Record<Diet, string[]> = {
  Vegan: ["red-meat", "pork", "poultry", "fish", "shellfish", "dairy", "egg", "honey"],
  Vegetarian: ["red-meat", "pork", "poultry", "fish", "shellfish"],
  Pescatarian: ["red-meat", "pork", "poultry"],
  Halal: ["pork", "alcohol"],
  Kosher: ["pork", "shellfish"],
  "Gluten-free": ["gluten"],
};

export const dietNotes: Partial<Record<Diet, string>> = {
  Halal: "Checks ingredients only, not halal certification. Choose halal meat.",
  Kosher: "Checks ingredients only, not kosher certification. Choose kosher meat.",
  "Gluten-free": "Check labels on sauces and broths for hidden gluten.",
};

export function ingredient(id: string) {
  const item = ingredients.get(id);
  if (!item) throw new Error(`Unknown ingredient: ${id}`);
  return item;
}

export function recipeById(id: string) {
  return recipes.find((recipe) => recipe.id === id);
}

export function applySwaps(recipe: Recipe, swaps: Swaps): RecipeLine[] {
  const lines: RecipeLine[] = [];
  for (const line of recipe.ingredients) {
    if (!(line.id in swaps)) {
      lines.push(line);
      continue;
    }
    const to = swaps[line.id];
    if (to === null) continue;
    const ratio = swapOptions[line.id]?.find((option) => option.to === to)?.ratio ?? 1;
    const grams = Math.round(line.grams * ratio);
    lines.push({ id: to, grams, amount: `${grams} g` });
  }
  return lines;
}

export function macrosPerServing(recipe: Recipe, lines: RecipeLine[] = recipe.ingredients): Macros {
  const total = { calories: 0, protein: 0, carbs: 0, fats: 0 };
  for (const line of lines) {
    const per100g = ingredient(line.id).per100g;
    total.calories += (per100g.calories * line.grams) / 100;
    total.protein += (per100g.protein * line.grams) / 100;
    total.carbs += (per100g.carbs * line.grams) / 100;
    total.fats += (per100g.fats * line.grams) / 100;
  }
  return {
    calories: Math.round(total.calories / recipe.servings),
    protein: Math.round(total.protein / recipe.servings),
    carbs: Math.round(total.carbs / recipe.servings),
    fats: Math.round(total.fats / recipe.servings),
  };
}

function breaksDiet(item: Ingredient, diet: Diet) {
  return item.traits.some((trait) => blockedTraits[diet].includes(trait));
}

export function problems(lines: RecipeLine[], chosenDiets: Diet[], chosenAllergens: string[]) {
  const found: string[] = [];
  const items = lines.map((line) => ingredient(line.id));

  for (const diet of chosenDiets) {
    const hits = items.filter((item) => breaksDiet(item, diet));
    if (hits.length) found.push(`Not ${diet.toLowerCase()}: ${hits.map((item) => item.name).join(", ")}`);
  }

  if (chosenDiets.includes("Kosher")) {
    const meat = items.filter((item) => item.traits.includes("red-meat") || item.traits.includes("poultry"));
    const dairy = items.filter((item) => item.traits.includes("dairy"));
    if (meat.length && dairy.length) found.push(`Not kosher: mixes meat with dairy (${dairy.map((item) => item.name).join(", ")})`);
  }

  for (const allergen of chosenAllergens) {
    const hits = items.filter((item) => item.allergens.includes(allergen));
    if (hits.length) found.push(`Contains ${allergen.toLowerCase()}: ${hits.map((item) => item.name).join(", ")}`);
  }

  return found;
}

export function swapIdeas(ingredientId: string, chosenDiets: Diet[], chosenAllergens: string[]) {
  return (swapOptions[ingredientId] ?? []).filter((option) => {
    if (!option.to) return true;
    const item = ingredient(option.to);
    return (
      !chosenDiets.some((diet) => breaksDiet(item, diet)) &&
      !item.allergens.some((allergen) => chosenAllergens.includes(allergen))
    );
  });
}

export function searchRecipes(query: string, cuisine: string | null) {
  const text = query.trim().toLowerCase();
  return recipes.filter((recipe) => {
    if (cuisine && recipe.cuisine !== cuisine) return false;
    if (!text) return true;
    return (
      recipe.name.toLowerCase().includes(text) ||
      recipe.cuisine.toLowerCase().includes(text) ||
      recipe.ingredients.some((line) => ingredient(line.id).name.toLowerCase().includes(text))
    );
  });
}

export const cuisines = [...new Set(recipes.map((recipe) => recipe.cuisine))];

export type SortOption = "Best match" | "Most protein" | "Protein per calorie" | "Fewest calories";
export const sortOptions: SortOption[] = ["Best match", "Most protein", "Protein per calorie", "Fewest calories"];

export function sortByMacros<T extends { macros: Macros }>(items: T[], sort: SortOption) {
  const sorted = [...items];
  if (sort === "Most protein") sorted.sort((a, b) => b.macros.protein - a.macros.protein);
  if (sort === "Protein per calorie") sorted.sort((a, b) => b.macros.protein / b.macros.calories - a.macros.protein / a.macros.calories);
  if (sort === "Fewest calories") sorted.sort((a, b) => a.macros.calories - b.macros.calories);
  return sorted;
}

export const servingOptions = [0.5, 1, 1.5, 2];

export function scaleMacros(macros: Macros, servings: number): Macros {
  return {
    calories: Math.round(macros.calories * servings),
    protein: Math.round(macros.protein * servings),
    carbs: Math.round(macros.carbs * servings),
    fats: Math.round(macros.fats * servings),
  };
}

const filtersKey = "swolemates.recipe-filters";

export type SavedFilters = { diets: Diet[]; allergens: string[] };

export async function loadFilters(): Promise<SavedFilters> {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(filtersKey)) ?? "{}") as Partial<SavedFilters>;
    return {
      diets: (saved.diets ?? []).filter((diet) => diets.includes(diet)),
      allergens: (saved.allergens ?? []).filter((allergen) => allergens.includes(allergen)),
    };
  } catch {
    return { diets: [], allergens: [] };
  }
}

export function saveFilters(filters: SavedFilters) {
  void AsyncStorage.setItem(filtersKey, JSON.stringify(filters));
}
