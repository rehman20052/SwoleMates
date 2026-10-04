import type { FoodLogEntry, SavedMeal } from "@/state/app-data";

export type FoodChoice = { key: string; source: "recent" | "recipe"; food: SavedMeal | FoodLogEntry; lastLogged?: string };
const normalize = (name: string) => name.trim().toLocaleLowerCase().replace(/\s+/g, " ");

export function foodChoices(entries: FoodLogEntry[], recipes: SavedMeal[], query: string): FoodChoice[] {
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
  return [...recent, ...saved].filter(choice => words.every(word => normalize(choice.food.name).includes(word)));
}
