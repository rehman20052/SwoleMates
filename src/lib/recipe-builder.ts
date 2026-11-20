import builderData from "@/data/recipe-builder.json";
import ingredientData from "@/data/ingredients.json";
import { type Diet, type Ingredient, type Macros, type Recipe, type RecipeLine, ingredient, macrosPerServing, problems } from "@/lib/recipes";

export type BuildMeal = "Any" | "Breakfast" | "Lunch" | "Dinner" | "Snack";
export type BuildGoal = "Balanced" | "High protein" | "Lighter";
export type BuildChoice = { picked: string[]; meal: BuildMeal; goal: BuildGoal; extras: boolean; style: string; flavor: string; mix: number };
export type BuiltRecipe = { recipe: Recipe; used: string[]; macros: Macros };
export type BuildResult = { recipes: BuiltRecipe[]; skipped: string[] };
export type BuildOption = { id: string; label: string };

type Kind = { time: string; check: string; grams: Record<BuildGoal, number> };
type Protein = { kind: string; title: string };
type Base = { grams: number; fixed?: boolean; prep: string };
type AlwaysLine = { id: string; grams: number };
type Style = {
  id: string;
  name: string;
  label: string;
  meals: BuildMeal[];
  minutes: number;
  base: "required" | "optional";
  bases: string[];
  basePrep?: string;
  broths?: string[];
  brothGrams?: number;
  always?: AlwaysLine[];
  proteins: string[];
  vegetables: string[];
  vegetableCount: number;
  steps: string[];
  serve: string;
  serveNoBase?: string;
};
type FlavorItem = { options: string[]; grams: number };
type Flavor = { id: string; label: string; cuisine: string; styles: string[]; fat: string[]; items: FlavorItem[]; toppings: string[]; toppingGrams: number };
type BreakfastBase = { grams: number; name: string; liquid?: string[]; liquidGrams?: number; blend?: boolean };
type BreakfastFlavor = { id: string; label: string; fruit: string; fruitGrams: number; toppings: string[] };
type BuilderData = {
  pantry: string[];
  popular: string[];
  aliases: Record<string, string>;
  proteins: Record<string, Protein>;
  kinds: Record<string, Kind>;
  bases: Record<string, Base>;
  styles: Style[];
  flavors: Flavor[];
  breakfast: { label: string; meals: BuildMeal[]; bases: Record<string, BreakfastBase>; flavors: BreakfastFlavor[]; sweeteners: string[] };
};
type Rules = { picked: string[]; extras: boolean; goal: BuildGoal; diets: Diet[]; allergens: string[]; mix: number; focused: boolean };

const data = builderData as unknown as BuilderData;
const allIngredients = ingredientData as Ingredient[];

export const anyOption = "Any";
export const breakfastStyle = "breakfast";
export const buildMeals: BuildMeal[] = ["Any", "Breakfast", "Lunch", "Dinner", "Snack"];
export const buildGoals: BuildGoal[] = ["Balanced", "High protein", "Lighter"];
export const popularIngredients = data.popular;
export const buildStyles: BuildOption[] = [...data.styles.map((style) => ({ id: style.id, label: style.label })), { id: breakfastStyle, label: data.breakfast.label }];
export const buildFlavors: BuildOption[] = data.flavors.map((flavor) => ({ id: flavor.id, label: flavor.label }));

const vegetableGrams: Record<BuildGoal, number> = { Balanced: 80, "High protein": 80, Lighter: 100 };
const fatGrams: Record<BuildGoal, number> = { Balanced: 10, "High protein": 10, Lighter: 5 };
const baseShare: Record<BuildGoal, number> = { Balanced: 1, "High protein": 0.8, Lighter: 0.7 };
const toppingShare: Record<BuildGoal, number> = { Balanced: 1, "High protein": 1, Lighter: 0.5 };
const resultLimit = 60;

export function ingredientName(id: string) {
  return ingredient(id).name.split(",")[0].trim();
}

