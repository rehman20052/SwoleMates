import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { AppText, Card, Chip, Input, PrimaryButton, Screen, ScrollBody, SecondaryButton, SectionLabel, TitleBar } from "@/components/ui";
import { type FoodLogEntry, useAppData } from "@/state/app-data";
import {
  allergens,
  applySwaps,
  cuisines,
  type Diet,
  dietNotes,
  diets,
  ingredient,
  loadFilters,
  macrosPerServing,
  type Macros,
  problems,
  type Recipe,
  recipeById,
  saveFilters,
  scaleMacros,
  searchRecipes,
  servingOptions,
  sortByMacros,
  type SortOption,
  sortOptions,
  swapIdeas,
  type Swaps,
} from "@/lib/recipes";
import { useAppTheme } from "@/theme";

type Meal = FoodLogEntry["meal"];

const meals: Meal[] = ["Breakfast", "Lunch", "Dinner", "Snack"];

function toggle<T>(list: T[], value: T) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function leftToday(nutrition: ReturnType<typeof useAppData>["nutrition"]) {
  if (!nutrition) return null;
  return {
    calories: Math.max(nutrition.calorieGoal - nutrition.calories, 0),
    protein: Math.max(nutrition.proteinGoal - nutrition.protein, 0),
  };
}

function macroLine(macros: Macros) {
  return `${macros.calories} cal · ${macros.protein}g protein · ${macros.carbs}g carbs · ${macros.fats}g fat`;
}

