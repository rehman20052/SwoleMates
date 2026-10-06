import { FoodScanner } from "@/components/food-scanner";
import { ingredientTotals, scannedIngredient, type ScanIngredient } from "@/lib/food-scanner";
import { HomeBackdrop } from "@/components/home-backdrop";
import { type ReactNode, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import { AppText, Card, Field, Input, PrimaryButton, ProgressBar, Screen, ScrollBody, SecondaryButton, SectionLabel, TitleBar } from "@/components/ui";
import { sumFoodEntries } from "@/lib/food-journal";
import { daysFromToday, type FoodLogEntry, type NutritionTotals, type SavedMeal, useAppData } from "@/state/app-data";
import { MacroCalculator, WeightTrendCard } from "@/screens/macro-calculator";
import { SaveFeedback } from "@/components/save-feedback";
import { FoodSearch } from "@/components/food-search";
import { MacroPlanCard } from "@/components/macro-plan-card";
import type { FoodChoice } from "@/lib/food-search";
import { useNavigation } from "@/navigation";
import { Image } from "expo-image";
import { TrainingCard } from "@/components/training-card";
import { saveArtworkPhoto, type ArtworkDraft } from "@/lib/artwork-photo";
import { Icon } from "@/components/ui";
import { icons } from "@/assets";
import { useAppTheme } from "@/theme";

type Meal = FoodLogEntry["meal"];
type Macro = "protein" | "carbs" | "fats";

const meals: Meal[] = ["Breakfast", "Lunch", "Dinner", "Snack"];
const macroGoals: Record<Macro, keyof NutritionTotals> = {
  protein: "proteinGoal",
  carbs: "carbGoal",
  fats: "fatGoal",
};

function numberFrom(value: string) {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function macroLabel(macro: Macro) {
  return macro === "fats" ? "Fat" : macro[0].toUpperCase() + macro.slice(1);
}

export function NutritionTrackerScreen({ embedded = false, header, date }: { embedded?: boolean; header?: ReactNode; date?: string }) {
  const theme = useAppTheme();
  const frame = useWindowDimensions();
  const nav = useNavigation();
  const framed = Platform.OS === "web" && frame.width > 450;
  const phoneHeight = Math.min(874, frame.height - 32);
  const { addFoodEntry, updateFoodEntry, deleteFoodEntry, deleteSavedMeal, foodEntries, foodJournalReady, foodJournalError, logWeighIn, nutrition, nutritionProfile, nutritionGoalSource, nutritionPlanReady, nutritionPlanError, recipesReady, recipeStorageError, saveMeal, savedMeals, updateNutrition, updateNutritionProfile, updateSavedMeal } = useAppData();
  const [savingPlan, setSavingPlan] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [showAddFood, setShowAddFood] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannedIngredients, setScannedIngredients] = useState<ScanIngredient[]>([]);
  const [buildFromIngredients, setBuildFromIngredients] = useState(false);
  const [savingNewRecipe, setSavingNewRecipe] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<SavedMeal | null>(null);
  const [editingFood, setEditingFood] = useState<FoodLogEntry | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showGoals, setShowGoals] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [meal, setMeal] = useState<Meal>("Breakfast");
  const [name, setName] = useState("");
  const [artwork, setArtwork] = useState<ArtworkDraft>();
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fats, setFats] = useState("");
  const [goalValues, setGoalValues] = useState({ calories: "", protein: "", carbs: "", fats: "" });

  const journalDate = date ?? daysFromToday(0);
  const isToday = journalDate === daysFromToday(0);
  const [year, month, day] = journalDate.split("-").map(Number);
  const dayLabel = isToday ? "Today" : new Date(year, month - 1, day).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const todayEntries = useMemo(
    () => foodEntries.filter((entry) => entry.date === journalDate),
    [foodEntries, journalDate],
  );

  const entriesByMeal = useMemo(
    () => meals.map((mealName) => ({ meal: mealName, entries: todayEntries.filter((entry) => entry.meal === mealName) })),
    [todayEntries],
  );

  if (!nutrition) return null;
  const currentNutrition = { ...nutrition, ...sumFoodEntries(foodEntries, journalDate) };

  function resetForm() {
    setScannedIngredients([]);
    setBuildFromIngredients(false);
    setArtwork(undefined);
    setMeal("Breakfast");
    setName("");
    setCalories("");
    setProtein("");
    setCarbs("");
    setFats("");
  }

  function openFoodForm(recipeOnly: boolean) {
    resetForm();
    setSavingNewRecipe(recipeOnly);
    setEditingFood(null);
    setFormError(null);
    setShowAddFood(true);
  }

  function openScanner() {
    // Adding an ingredient to an existing meal must preserve its previous nutrition.
    if (!buildFromIngredients && !scannedIngredients.length && [calories, protein, carbs, fats].some(value => value.trim())) {
      const read = (value: string) => value.trim() && Number.isFinite(Number(value.replace(",", "."))) && Number(value.replace(",", ".")) >= 0 ? Number(value.replace(",", ".")) : null;
      setScannedIngredients([scannedIngredient({ name: name.trim() || "Existing food", basis: "1 portion of your existing food or recipe", source: "manual",
        calories: read(calories), protein: read(protein), carbs: read(carbs), fats: read(fats) })]);
    }
    setShowScanner(true);
  }

  function updateIngredients(items: ScanIngredient[]) {
    setScannedIngredients(items);
    const total = ingredientTotals(items);
    setCalories(items.length && total.calories !== null ? String(total.calories) : "");
    setProtein(items.length && total.protein !== null ? String(total.protein) : "");
    setCarbs(items.length && total.carbs !== null ? String(total.carbs) : "");
    setFats(items.length && total.fats !== null ? String(total.fats) : "");
  }

  function addManualIngredient() {
    updateIngredients([...scannedIngredients, scannedIngredient({
      name: "",
      basis: "1 portion",
      source: "manual",
      calories: null,
      protein: null,
      carbs: null,
      fats: null,
    })]);
  }

  function editManualIngredient(id: string, patch: Partial<ScanIngredient>) {
    updateIngredients(scannedIngredients.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function ingredientValidationError() {
    const hasScannedIngredient = scannedIngredients.some(item => item.source !== "manual");
    if (buildFromIngredients && !hasScannedIngredient) {
      return "Complete each ingredient's name, calories, protein, carbs, and fat. Enter 0 for any macro the ingredient doesn't contain.";
    }
    if (buildFromIngredients) {
      return "Complete the missing name or nutrition values for each ingredient. Enter 0 for any macro the ingredient doesn't contain.";
    }
    return "Open the ingredient list and complete the missing nutrition values and servings.";
  }

  async function saveFood(recipeOnly = false) {
    if (savingRecipe || (recipeOnly ? !recipesReady : !foodJournalReady)) return;
    const trimmedName = name.trim();
    if (buildFromIngredients && !recipeOnly && !editingFood && !scannedIngredients.length) {
      setFormError("Add at least one ingredient to calculate this meal."); return;
    }
    if (scannedIngredients.length && !ingredientTotals(scannedIngredients).complete) {
      setFormError(ingredientValidationError()); return;
    }
    const calorieValue = Number(calories.trim().replace(",", "."));
    if (!trimmedName || !calories.trim() || !Number.isFinite(calorieValue) || calorieValue < 0) {
      setFormError("Enter a food name and valid calories (0 is allowed).");
      return;
    }
    const entry = {
      scannedIngredients: scannedIngredients.length ? scannedIngredients : undefined,
      meal,
      name: trimmedName,
      calories: calorieValue,
      protein: numberFrom(protein),
      carbs: numberFrom(carbs),
      fats: numberFrom(fats),
    };
    setSavingRecipe(true);
    setFormError(null);
    let savedArtwork;
    try { savedArtwork = await saveArtworkPhoto(artwork); setArtwork(savedArtwork); }
    catch (err) { setFormError(err instanceof Error ? err.message : "Could not save your image."); setSavingRecipe(false); return; }
    const withImage = { ...entry, artwork: savedArtwork };
    const saved = recipeOnly ? await saveMeal(withImage)
      : editingFood ? await updateFoodEntry(editingFood.id, withImage)
      : await addFoodEntry(withImage, journalDate);
    setSavingRecipe(false);
    if (!saved) return;
    resetForm();
    setShowAddFood(false);
    setEditingFood(null);
  }

  function openFoodEditor(entry: FoodLogEntry) {
    setScannedIngredients(entry.scannedIngredients ?? []);
    setArtwork(entry.artwork);
    setMeal(entry.meal);
    setName(entry.name);
    setCalories(`${entry.calories}`);
    setProtein(`${entry.protein}`);
    setCarbs(`${entry.carbs}`);
    setFats(`${entry.fats}`);
    setEditingFood(entry);
    setSavingNewRecipe(false);
    setFormError(null);
    setShowAddFood(true);
  }

  function reuseFood(choice: FoodChoice) {
    openFoodForm(false);
    const food = choice.food;
    setScannedIngredients(food.scannedIngredients ?? []);
    setArtwork(food.artwork);
    setMeal(food.meal); setName(food.name);
    setCalories(`${food.calories}`); setProtein(`${food.protein}`);
    setCarbs(`${food.carbs}`); setFats(`${food.fats}`);
  }

  function openRecipeEditor(saved: SavedMeal) {
    setScannedIngredients(saved.scannedIngredients ?? []);
    setArtwork(saved.artwork);
    setConfirmDeleteId(null);
    setMeal(saved.meal);
    setName(saved.name);
    setCalories(`${saved.calories}`);
    setProtein(`${saved.protein}`);
    setCarbs(`${saved.carbs}`);
    setFats(`${saved.fats}`);
    setEditingRecipe(saved);
  }

  function closeRecipeEditor() {
    setEditingRecipe(null);
    resetForm();
  }

  async function saveRecipeEdits() {
    if (!editingRecipe || savingRecipe || !recipesReady) return;
    if (scannedIngredients.length && !ingredientTotals(scannedIngredients).complete) {
      setFormError(ingredientValidationError()); return;
    }
    const trimmedName = name.trim();
    const calorieValue = numberFrom(calories);
    if (!trimmedName || calorieValue <= 0) {
      Alert.alert("Add a name and calories", "A saved recipe needs a name and calories.");
      return;
    }
    setSavingRecipe(true);
    setFormError(null);
    let savedArtwork;
    try { savedArtwork = await saveArtworkPhoto(artwork); setArtwork(savedArtwork); }
    catch (err) { setFormError(err instanceof Error ? err.message : "Could not save your image."); setSavingRecipe(false); return; }
    const saved = await updateSavedMeal(editingRecipe.id, {
      scannedIngredients: scannedIngredients.length ? scannedIngredients : undefined,
      artwork: savedArtwork,
      meal,
      name: trimmedName,
      calories: calorieValue,
      protein: numberFrom(protein),
      carbs: numberFrom(carbs),
      fats: numberFrom(fats),
    });
    setSavingRecipe(false);
    if (saved) closeRecipeEditor();
  }

  function addSavedMeal(savedMeal: SavedMeal) {
    void addFoodEntry({
      scannedIngredients: savedMeal.scannedIngredients,
      artwork: savedMeal.artwork,
      meal: savedMeal.meal,
      name: savedMeal.name,
      calories: savedMeal.calories,
      protein: savedMeal.protein,
      carbs: savedMeal.carbs,
      fats: savedMeal.fats,
    }, journalDate);
  }

  function openGoals() {
    if (!nutritionPlanReady) return;
    setGoalError(null);
    setGoalValues({
      calories: `${currentNutrition.calorieGoal}`,
      protein: `${currentNutrition.proteinGoal}`,
      carbs: `${currentNutrition.carbGoal}`,
      fats: `${currentNutrition.fatGoal}`,
    });
    setShowGoals(true);
  }

  async function saveGoals() {
    if (savingPlan || !nutritionPlanReady) return;
    if (numberFrom(goalValues.calories) <= 0) {
      setGoalError("Enter a calorie target greater than zero.");
      return;
    }
    setSavingPlan(true);
    setGoalError(null);
    const saved = await updateNutrition({
      calorieGoal: numberFrom(goalValues.calories),
      proteinGoal: numberFrom(goalValues.protein),
      carbGoal: numberFrom(goalValues.carbs),
      fatGoal: numberFrom(goalValues.fats),
    });
    setSavingPlan(false);
    if (saved) setShowGoals(false);
  }

  async function applyMacroPlan(profile: Parameters<typeof updateNutritionProfile>[0]) {
    if (savingPlan || !nutritionPlanReady) return false;
    setSavingPlan(true);
    const saved = await updateNutritionProfile(profile);
    setSavingPlan(false);
    if (saved) setShowCalculator(false);
    return saved;
  }

  const journal = (
      <ScrollBody contentContainerStyle={styles.body}>
        {!nutritionPlanReady ? <AppText muted>Loading saved daily targets...</AppText> : null}
        {nutritionPlanError ? <AppText color={theme.colors.danger}>{nutritionPlanError}</AppText> : null}
        {recipeStorageError ? <AppText size={13} color={theme.colors.danger}>{recipeStorageError}</AppText> : null}
        {foodJournalError ? <AppText size={13} color={theme.colors.danger}>{foodJournalError}</AppText> : null}

        <>
        <MacroPlanCard calories={currentNutrition.calorieGoal} protein={currentNutrition.proteinGoal} carbs={currentNutrition.carbGoal} fat={currentNutrition.fatGoal}
          manual={nutritionGoalSource === "manual"} progressLabel={isToday ? "Today's macros" : "Macros for this day"} onEdit={openGoals} consumed={{ calories: currentNutrition.calories, protein: currentNutrition.protein, carbs: currentNutrition.carbs, fats: currentNutrition.fats }} goal={nutritionProfile?.goal} hasPlan={Boolean(nutritionProfile)} disabled={!nutritionPlanReady || savingPlan} onPress={() => setShowCalculator(true)} />
        <SaveFeedback area="plan" />
        {nutritionProfile && isToday ? (
          <WeightTrendCard
            profile={nutritionProfile}
            onLog={logWeighIn}
            disabled={!nutritionPlanReady || savingPlan}
            error={nutritionPlanError}
            onApplyAdjustment={async (deltaCalories) => {
              const trend = [...nutritionProfile.weighIns].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
              return applyMacroPlan({
                ...nutritionProfile,
                calorieAdjustment: nutritionProfile.calorieAdjustment + deltaCalories,
                calibratedThrough: trend?.date ?? nutritionProfile.calibratedThrough,
              });
            }}
          />
        ) : null}
        </>



        <View style={{ gap: 12 }}>
        <PrimaryButton height={54} fontSize={16} onPress={() => openFoodForm(false)}>+ Add food</PrimaryButton>
        <View style={[styles.sectionHeader, { flexWrap: "wrap", gap: 12 }]}>
          <View style={{ flex: 1, minWidth: 140 }}>
            <AppText size={20} weight="extrabold">Food journal</AppText>
            <AppText size={13} muted>{todayEntries.length} item{todayEntries.length === 1 ? "" : "s"} logged {isToday ? "today" : "for this day"}</AppText>
          </View>
        </View>
        {todayEntries.length === 0 ? (
          <View style={{ paddingVertical: 12, alignItems: "center", gap: 5 }}><AppText size={13} muted>No food logged yet</AppText><AppText size={12} muted>Start your journal with Add food above.</AppText></View>
        ) : null}
        {entriesByMeal.map(({ meal: mealName, entries }) => (
          entries.length ? (
            <TrainingCard key={mealName} padding={14} gap={12}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <AppText size={13} weight="extrabold" style={{ flex: 1 }}>{mealName}</AppText><AppText size={11} muted>{entries.reduce((total, entry) => total + entry.calories, 0)} cal</AppText>
              </View>
              {entries.map((entry) => (
                <View key={entry.id} style={{ borderTopWidth: 1, borderColor: theme.colors.border, paddingTop: 12, gap: 8 }}>
                  <View style={styles.foodRow}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <AppText weight="bold">{entry.name}</AppText>
                      <AppText size={12} muted>{entry.protein}g protein · {entry.carbs}g carbs · {entry.fats}g fat</AppText>
                    </View>
                    <View style={styles.foodRight}>
                      <AppText size={15} weight="extrabold">{entry.calories}</AppText>
                      <AppText size={10} muted>CAL</AppText>
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${entry.name}`} onPress={() => deleteFoodEntry(entry.id)} hitSlop={10}>
                      <AppText size={21} color={theme.colors.muted}>×</AppText>
                    </Pressable>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${entry.name}`} onPress={() => openFoodEditor(entry)}>
                    <AppText size={12} weight="bold" primary>Edit food</AppText>
                  </Pressable>
                </View>
              ))}
            </TrainingCard>
          ) : null
        ))}
        </View>

        <FoodSearch entries={foodEntries} recipes={savedMeals} ready={foodJournalReady && recipesReady} onSelect={reuseFood} />

        <View style={{ gap: 12 }}>
        <View style={[styles.sectionHeader, { flexWrap: "wrap", gap: 12 }]}>
          <View style={{ flex: 1, minWidth: 140, gap: 3 }}>
            <AppText size={20} weight="extrabold">Saved recipes</AppText>
            <AppText size={12} muted>{savedMeals.length} saved recipe{savedMeals.length === 1 ? "" : "s"}</AppText>
          </View>
          <SecondaryButton height={38} fontSize={13} onPress={() => openFoodForm(true)}>+ Save recipe</SecondaryButton>
        </View>
        {savedMeals.length === 0 ? (
          <View style={{ paddingVertical: 16, alignItems: "center", gap: 5 }}><AppText size={13} muted>No saved recipes yet</AppText><AppText size={12} muted>Save your favorites to reuse later.</AppText></View>
        ) : null}
        <View style={styles.savedMeals}>
          {savedMeals.map((savedMeal) => {
            const confirming = confirmDeleteId === savedMeal.id;
            return (
              <TrainingCard key={savedMeal.id} padding={16} gap={14}>
                <View style={[styles.sectionHeader, { gap: 14 }]}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <AppText size={11} weight="bold" muted upper>{savedMeal.meal}</AppText>
                    <AppText weight="bold">{savedMeal.name}</AppText>
                    <AppText size={12} muted>
                      {savedMeal.calories} cal · {savedMeal.protein}g protein
                    </AppText>
                  </View>
                </View>
                {confirming ? (
                  <View style={[styles.recipeActions, { borderTopWidth: 1, borderColor: theme.colors.border, paddingTop: 12 }]}>
                    <AppText size={13} style={{ flex: 1 }}>Remove this recipe?</AppText>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Keep ${savedMeal.name}`} onPress={() => setConfirmDeleteId(null)}>
                      <AppText size={13} weight="bold" muted>Keep</AppText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${savedMeal.name}`}
                      disabled={savingRecipe}
                      onPress={async () => {
                        if (savingRecipe) return;
                        setSavingRecipe(true);
                        const saved = await deleteSavedMeal(savedMeal.id);
                        setSavingRecipe(false);
                        if (saved) setConfirmDeleteId(null);
                      }}
                    >
                      <AppText size={13} weight="bold" color={theme.colors.danger}>Remove</AppText>
                    </Pressable>
                  </View>
                ) : (
                  <View style={[styles.recipeActions, { borderTopWidth: 1, borderColor: theme.colors.border, paddingTop: 12 }]}>
                    <SecondaryButton height={34} fontSize={12} style={styles.savedAddButton} onPress={() => addSavedMeal(savedMeal)}>
                      {isToday ? "Add to today" : "Add to this day"}
                    </SecondaryButton>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${savedMeal.name}`} hitSlop={6} onPress={() => openRecipeEditor(savedMeal)}>
                      <AppText size={13} weight="extrabold" primary>Edit</AppText>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${savedMeal.name}`} hitSlop={6} onPress={() => setConfirmDeleteId(savedMeal.id)}>
                      <AppText size={13} weight="bold" color={theme.colors.danger}>Delete</AppText>
                    </Pressable>
                  </View>
                )}
              </TrainingCard>
            );
          })}
        </View>
        {header}

        </View>
      </ScrollBody>
  );

  const sheets = (
    <>
      <Modal animationType="slide" visible={showScanner} onRequestClose={() => setShowScanner(false)}>
        <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: 16 }}>
          {showScanner ? <FoodScanner initialIngredients={scannedIngredients} onChange={updateIngredients} onClose={() => setShowScanner(false)} onUse={food => {
            if (!name.trim()) setName(food.name); setCalories(String(food.calories ?? "")); setProtein(String(food.protein ?? ""));
            setCarbs(String(food.carbs ?? "")); setFats(String(food.fats ?? "")); setFormError(null); setShowScanner(false);
          }} /> : null}
        </View>
      </Modal>
      <Modal animationType="slide" transparent visible={showAddFood && !showScanner} onRequestClose={() => setShowAddFood(false)}>
        <KeyboardAvoidingView enabled={Platform.OS !== "web"} behavior="padding" style={styles.keyboardAvoiding}>
          <Pressable style={[styles.overlay, { backgroundColor: theme.colors.sheetOverlay }]} onPress={() => setShowAddFood(false)}>
            <Pressable onPress={() => undefined} style={[styles.sheet, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
              <ScrollBody contentContainerStyle={styles.sheetBody}>
                <View style={styles.sheetHeader}>
                  <View><SectionLabel>{savingNewRecipe ? "Saved recipes" : dayLabel}</SectionLabel><AppText size={23} weight="black">{savingNewRecipe ? "Save recipe" : editingFood ? "Edit food" : "Add food"}</AppText></View>
                  <Pressable accessibilityRole="button" accessibilityLabel={savingNewRecipe ? "Close recipe form" : "Close add food"} onPress={() => setShowAddFood(false)}><AppText size={25} muted>×</AppText></Pressable>
                </View>
                {!savingNewRecipe && !editingFood ? <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: buildFromIngredients }}
                  accessibilityLabel="Build macros from ingredients"
                  onPress={() => {
                    const next = !buildFromIngredients;
                    setBuildFromIngredients(next);
                    if (next && !scannedIngredients.length) addManualIngredient();
                  }}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: buildFromIngredients ? theme.colors.primary : theme.colors.border, backgroundColor: buildFromIngredients ? theme.colors.primaryTint : theme.colors.surfaceRaised }}
                >
                  <View style={{ flex: 1, gap: 3 }}>
                    <AppText size={14} weight="bold">Build macros from ingredients</AppText>
                    <AppText size={11} muted>{scannedIngredients.length ? `${scannedIngredients.length} ${scannedIngredients.length === 1 ? "ingredient" : "ingredients"} included in this one meal.` : "Enter each ingredient and we’ll calculate one meal total."}</AppText>
                  </View>
                  <View style={{ width: 46, height: 27, borderRadius: 14, padding: 3, justifyContent: "center", backgroundColor: buildFromIngredients ? theme.colors.primary : theme.colors.border }}>
                    <View style={{ width: 21, height: 21, borderRadius: 11, backgroundColor: buildFromIngredients ? theme.colors.primaryText : theme.colors.surface, transform: [{ translateX: buildFromIngredients ? 19 : 0 }] }} />
                  </View>
                </Pressable> : null}
                {buildFromIngredients && !savingNewRecipe && !editingFood ? <View style={{ gap: 12 }}>
                  <Field label="Food or meal name"><Input value={name} onChangeText={setName} placeholder="e.g. Chicken burrito" bordered /></Field>
                  {scannedIngredients.map((item, index) => <View key={item.id} style={{ gap: 10, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceRaised }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <AppText size={14} weight="bold">Ingredient {index + 1}</AppText>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ingredient ${index + 1}`} onPress={() => updateIngredients(scannedIngredients.filter((entry) => entry.id !== item.id))}>
                        <AppText size={12} weight="bold" color={theme.colors.danger}>Remove</AppText>
                      </Pressable>
                    </View>
                    <Field label="Food name"><Input bordered value={item.name} placeholder="e.g. Chicken breast" onChangeText={(value) => editManualIngredient(item.id, { name: value })} /></Field>
                    <View style={styles.inputRow}>
                      <Field label="Calories" style={styles.inputHalf}><Input bordered value={item.calories} keyboardType="decimal-pad" placeholder="0" onChangeText={(value) => editManualIngredient(item.id, { calories: value })} /></Field>
                      <Field label="Protein (g)" style={styles.inputHalf}><Input bordered value={item.protein} keyboardType="decimal-pad" placeholder="0" onChangeText={(value) => editManualIngredient(item.id, { protein: value })} /></Field>
                    </View>
                    <View style={styles.inputRow}>
                      <Field label="Carbs (g)" style={styles.inputHalf}><Input bordered value={item.carbs} keyboardType="decimal-pad" placeholder="0" onChangeText={(value) => editManualIngredient(item.id, { carbs: value })} /></Field>
                      <Field label="Fat (g)" style={styles.inputHalf}><Input bordered value={item.fats} keyboardType="decimal-pad" placeholder="0" onChangeText={(value) => editManualIngredient(item.id, { fats: value })} /></Field>
                    </View>
                  </View>)}
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <SecondaryButton style={{ flex: 1 }} onPress={addManualIngredient}>Add ingredient</SecondaryButton>
                    {Platform.OS === "web" ? <SecondaryButton style={{ flex: 1 }} onPress={openScanner}>Scan ingredient</SecondaryButton> : null}
                  </View>
                  <View style={{ padding: 12, borderRadius: 14, backgroundColor: theme.colors.primaryTint, gap: 3 }}>
                    <AppText size={11} weight="bold" primary>ONE MEAL TOTAL</AppText>
                    <AppText size={16} weight="black">{calories || "—"} calories</AppText>
                    <AppText size={11} muted>{protein || "—"}g protein · {carbs || "—"}g carbs · {fats || "—"}g fat</AppText>
                  </View>
                </View> : <>
                  {Platform.OS === "web" ? <SecondaryButton height={44} onPress={openScanner}>{scannedIngredients.length ? `Edit or add ingredients (${scannedIngredients.length})` : "Scan barcode or photograph label"}</SecondaryButton> : null}
                  {scannedIngredients.length ? <AppText size={12} muted>{scannedIngredients.length} scanned ingredients. Totals include the servings you chose. You can also adjust the totals below.</AppText> : null}
                </>}
                <Field label="Meal">
                  <View style={styles.mealOptions}>{meals.map((option) => <Pressable key={option} onPress={() => setMeal(option)} style={[styles.mealOption, { borderColor: meal === option ? theme.colors.primary : theme.colors.border, backgroundColor: meal === option ? theme.colors.primaryTint : theme.colors.surfaceRaised }]}><AppText size={12} weight="bold" primary={meal === option}>{option}</AppText></Pressable>)}</View>
                </Field>
                {!buildFromIngredients ? <>
                  <Field label="Food or meal name"><Input value={name} onChangeText={setName} placeholder="e.g. Chicken burrito bowl" bordered /></Field>
                  <Field label="Calories"><Input value={calories} onChangeText={setCalories} keyboardType="number-pad" placeholder="0" bordered /></Field>
                  <View style={styles.inputRow}>
                    <Field label="Protein (g)" style={styles.inputHalf}><Input value={protein} onChangeText={setProtein} keyboardType="number-pad" placeholder="0" bordered /></Field>
                    <Field label="Carbs (g)" style={styles.inputHalf}><Input value={carbs} onChangeText={setCarbs} keyboardType="number-pad" placeholder="0" bordered /></Field>
                    <Field label="Fat (g)" style={styles.inputHalf}><Input value={fats} onChangeText={setFats} keyboardType="number-pad" placeholder="0" bordered /></Field>
                  </View>
                </> : null}
                {recipeStorageError ? <AppText size={13} color={theme.colors.danger}>{recipeStorageError}</AppText> : null}
        <SaveFeedback area="food" />
        {foodJournalError ? <AppText size={13} color={theme.colors.danger}>{foodJournalError}</AppText> : null}
                {formError ? <AppText size={13} color={theme.colors.danger}>{formError}</AppText> : null}
                <SaveFeedback area={savingNewRecipe ? "recipes" : "food"} onRetried={() => { setShowAddFood(false); resetForm(); }} />
                <PrimaryButton disabled={savingRecipe || (savingNewRecipe ? !recipesReady : !foodJournalReady)} onPress={() => void saveFood(savingNewRecipe)}>{savingRecipe ? "Saving..." : savingNewRecipe ? "Save recipe" : editingFood ? "Save changes" : isToday ? "Add to today" : "Add to this day"}</PrimaryButton>
              </ScrollBody>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal animationType="slide" transparent visible={editingRecipe != null && !showScanner} onRequestClose={closeRecipeEditor}>
        <KeyboardAvoidingView enabled={Platform.OS !== "web"} behavior="padding" style={styles.keyboardAvoiding}>
          <Pressable style={[styles.overlay, { backgroundColor: theme.colors.sheetOverlay }]} onPress={closeRecipeEditor}>
            <Pressable onPress={() => undefined} style={[styles.sheet, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
              <ScrollBody contentContainerStyle={styles.sheetBody}>
                <View style={styles.sheetHeader}>
                  <View>
                    <SectionLabel>Saved recipes</SectionLabel>
                    <AppText size={23} weight="black">Edit recipe</AppText>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel="Close recipe editor" onPress={closeRecipeEditor}>
                    <AppText size={25} muted>×</AppText>
                  </Pressable>
                </View>
                <Field label="Meal">
                  <View style={styles.mealOptions}>{meals.map((option) => <Pressable key={option} onPress={() => setMeal(option)} style={[styles.mealOption, { borderColor: meal === option ? theme.colors.primary : theme.colors.border, backgroundColor: meal === option ? theme.colors.primaryTint : theme.colors.surfaceRaised }]}><AppText size={12} weight="bold" primary={meal === option}>{option}</AppText></Pressable>)}</View>
                </Field>
                <Field label="Recipe name"><Input value={name} onChangeText={setName} placeholder="e.g. Chicken burrito bowl" bordered /></Field>
                {Platform.OS === "web" ? <SecondaryButton height={44} onPress={openScanner}>{scannedIngredients.length ? `Edit or add ingredients (${scannedIngredients.length})` : "Scan barcode or photograph label"}</SecondaryButton> : null}
                {formError ? <AppText size={13} color={theme.colors.danger}>{formError}</AppText> : null}
                <Field label="Calories"><Input value={calories} onChangeText={setCalories} keyboardType="number-pad" placeholder="0" bordered /></Field>
                <View style={styles.inputRow}>
                  <Field label="Protein (g)" style={styles.inputHalf}><Input value={protein} onChangeText={setProtein} keyboardType="number-pad" placeholder="0" bordered /></Field>
                  <Field label="Carbs (g)" style={styles.inputHalf}><Input value={carbs} onChangeText={setCarbs} keyboardType="number-pad" placeholder="0" bordered /></Field>
                  <Field label="Fat (g)" style={styles.inputHalf}><Input value={fats} onChangeText={setFats} keyboardType="number-pad" placeholder="0" bordered /></Field>
                </View>
        <SaveFeedback area="recipes" />
        {recipeStorageError ? <AppText size={13} color={theme.colors.danger}>{recipeStorageError}</AppText> : null}
                <SaveFeedback area="recipes" onRetried={closeRecipeEditor} />
                <PrimaryButton disabled={savingRecipe || !recipesReady} onPress={() => void saveRecipeEdits()}>{savingRecipe ? "Saving..." : "Save changes"}</PrimaryButton>
                <SecondaryButton
                  textColor={theme.colors.danger}
                  disabled={savingRecipe}
                  onPress={async () => {
                    if (!editingRecipe || savingRecipe) return;
                    setSavingRecipe(true);
                    const saved = await deleteSavedMeal(editingRecipe.id);
                    setSavingRecipe(false);
                    if (saved) closeRecipeEditor();
                  }}
                >
                  Delete recipe
                </SecondaryButton>
              </ScrollBody>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal animationType="slide" transparent visible={showGoals} onRequestClose={() => setShowGoals(false)}>
        <KeyboardAvoidingView enabled={Platform.OS !== "web"} behavior="padding" style={styles.keyboardAvoiding}>
          <Pressable style={[styles.overlay, { backgroundColor: theme.colors.sheetOverlay }]} onPress={() => setShowGoals(false)}>
            <Pressable onPress={() => undefined} style={[styles.sheet, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
              <ScrollBody contentContainerStyle={styles.sheetBody}>
                <View style={styles.sheetHeader}><View><SectionLabel>Daily targets</SectionLabel><AppText size={23} weight="black">Your own daily targets</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="Close nutrition goals" onPress={() => setShowGoals(false)}><AppText size={25} muted>×</AppText></Pressable></View>
                <Field label="Calories"><Input accessibilityLabel="Custom daily calories" value={goalValues.calories} onChangeText={(value) => setGoalValues((current) => ({ ...current, calories: value }))} keyboardType="number-pad" bordered /></Field>
                <View style={styles.goalGrid}>{(["protein", "carbs", "fats"] as Macro[]).map((macro) => <Field key={macro} label={`${macroLabel(macro)} (g)`} style={styles.goalHalf}><Input accessibilityLabel={`Custom daily ${macro}`} value={goalValues[macro]} onChangeText={(value) => setGoalValues((current) => ({ ...current, [macro]: value }))} keyboardType="number-pad" bordered /></Field>)}</View>
                {goalError || nutritionPlanError ? <AppText>{goalError ?? nutritionPlanError}</AppText> : null}
                <AppText size={12} muted>These custom targets save to your account and stay in place after weight check-ins. Use View & adjust plan if you want to switch back to estimated targets.</AppText>
                <SaveFeedback area="plan" onRetried={() => setShowGoals(false)} />
                <PrimaryButton disabled={!nutritionPlanReady || savingPlan} onPress={saveGoals}>{savingPlan ? "Saving…" : "Save goals"}</PrimaryButton>
              </ScrollBody>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal animationType="slide" transparent visible={showCalculator} onRequestClose={() => setShowCalculator(false)}>
        <Pressable style={[styles.overlay, { backgroundColor: theme.colors.sheetOverlay }]} onPress={() => setShowCalculator(false)}>
          <Pressable
            onPress={() => undefined}
            style={[
              styles.calculatorSheet,
              {
                backgroundColor: theme.colors.background,
                borderColor: theme.colors.border,
                width: framed ? 402 : "100%",
                maxHeight: framed ? phoneHeight - 28 : "92%",
                marginBottom: framed ? Math.max(16, (frame.height - phoneHeight) / 2) : 0,
              },
            ]}
          >
            <MacroCalculator profile={nutritionProfile} onApply={applyMacroPlan} onClose={() => setShowCalculator(false)} saving={savingPlan} disabled={!nutritionPlanReady} error={nutritionPlanError} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );

  if (embedded) {
    return (
      <View style={{ flex: 1 }}>
        {journal}
        {sheets}
      </View>
    );
  }

  return (
    <Screen>
      <TitleBar title="Nutrition tracker" onBack={nav.back} />
      {journal}
      {sheets}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 18, paddingBottom: 30 }, hero: { gap: 5 }, summaryHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }, goalButton: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8 }, macroRow: { flexDirection: "row", gap: 8 }, macroTile: { borderRadius: 12, flex: 1, gap: 2, padding: 10 }, sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, calculatorCallout: { alignItems: "center", borderRadius: 15, borderWidth: 1, flexDirection: "row", gap: 12, padding: 14 }, addButton: { borderRadius: 10, paddingHorizontal: 12 }, mealSection: { gap: 8 }, foodRow: { alignItems: "center", flexDirection: "row", gap: 12 }, foodRight: { alignItems: "flex-end", minWidth: 42 }, savedMeals: { gap: 10 }, savedAddButton: { borderRadius: 9, paddingHorizontal: 12 }, recipeActions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 14 }, keyboardAvoiding: { flex: 1 }, overlay: { backgroundColor: "rgba(0, 0, 0, 0.74)", flex: 1, justifyContent: "flex-end" }, sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, maxHeight: "88%", padding: 18 }, calculatorSheet: { alignSelf: "center", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 18, paddingBottom: 22 }, sheetBody: { gap: 15, paddingBottom: 18 }, sheetHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, mealOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, mealOption: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 9 }, inputRow: { flexDirection: "row", gap: 8 }, inputHalf: { flex: 1 }, goalGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, goalHalf: { minWidth: "46%" },
});