function lowerName(id: string) {
  return ingredientName(id).toLowerCase();
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function listText(words: string[]) {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export function describeUsed(used: string[]) {
  if (used.length === 0) return "";
  return `Uses your ${listText(used.map(lowerName))}`;
}

export function flavorsForStyle(styleId: string) {
  if (styleId === breakfastStyle) return [];
  if (styleId === anyOption) return buildFlavors;
  return data.flavors.filter((flavor) => flavor.styles.includes(styleId)).map((flavor) => ({ id: flavor.id, label: flavor.label }));
}

function roundToFive(grams: number) {
  return Math.max(5, Math.round(grams / 5) * 5);
}

function matchIngredient(term: string) {
  const word = term.trim().toLowerCase();
  const single = word.endsWith("s") ? word.slice(0, -1) : word;
  if (data.aliases[word]) return data.aliases[word];
  if (data.aliases[single]) return data.aliases[single];
  for (const item of allIngredients) {
    const name = lowerName(item.id);
    if (name === word || name === single) return item.id;
  }
  for (const item of allIngredients) {
    if (lowerName(item.id).startsWith(word)) return item.id;
  }
  for (const item of allIngredients) {
    if (item.name.toLowerCase().includes(word)) return item.id;
  }
  return null;
}

export function findIngredients(text: string) {
  const found: string[] = [];
  const missing: string[] = [];
  for (const part of text.split(/,|\n|\band\b/i)) {
    const term = part.trim();
    if (!term) continue;
    const id = matchIngredient(term);
    if (id === null) missing.push(term);
    else if (!found.includes(id)) found.push(id);
  }
  return { found, missing };
}

export function suggestIngredients(text: string, picked: string[], limit = 6) {
  const word = text.trim().toLowerCase();
  if (!word) return [];
  const suggestions: string[] = [];
  const alias = data.aliases[word];
  if (alias) suggestions.push(alias);
  for (const item of allIngredients) {
    if (item.name.toLowerCase().startsWith(word)) suggestions.push(item.id);
  }
  for (const item of allIngredients) {
    if (item.name.toLowerCase().includes(word)) suggestions.push(item.id);
  }
  const unique = [...new Set(suggestions)].filter((id) => !picked.includes(id));
  return unique.slice(0, limit);
}

function fitsFilters(id: string, rules: Rules) {
  return problems([{ id, grams: 1, amount: "" }], rules.diets, rules.allergens).length === 0;
}

function canUse(id: string, rules: Rules) {
  if (!fitsFilters(id, rules)) return false;
  return rules.extras || rules.picked.includes(id) || data.pantry.includes(id);
}

function firstUsable(options: string[], rules: Rules) {
  for (const id of options) {
    if (canUse(id, rules)) return id;
  }
  return null;
}

function pickFew(list: string[], count: number, start: number) {
  const result: string[] = [];
  for (let index = 0; index < list.length && result.length < count; index++) {
    result.push(list[(start + index) % list.length]);
  }
  return result;
}

function mealMatches(meals: BuildMeal[], meal: BuildMeal) {
  return meal === "Any" || meals.includes(meal);
}

function amountText(id: string, grams: number) {
  if (id === "egg") return `${Math.round(grams / 50)} eggs`;
  if (id === "corn-tortilla") return `${Math.round(grams / 26)} tortillas`;
  return `${grams} g`;
}

function line(id: string, grams: number): RecipeLine {
  return { id, grams, amount: amountText(id, grams) };
}

function fillStep(text: string, words: Record<string, string>) {
  let result = text;
  for (const [key, value] of Object.entries(words)) {
    result = result.split(`{${key}}`).join(value);
  }
  return result;
}

function kindOf(proteinId: string) {
  return data.kinds[data.proteins[proteinId].kind];
}

function cookProteinStep(proteinId: string, fatName: string) {
  const kind = data.proteins[proteinId].kind;
  const info = data.kinds[kind];
  const name = lowerName(proteinId);
  if (kind === "ready") return `Flake or slice the ${name}. It is already cooked, so just warm it in the pan for a minute if you like.`;
  if (kind === "legume") return `Rinse and drain the ${name}, then warm them in the ${fatName} for ${info.time}.`;
  if (kind === "egg") return `Heat the ${fatName} in a pan over medium heat. Beat the eggs, pour them in and cook for ${info.time}, until they are set and no liquid egg is left.`;
  return `Heat the ${fatName} in a pan over medium-high heat. Cook the ${name} for ${info.time}, until it ${info.check}.`;
}

function chooseProteins(style: Style, rules: Rules, start: number) {
  const picked = style.proteins.filter((id) => rules.picked.includes(id) && canUse(id, rules));
  if (picked.length > 0) return picked;
  if (!rules.extras) return [];
  const usable = style.proteins.filter((id) => canUse(id, rules));
  return pickFew(usable, rules.focused ? 4 : 2, start + rules.mix);
}

function chooseBase(style: Style, rules: Rules, start: number) {
  const usable = style.bases.filter((id) => canUse(id, rules));
  const picked = usable.find((id) => rules.picked.includes(id));
  if (picked) return picked;
  if (style.base === "optional") return null;
  if (!rules.extras) return undefined;
  return pickFew(usable, 1, start + rules.mix)[0];
}

function chooseVegetables(style: Style, rules: Rules, start: number) {
  const usable = style.vegetables.filter((id) => canUse(id, rules));
  const chosen = usable.filter((id) => rules.picked.includes(id)).slice(0, style.vegetableCount);
  if (!rules.extras) return chosen;
  const others = usable.filter((id) => !chosen.includes(id));
  return [...chosen, ...pickFew(others, style.vegetableCount - chosen.length, start + rules.mix)];
}

function finish(recipe: Recipe, rules: Rules): BuiltRecipe | null {
  if (problems(recipe.ingredients, rules.diets, rules.allergens).length > 0) return null;
  const used = rules.picked.filter((id) => recipe.ingredients.some((item) => item.id === id));
  if (rules.picked.length > 0 && used.length === 0) return null;
  return { recipe, used, macros: macrosPerServing(recipe) };
}

function buildMeal(style: Style, flavor: Flavor, proteinId: string, baseId: string | null, vegetables: string[], rules: Rules, withTopping: boolean): BuiltRecipe | null {
  const fatId = firstUsable(flavor.fat, rules);
  if (!fatId) return null;
  const brothId = style.broths ? firstUsable(style.broths, rules) : null;
  if (style.broths && !brothId) return null;
  const alwaysIds: string[] = [];
  for (const extra of style.always ?? []) {
    if (!canUse(extra.id, rules)) return null;
    alwaysIds.push(extra.id);
  }

  const flavorIds: string[] = [];
  const kind = kindOf(proteinId);
  const lines: RecipeLine[] = [line(proteinId, kind.grams[rules.goal])];
  if (baseId) {
    const base = data.bases[baseId];
    lines.push(line(baseId, base.fixed ? base.grams : roundToFive(base.grams * baseShare[rules.goal])));
  }
  for (const extra of style.always ?? []) lines.push(line(extra.id, extra.grams));
  for (const id of vegetables) lines.push(line(id, vegetableGrams[rules.goal]));
  if (brothId) lines.push(line(brothId, style.brothGrams ?? 400));
  lines.push(line(fatId, fatGrams[rules.goal]));
  for (const item of flavor.items) {
    const id = firstUsable(item.options, rules);
    if (!id) return null;
    flavorIds.push(id);
    lines.push(line(id, item.grams));
  }
  const toppingId = withTopping ? firstUsable(flavor.toppings, rules) : null;
  if (toppingId) lines.push(line(toppingId, Math.round(flavor.toppingGrams * toppingShare[rules.goal])));

  const mains = [proteinId, ...(baseId ? [baseId] : []), ...vegetables, ...alwaysIds].map(lowerName);
  const words = {
    cookProtein: cookProteinStep(proteinId, lowerName(fatId)),
    protein: lowerName(proteinId),
    base: baseId ? lowerName(baseId) : "",
    vegetables: listText(vegetables.map(lowerName)),
    flavor: listText(flavorIds.map(lowerName)),
    fat: lowerName(fatId),
    broth: brothId ? lowerName(brothId) : "",
    everything: listText(mains),
    seasoning: listText([fatId, ...flavorIds].map(lowerName)),
    time: kind.time,
    check: kind.check,
  };
  let prepBase = "";
  if (baseId) prepBase = style.basePrep ? fillStep(style.basePrep, words) : data.bases[baseId].prep;
  const steps: string[] = [];
  if (prepBase && !style.steps.includes("{prepBase}")) steps.push(prepBase);
  for (const step of style.steps) {
    if (step === "{prepBase}") {
      if (prepBase) steps.push(prepBase);
      continue;
    }
    steps.push(fillStep(step, words));
  }
  const serve = baseId ? fillStep(style.serve, words) : style.serveNoBase ?? "Serve right away";
  steps.push(toppingId ? `${serve}, topped with the ${lowerName(toppingId)}.` : `${serve}.`);

  const recipe: Recipe = {
    id: `built-${style.id}-${flavor.id}-${[proteinId, baseId, ...vegetables].filter(Boolean).join("-")}`,
    name: capitalize(`${flavor.label.toLowerCase()} ${data.proteins[proteinId].title} ${fillStep(style.name, words)}`),
    cuisine: flavor.cuisine,
    region: "Built from your ingredients",
    description: `${capitalize(listText(mains))} with ${flavor.label.toLowerCase()} flavors.`,
    minutes: style.minutes,
    servings: 1,
    ingredients: lines,
    steps,
  };
  const built = finish(recipe, rules);
  if (built || !toppingId) return built;
  return buildMeal(style, flavor, proteinId, baseId, vegetables, rules, false);
}

function buildMealRecipes(rules: Rules, choice: BuildChoice) {
  const results: BuiltRecipe[] = [];
  const styles = data.styles.filter((style) => mealMatches(style.meals, choice.meal) && (choice.style === anyOption || style.id === choice.style));
  const flavorsOf = (style: Style) => data.flavors.filter((flavor) => flavor.styles.includes(style.id) && (choice.flavor === anyOption || flavor.id === choice.flavor));
  const rounds = Math.max(0, ...styles.map((style) => flavorsOf(style).length));
  for (let round = 0; round < rounds; round++) {
    for (const style of styles) {
      const flavors = flavorsOf(style);
      if (round >= flavors.length) continue;
      const flavor = flavors[round];
      const base = chooseBase(style, rules, round);
      if (base === undefined) continue;
      const vegetables = chooseVegetables(style, rules, round);
      if (vegetables.length === 0) continue;
      for (const proteinId of chooseProteins(style, rules, round)) {
        const built = buildMeal(style, flavor, proteinId, base, vegetables, rules, true);
        if (built) results.push(built);
      }
    }
  }
  return results;
}

function chooseBreakfastBases(rules: Rules) {
  const usable = Object.keys(data.breakfast.bases).filter((id) => canUse(id, rules));
  const picked = usable.filter((id) => rules.picked.includes(id));
  if (picked.length > 0 || !rules.extras) return picked;
  const chosen: string[] = [];
  const names: string[] = [];
  for (const id of usable) {
    const name = data.breakfast.bases[id].name;
    if (names.includes(name)) continue;
    names.push(name);
    chosen.push(id);
  }
  return chosen;
}

function buildBreakfast(baseId: string, flavor: BreakfastFlavor, rules: Rules): BuiltRecipe | null {
  const base = data.breakfast.bases[baseId];
  if (!canUse(flavor.fruit, rules)) return null;
  const liquidId = base.liquid ? firstUsable(base.liquid, rules) : null;
  if (base.liquid && !liquidId) return null;
  const toppingId = firstUsable(flavor.toppings, rules);
  const sweetenerId = firstUsable(data.breakfast.sweeteners, rules);
  const cinnamon = canUse("cinnamon", rules);
  const lighter = rules.goal === "Lighter";

  const lines: RecipeLine[] = [line(baseId, base.grams)];
  if (liquidId && base.liquidGrams) lines.push(line(liquidId, base.liquidGrams));
  lines.push(line(flavor.fruit, flavor.fruitGrams));
  if (toppingId) lines.push(line(toppingId, lighter ? 8 : 15));
  if (sweetenerId) lines.push(line(sweetenerId, lighter ? 5 : 10));
  if (cinnamon) lines.push(line("cinnamon", 1));

  const toppings = [lowerName(flavor.fruit), ...(toppingId ? [lowerName(toppingId)] : [])];
  const steps: string[] = [];
  if (base.blend) {
    const extras = [...toppings, ...(sweetenerId ? [lowerName(sweetenerId)] : []), ...(cinnamon ? ["cinnamon"] : [])];
    steps.push(`Put the ${lowerName(baseId)} in a blender with the ${listText(extras)}.`);
    steps.push("Blend for about 1 minute, until smooth.");
    steps.push("Pour into a glass and enjoy right away.");
  } else if (liquidId) {
    steps.push(`Stir the ${lowerName(baseId)} with the ${lowerName(liquidId)}${cinnamon ? " and the cinnamon" : ""}.`);
    steps.push("Cover and chill overnight, or microwave for 2 minutes until thick.");
    steps.push(`Top with the ${listText(toppings)}.`);
    steps.push(sweetenerId ? `Drizzle with the ${lowerName(sweetenerId)} and enjoy.` : "Enjoy right away.");
  } else {
    steps.push(`Spoon the ${lowerName(baseId)} into a bowl${cinnamon ? " and sprinkle with the cinnamon" : ""}.`);
    steps.push(`Top with the ${listText(toppings)}.`);
    steps.push(sweetenerId ? `Drizzle with the ${lowerName(sweetenerId)} and enjoy.` : "Enjoy right away.");
  }

  const recipe: Recipe = {
    id: `built-breakfast-${flavor.id}-${baseId}`,
    name: capitalize(`${flavor.label.toLowerCase()} ${base.name}`),
    cuisine: "Breakfast",
    region: "Built from your ingredients",
    description: `${capitalize(listText([lowerName(baseId), ...toppings]))}, ready in minutes.`,
    minutes: 5,
    servings: 1,
    ingredients: lines,
    steps,
  };
  return finish(recipe, rules);
}

function buildBreakfastRecipes(rules: Rules) {
  const results: BuiltRecipe[] = [];
  for (const baseId of chooseBreakfastBases(rules)) {
    for (const flavor of data.breakfast.flavors) {
      const built = buildBreakfast(baseId, flavor, rules);
      if (built) results.push(built);
    }
  }
  return results;
}

function mixLists(first: BuiltRecipe[], second: BuiltRecipe[]) {
  const mixed: BuiltRecipe[] = [];
  for (let index = 0; index < Math.max(first.length, second.length); index++) {
    if (index < first.length) mixed.push(first[index]);
    if (index < second.length) mixed.push(second[index]);
  }
  return mixed;
}

function compareRecipes(a: BuiltRecipe, b: BuiltRecipe, goal: BuildGoal) {
  if (a.used.length !== b.used.length) return b.used.length - a.used.length;
  if (goal === "High protein") return b.macros.protein - a.macros.protein;
  if (goal === "Lighter") return a.macros.calories - b.macros.calories;
  return 0;
}

export function buildRecipes(choice: BuildChoice, diets: Diet[], allergens: string[]): BuildResult {
  const focused = choice.style !== anyOption || choice.flavor !== anyOption;
  const check: Rules = { picked: [], extras: true, goal: choice.goal, diets, allergens, mix: 0, focused };
  const skipped = choice.picked.filter((id) => !fitsFilters(id, check)).map(ingredientName);
  const picked = choice.picked.filter((id) => fitsFilters(id, check));
  if (picked.length === 0 && !choice.extras) return { recipes: [], skipped };

  const rules: Rules = { picked, extras: choice.extras, goal: choice.goal, diets, allergens, mix: choice.mix, focused };
  const meals = choice.style === breakfastStyle ? [] : buildMealRecipes(rules, choice);
  const wantsBreakfast = (choice.style === anyOption || choice.style === breakfastStyle) && choice.flavor === anyOption;
  const breakfasts = wantsBreakfast && mealMatches(data.breakfast.meals, choice.meal) ? buildBreakfastRecipes(rules) : [];
  const found = new Map<string, BuiltRecipe>();
  for (const built of mixLists(meals, breakfasts)) found.set(built.recipe.id, built);
  const recipes = [...found.values()].sort((a, b) => compareRecipes(a, b, choice.goal)).slice(0, resultLimit);
  return { recipes, skipped };
}