function Frame({ title, backLabel, embedded, onBack, children }: { title: string; backLabel: string; embedded: boolean; onBack?: () => void; children: ReactNode }) {
  const body = (
    <ScrollBody contentContainerStyle={styles.body}>
      {embedded && onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Back to ${backLabel.toLowerCase()}`} hitSlop={8} onPress={onBack}>
          <AppText size={13} weight="extrabold" primary>‹ {backLabel}</AppText>
        </Pressable>
      ) : null}
      {children}
    </ScrollBody>
  );
  if (embedded) return body;
  return (
    <Screen>
      <TitleBar title={title} onBack={onBack} />
      {body}
    </Screen>
  );
}

export function RecipesScreen({ embedded = false, onBack }: { embedded?: boolean; onBack?: () => void }) {
  const theme = useAppTheme();
  const [query, setQuery] = useState("");
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [chosenDiets, setChosenDiets] = useState<Diet[]>([]);
  const [chosenAllergens, setChosenAllergens] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<SortOption>("Best match");
  const [onlyFitsToday, setOnlyFitsToday] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { nutrition } = useAppData();
  const left = leftToday(nutrition);

  useEffect(() => {
    void loadFilters().then((saved) => {
      setChosenDiets(saved.diets);
      setChosenAllergens(saved.allergens);
    });
  }, []);

  function changeDiets(next: Diet[]) {
    setChosenDiets(next);
    saveFilters({ diets: next, allergens: chosenAllergens });
  }

  function changeAllergens(next: string[]) {
    setChosenAllergens(next);
    saveFilters({ diets: chosenDiets, allergens: next });
  }

  const results = useMemo(() => {
    const found = searchRecipes(query, cuisine)
      .map((recipe) => ({
        recipe,
        macros: macrosPerServing(recipe),
        fits: problems(recipe.ingredients, chosenDiets, chosenAllergens).length === 0,
      }))
      .filter((item) => !onlyFitsToday || !left || item.macros.calories <= left.calories);
    const sorted = sortByMacros(found, sort);
    return [...sorted.filter((item) => item.fits), ...sorted.filter((item) => !item.fits)];
  }, [query, cuisine, chosenDiets, chosenAllergens, sort, onlyFitsToday, left?.calories]);

  const openRecipe = openId ? recipeById(openId) : undefined;
  if (openRecipe) {
    return <RecipeDetail recipe={openRecipe} diets={chosenDiets} allergies={chosenAllergens} embedded={embedded} onBack={() => setOpenId(null)} />;
  }

  const fitCount = results.filter((item) => item.fits).length;

  return (
    <Frame title="Recipes" backLabel="Tracker" embedded={embedded} onBack={onBack}>
      <View style={styles.hero}>
        <SectionLabel>NutriDish</SectionLabel>
        <AppText size={29} weight="black">Cook something good.</AppText>
        <AppText muted>Meals from around the world, checked against your diet and allergies.</AppText>
      </View>

      {left ? (
        <Card padding={16} radius={20} gap={10} style={{ backgroundColor: theme.colors.primaryDeep }}>
          <AppText size={12} weight="bold" muted upper>Left today</AppText>
          <AppText size={20} weight="black">
            {left.calories.toLocaleString()} cal <AppText size={14} muted>· {left.protein}g protein</AppText>
          </AppText>
          <View style={styles.wrap}>
            <Chip label="Only show what fits" selected={onlyFitsToday} onPress={() => setOnlyFitsToday(!onlyFitsToday)} />
          </View>
        </Card>
      ) : null}

      <Input value={query} onChangeText={setQuery} placeholder="Search recipes or ingredients" bordered />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Chip label="All" selected={!cuisine} onPress={() => setCuisine(null)} />
        {cuisines.map((name) => (
          <Chip key={name} label={name} selected={cuisine === name} onPress={() => setCuisine(cuisine === name ? null : name)} />
        ))}
      </ScrollView>

      <Pressable accessibilityRole="button" onPress={() => setShowFilters(!showFilters)} style={styles.filterToggle}>
        <AppText weight="bold" primary>Diet & allergies{chosenDiets.length + chosenAllergens.length ? ` (${chosenDiets.length + chosenAllergens.length})` : ""}</AppText>
        <AppText primary>{showFilters ? "Hide" : "Show"}</AppText>
      </Pressable>
      {showFilters ? (
        <Card padding={14} radius={16} gap={10}>
          <AppText size={12} weight="bold" muted upper>Diet</AppText>
          <View style={styles.wrap}>
            {diets.map((diet) => (
              <Chip key={diet} shape="tag" label={diet} selected={chosenDiets.includes(diet)} onPress={() => changeDiets(toggle(chosenDiets, diet))} />
            ))}
          </View>
          <AppText size={12} weight="bold" muted upper>Allergies</AppText>
          <View style={styles.wrap}>
            {allergens.map((allergen) => (
              <Chip key={allergen} shape="tag" label={allergen} selected={chosenAllergens.includes(allergen)} onPress={() => changeAllergens(toggle(chosenAllergens, allergen))} />
            ))}
          </View>
          <AppText size={11} muted>Saved on this device, so you only set them once.</AppText>
        </Card>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {sortOptions.map((option) => (
          <Chip key={option} shape="tag" label={option} selected={sort === option} onPress={() => setSort(option)} />
        ))}
      </ScrollView>

      <AppText size={13} muted>
        {chosenDiets.length || chosenAllergens.length ? `${fitCount} of ${results.length} recipes fit you` : `${results.length} recipes`}
      </AppText>

      {results.map(({ recipe, macros, fits }) => (
        <Pressable key={recipe.id} accessibilityRole="button" accessibilityLabel={`Open ${recipe.name}`} onPress={() => setOpenId(recipe.id)}>
          <Card padding={16} radius={18} gap={8} style={{ opacity: fits ? 1 : 0.55 }}>
            <AppText size={11} weight="bold" muted upper>
              {recipe.cuisine} · {recipe.minutes} min{recipe.blueZone ? " · Blue Zone" : ""}
            </AppText>
            <AppText size={17} weight="extrabold">{recipe.name}</AppText>
            <AppText size={13} muted numberOfLines={2}>{recipe.description}</AppText>
            <AppText size={12} weight="semibold">{macroLine(macros)}</AppText>
            {!fits ? <AppText size={12} color={theme.colors.danger}>Doesn't fit your filters, open it to swap ingredients</AppText> : null}
          </Card>
        </Pressable>
      ))}
    </Frame>
  );
}

function RecipeDetail({ recipe, diets: chosenDiets, allergies, embedded, onBack }: { recipe: Recipe; diets: Diet[]; allergies: string[]; embedded: boolean; onBack: () => void }) {
  const theme = useAppTheme();
  const { addFoodEntry, foodJournalReady, nutrition, recipesReady, recipeStorageError, saveMeal, savedMeals } = useAppData();
  const [busy, setBusy] = useState(false);
  const [swaps, setSwaps] = useState<Swaps>({});
  const [swapping, setSwapping] = useState<string | null>(null);
  const [meal, setMeal] = useState<Meal>("Dinner");
  const [servings, setServings] = useState(1);

  const lines = applySwaps(recipe, swaps);
  const macros = macrosPerServing(recipe, lines);
  const portion = scaleMacros(macros, servings);
  const left = leftToday(nutrition);
  const servingLabel = `${servings} serving${servings === 1 ? "" : "s"}`;
  const logName = servings === 1 ? recipe.name : `${recipe.name} (${servingLabel})`;
  const issues = problems(lines, chosenDiets, allergies);
  const notes = chosenDiets.map((diet) => dietNotes[diet]).filter(Boolean);

  function chooseSwap(from: string, to: string | null) {
    setSwaps({ ...swaps, [from]: to });
    setSwapping(null);
  }

  function undoSwap(from: string) {
    const { [from]: _removed, ...rest } = swaps;
    setSwaps(rest);
  }

  const alreadySaved = savedMeals.some((saved) => saved.name === logName && saved.meal === meal);

  async function logMeal() {
    if (busy) return;
    setBusy(true);
    const added = await addFoodEntry({ meal, name: logName, ...portion });
    setBusy(false);
    if (added) Alert.alert("Added to today", `${logName} was added to your ${meal.toLowerCase()} in the food journal.`);
  }

  async function saveToTracker() {
    if (busy || alreadySaved) return;
    setBusy(true);
    const saved = await saveMeal({ meal, name: logName, ...portion });
    setBusy(false);
    if (saved) Alert.alert("Saved", `${logName} is in Saved recipes on the tracker, so you can add it to any day in one tap.`);
  }

  return (
    <Frame title={recipe.name} backLabel="Recipes" embedded={embedded} onBack={onBack}>
      <View style={styles.hero}>
        {embedded ? <AppText size={24} weight="black">{recipe.name}</AppText> : null}
        <SectionLabel>{recipe.cuisine}{recipe.blueZone ? ` · Blue Zone, ${recipe.blueZone}` : ""}</SectionLabel>
        <AppText muted>{recipe.description}</AppText>
        <AppText size={13} muted>{recipe.minutes} min · serves {recipe.servings}</AppText>
      </View>

      <Card padding={18} radius={24} gap={12} style={{ backgroundColor: theme.colors.primaryDeep }}>
        <AppText size={12} weight="bold" muted upper>Per serving</AppText>
        <View style={styles.macroRow}>
          {([["Cal", macros.calories], ["Protein", `${macros.protein}g`], ["Carbs", `${macros.carbs}g`], ["Fat", `${macros.fats}g`]] as const).map(([label, value]) => (
            <View key={label} style={[styles.macroTile, { backgroundColor: theme.colors.surfaceRaised }]}>
              <AppText size={11} weight="bold" muted upper>{label}</AppText>
              <AppText size={17} weight="extrabold">{value}</AppText>
            </View>
          ))}
        </View>
      </Card>

      {issues.length ? (
        <Card padding={14} radius={16} gap={6} style={{ borderColor: theme.colors.danger }}>
          <AppText weight="bold" color={theme.colors.danger}>Doesn't fit your filters yet</AppText>
          {issues.map((issue) => <AppText key={issue} size={13} muted>{issue}</AppText>)}
          <AppText size={12} muted>Tap "Swap" next to an ingredient to fix it.</AppText>
        </Card>
      ) : chosenDiets.length || allergies.length ? (
        <Card padding={14} radius={16} gap={4} style={{ backgroundColor: theme.colors.primaryTint, borderColor: theme.colors.primary }}>
          <AppText weight="bold" primary>Fits your diet and allergies</AppText>
        </Card>
      ) : null}
      {notes.map((note) => <AppText key={note} size={12} muted>{note}</AppText>)}

      <SectionLabel>Ingredients</SectionLabel>
      <Card padding={14} radius={16} gap={12}>
        {recipe.ingredients.map((line) => {
          const swapped = line.id in swaps;
          const current = swapped ? lines.find((item) => item.id === swaps[line.id]) : line;
          const ideas = swapping === line.id ? swapIdeas(line.id, chosenDiets, allergies) : [];
          return (
            <View key={line.id} style={{ gap: 8 }}>
              <View style={styles.ingredientRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText weight="semibold" style={swapped && !current ? styles.removed : undefined}>
                    {current ? ingredient(current.id).name : ingredient(line.id).name}
                    {line.optional ? <AppText size={12} muted> (optional)</AppText> : null}
                  </AppText>
                  <AppText size={12} muted>{swapped ? (current ? `${current.amount} · was ${ingredient(line.id).name}` : "Left out") : line.amount}</AppText>
                </View>
                {swapped ? (
                  <Pressable accessibilityRole="button" onPress={() => undoSwap(line.id)} hitSlop={8}>
                    <AppText size={12} weight="bold" muted>Undo</AppText>
                  </Pressable>
                ) : (
                  <Pressable accessibilityRole="button" onPress={() => setSwapping(swapping === line.id ? null : line.id)} hitSlop={8}>
                    <AppText size={12} weight="bold" primary>Swap</AppText>
                  </Pressable>
                )}
              </View>
              {swapping === line.id ? (
                <View style={[styles.swapBox, { backgroundColor: theme.colors.surfaceRaised }]}>
                  {ideas.length ? ideas.map((idea) => (
                    <Pressable key={idea.to ?? "none"} accessibilityRole="button" onPress={() => chooseSwap(line.id, idea.to)} style={styles.swapIdea}>
                      <AppText size={13} weight="bold">{idea.to ? ingredient(idea.to).name : "Leave it out"}</AppText>
                      <AppText size={12} muted>{idea.note}</AppText>
                    </Pressable>
                  )) : <AppText size={12} muted>No swaps that fit your filters for this one.</AppText>}
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>

      <SectionLabel>Steps</SectionLabel>
      <Card padding={14} radius={16} gap={12}>
        {recipe.steps.map((step, index) => (
          <View key={step} style={styles.stepRow}>
            <AppText weight="extrabold" primary>{index + 1}</AppText>
            <AppText size={14} style={{ flex: 1 }}>{step}</AppText>
          </View>
        ))}
      </Card>

      <SectionLabel>Log it</SectionLabel>
      <View style={styles.wrap}>
        {meals.map((option) => <Chip key={option} shape="tag" label={option} selected={meal === option} onPress={() => setMeal(option)} />)}
      </View>
      <AppText size={12} weight="bold" muted upper>Servings</AppText>
      <View style={styles.wrap}>
        {servingOptions.map((option) => <Chip key={option} shape="tag" label={`${option}`} selected={servings === option} onPress={() => setServings(option)} />)}
      </View>
      <Card padding={14} radius={16} gap={4}>
        <AppText weight="bold">{servingLabel}: {macroLine(portion)}</AppText>
        {left ? (
          <AppText size={12} muted>
            {portion.calories <= left.calories
              ? `You'll have ${left.calories - portion.calories} cal and ${Math.max(left.protein - portion.protein, 0)}g protein left today.`
              : `That's ${portion.calories - left.calories} cal over what you have left today.`}
          </AppText>
        ) : null}
      </Card>
      <PrimaryButton disabled={busy || !foodJournalReady} onPress={() => void logMeal()}>Add {servingLabel} to today</PrimaryButton>
      <SecondaryButton disabled={busy || !recipesReady || alreadySaved} onPress={() => void saveToTracker()}>
        {alreadySaved ? "Saved to tracker ✓" : "Save to tracker's saved recipes"}
      </SecondaryButton>
      {recipeStorageError ? <AppText size={13} color={theme.colors.danger}>{recipeStorageError}</AppText> : null}
      <AppText size={11} muted>Nutrition is estimated from USDA FoodData Central. Allergy checks only cover the listed ingredients.</AppText>
    </Frame>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, paddingBottom: 30 },
  hero: { gap: 5 },
  chipRow: { gap: 8 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterToggle: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  macroRow: { flexDirection: "row", gap: 8 },
  macroTile: { borderRadius: 12, flex: 1, gap: 2, padding: 10 },
  ingredientRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  removed: { opacity: 0.5, textDecorationLine: "line-through" },
  swapBox: { borderRadius: 12, gap: 4, padding: 8 },
  swapIdea: { borderRadius: 8, gap: 2, padding: 8 },
  stepRow: { flexDirection: "row", gap: 12 },
});
