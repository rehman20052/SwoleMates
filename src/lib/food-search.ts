import type { FoodLogEntry, SavedMeal } from "@/state/app-data";
export type CommonFood = { id: string; name: string; per100g: { calories: number; protein: number; carbs: number; fats: number } };
export type FoodChoice = { key: string; source: "recent" | "recipe"; food: SavedMeal | FoodLogEntry; lastLogged?: string }
  | { key: string; source: "common"; food: CommonFood };
const normalize = (name: string) => name.trim().toLocaleLowerCase().replace(/\s+/g, " ");
const cookedForms: Record<string, string[]> = {
  cooked: ["cooked", "boiled", "baked", "roasted", "grilled", "fried", "steamed", "broiled", "sauteed"],
  raw: ["raw", "uncooked"], boiled: ["boiled"], baked: ["baked"], roasted: ["roasted"],
  grilled: ["grilled"], fried: ["fried"], steamed: ["steamed"], broiled: ["broiled"], sauteed: ["sauteed"],
};
const matchesWord = (name: string, word: string) => (cookedForms[word] ?? [word]).some(candidate =>
  cookedForms[word] ? new RegExp(`(^|[^a-z])${candidate}([^a-z]|$)`).test(name) : name.includes(candidate));

export function foodChoices(entries: FoodLogEntry[], recipes: SavedMeal[], query: string, catalog: CommonFood[] = []): FoodChoice[] {
  const seen = new Set<string>();
  // Same-day entries retain insertion order from the saved journal; prefer the latest.
  const recent = entries.map((food, index) => ({ food, index }))
    .sort((a, b) => b.food.date.localeCompare(a.food.date) || a.index - b.index)
    .filter(({ food }) => {
      const signature = JSON.stringify([normalize(food.name), food.calories, food.protein, food.carbs, food.fats]);
      if (seen.has(signature)) return false;
      seen.add(signature); return true;
    })
    .map(({ food }): FoodChoice => ({ key: `recent-${food.id}`, source: "recent", food, lastLogged: food.date }));
  const saved = recipes.map((food): FoodChoice => ({ key: `recipe-${food.id}`, source: "recipe", food }));
  const words = normalize(query).split(" ").filter(Boolean);
  const personal = [...recent, ...saved].filter(choice => words.every(word => normalize(choice.food.name).includes(word)));
  if (!words.length) return personal;
  const commonWords = words;
  const common = catalog
    .filter(food => commonWords.every(word => matchesWord(normalize(food.name), word)))
    .sort((a, b) => {
      const score = (food: CommonFood) => commonWords.reduce((total, word) => total + (normalize(food.name).includes(word) ? 2 : 0), 0) - normalize(food.name).length / 1000;
      return score(b) - score(a);
    })
    .slice(0, 40)
    .map((food): FoodChoice => ({ key: `common-${food.id}`, source: "common", food }));
  return [...common, ...personal];
}
