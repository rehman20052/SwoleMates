import { anyOption, type BuildGoal, type BuildMeal, buildRecipes, buildStyles, type BuiltRecipe } from "@/lib/recipe-builder";
import { type Diet, macrosPerServing, problems, recipes } from "@/lib/recipes";

export type QuickPick = {
  id: string;
  title: string;
  subtitle: string;
  meal: BuildMeal;
  goal: BuildGoal;
  diets: Diet[];
  styles: string[];
  maxCalories?: number;
  maxCarbs?: number;
  maxMinutes?: number;
  sortBy: "protein" | "calories" | "none";
};

export const quickPicks: QuickPick[] = [
  { id: "build-muscle", title: "Build muscle", subtitle: "Most protein first", meal: "Any", goal: "High protein", diets: [], styles: [anyOption], sortBy: "protein" },
  { id: "lose-weight", title: "Lose weight", subtitle: "Lighter meals, fewest calories first", meal: "Any", goal: "Lighter", diets: [], styles: [anyOption], sortBy: "calories" },
  { id: "under-500", title: "Under 500 calories", subtitle: "Every recipe is 500 cal or less", meal: "Any", goal: "Balanced", diets: [], styles: [anyOption], maxCalories: 500, sortBy: "protein" },
  { id: "low-carb", title: "Low carb", subtitle: "30 g of carbs or less", meal: "Any", goal: "Balanced", diets: [], styles: ["salad", "lettuce-wraps", "scramble", "soup"], maxCarbs: 30, sortBy: "protein" },
  { id: "quick", title: "Quick & easy", subtitle: "Ready in 20 minutes or less", meal: "Any", goal: "Balanced", diets: [], styles: [anyOption], maxMinutes: 20, sortBy: "none" },
  { id: "protein-breakfast", title: "High-protein breakfast", subtitle: "Start the day strong", meal: "Breakfast", goal: "High protein", diets: [], styles: [anyOption], sortBy: "protein" },
  { id: "vegetarian-dinner", title: "Vegetarian dinner", subtitle: "No meat or fish", meal: "Dinner", goal: "Balanced", diets: ["Vegetarian"], styles: [anyOption], sortBy: "protein" },
];

function builtRecipesFor(pick: QuickPick, diets: Diet[], allergens: string[]) {
  const found: BuiltRecipe[] = [];
  for (const style of pick.styles) {
    const choice = { picked: [], meal: pick.meal, goal: pick.goal, extras: true, style, flavor: anyOption, mix: 0 };
    found.push(...buildRecipes(choice, diets, allergens).recipes);
  }
  return found;
}

function handWrittenRecipesFor(pick: QuickPick, diets: Diet[], allergens: string[]) {
  const found: BuiltRecipe[] = [];
  if (pick.meal !== "Any") return found;
  for (const recipe of recipes) {
    if (problems(recipe.ingredients, diets, allergens).length > 0) continue;
    found.push({ recipe, used: [], macros: macrosPerServing(recipe) });
  }
  return found;
}

function fitsPick(item: BuiltRecipe, pick: QuickPick) {
  if (pick.maxCalories !== undefined && item.macros.calories > pick.maxCalories) return false;
  if (pick.maxCarbs !== undefined && item.macros.carbs > pick.maxCarbs) return false;
  if (pick.maxMinutes !== undefined && item.recipe.minutes > pick.maxMinutes) return false;
  return true;
}

function takeTurns(first: BuiltRecipe[], second: BuiltRecipe[]) {
  const mixed: BuiltRecipe[] = [];
  for (let index = 0; index < Math.max(first.length, second.length); index++) {
    if (index < first.length) mixed.push(first[index]);
    if (index < second.length) mixed.push(second[index]);
  }
  return mixed;
}

function dishOf(item: BuiltRecipe) {
  for (const style of buildStyles) {
    if (item.recipe.id.startsWith(`built-${style.id}-`)) return style.id;
  }
  return item.recipe.id;
}

function twoOfEachDish(list: BuiltRecipe[]) {
  const counts = new Map<string, number>();
  const varied: BuiltRecipe[] = [];
  const leftOver: BuiltRecipe[] = [];
  for (const item of list) {
    const dish = dishOf(item);
    const count = counts.get(dish) ?? 0;
    if (count < 2) {
      varied.push(item);
      counts.set(dish, count + 1);
    } else {
      leftOver.push(item);
    }
  }
  return [...varied, ...leftOver];
}

function sortForPick(list: BuiltRecipe[], pick: QuickPick) {
  const sorted = [...list];
  if (pick.sortBy === "protein") sorted.sort((a, b) => b.macros.protein - a.macros.protein);
  if (pick.sortBy === "calories") sorted.sort((a, b) => a.macros.calories - b.macros.calories);
  return sorted;
}

export function recipesForPick(pick: QuickPick, savedDiets: Diet[], savedAllergens: string[], limit = 6) {
  const diets = [...new Set([...savedDiets, ...pick.diets])];
  const built = builtRecipesFor(pick, diets, savedAllergens).filter((item) => fitsPick(item, pick));
  const handWritten = handWrittenRecipesFor(pick, diets, savedAllergens).filter((item) => fitsPick(item, pick));

  const unique = new Map<string, BuiltRecipe>();
  for (const item of takeTurns(built, handWritten)) unique.set(item.recipe.id, item);

  const best = twoOfEachDish(sortForPick([...unique.values()], pick)).slice(0, limit);
  return sortForPick(best, pick);
}
