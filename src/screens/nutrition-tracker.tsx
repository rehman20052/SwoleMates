import { FoodScanner } from "@/components/food-scanner";
import { ingredientTotals, scannedIngredient, type ScanIngredient } from "@/lib/food-scanner";
import { HomeBackdrop } from "@/components/home-backdrop";
import { type ReactNode, useEffect, useMemo, useState } from "react";
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
  const [addFoodTab, setAddFoodTab] = useState<"Food" | "Recent">("Food");
  const [scannedIngredients, setScannedIngredients] = useState<ScanIngredient[]>([]);
  const [buildFromIngredients, setBuildFromIngredients] = useState(false);
  const [savingNewRecipe, setSavingNewRecipe] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<SavedMeal | null>(null);
  const [editingFood, setEditingFood] = useState<FoodLogEntry | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [customServingTarget, setCustomServingTarget] = useState<string | null>(null);
  const [customServingDraft, setCustomServingDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showGoals, setShowGoals] = useState(false);
  const [journalTab, setJournalTab] = useState<"Journal" | "Recipes" | "Plan">("Journal");
  const [collapsedMeals, setCollapsedMeals] = useState<Meal[]>([]);
  const [expandedFoodId, setExpandedFoodId] = useState<string | null>(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [meal, setMeal] = useState<Meal>("Breakfast");
  const [name, setName] = useState("");
  const [artwork, setArtwork] = useState<ArtworkDraft>();
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fats, setFats] = useState("");
  const [goalValues, setGoalValues] = useState({ calories: "", protein: "", carbs: "", fats: "" });
  const { accountUserId, workspaceSettings, saveWorkspaceSetting, restoreFoodEntry, copyFoodMeal } = useAppData();
  const [undo, setUndo] = useState<{ entry: FoodLogEntry; until: number } | null>(null);
  const [copying, setCopying] = useState(false);
  const [copySource, setCopySource] = useState<Meal>("Breakfast");
  const [copyDestination, setCopyDestination] = useState<Meal>("Breakfast");
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  useEffect(() => { if (!undo) return; const timer = setTimeout(() => setUndo(null), Math.max(0, undo.until - Date.now())); return () => clearTimeout(timer); }, [undo]);
  useEffect(() => { setUndo(null); setShortcutError(null); }, [accountUserId]);
  const favorites = workspaceSettings.flatMap(item => {
    if (!item.id.startsWith("favorite-food:") || typeof item.value !== "object" || !item.value.content) return [];
    try { const food = JSON.parse(item.value.content) as FoodLogEntry; return [{ settingId: item.id, food }]; } catch { return []; }
  });
  async function saveShortcut(id: string, content: string) {
    if (!accountUserId) return false;
    const saved = await saveWorkspaceSetting(id, content, accountUserId, Date.now());
    setShortcutError(saved ? null : "Could not save this change."); return saved;
  }
  async function removeFood(entry: FoodLogEntry) {
    if (await deleteFoodEntry(entry.id)) setUndo({ entry, until: Date.now() + 10000 });
  }

  const journalDate = date ?? daysFromToday(0);
  const completeSetting = workspaceSettings.find(item => item.id === `nutrition-day:${journalDate}`)?.value;
  const dayComplete = typeof completeSetting === "object" && completeSetting.content === "complete";
  const [jy,jm,jd] = journalDate.split("-").map(Number);
  const yesterday = new Date(jy,jm-1,jd-1);
  const yesterdayDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,"0")}-${String(yesterday.getDate()).padStart(2,"0")}`;
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
  const caloriesOverGoal = currentNutrition.calories > currentNutrition.calorieGoal;
  const overGoalColor = theme.isDark ? "#F5B942" : "#98620D";
  const overGoalSurface = theme.isDark ? "rgba(245,185,66,0.16)" : "#F7EBD2";

  function resetForm() {
    setAddFoodTab("Food");
    setScannedIngredients([]);
    setBuildFromIngredients(false);
    setArtwork(undefined);
    setMeal("Breakfast");
    setName("");
    setCalories("");
    setProtein("");
    setCarbs("");
    setFats("");
    setCustomServingTarget(null);
    setCustomServingDraft("");
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
    setBuildFromIngredients(false);
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
    if (choice.source === "common") {
      const food = choice.food;
      const values = food.per100g;
      setScannedIngredients([scannedIngredient({ name: food.name, basis: "100 g", source: "manual", ...values })]);
      setName(food.name); setCalories(`${values.calories}`); setProtein(`${values.protein}`);
      setCarbs(`${values.carbs}`); setFats(`${values.fats}`);
      return;
    }
    const food = choice.food;
    setScannedIngredients(food.scannedIngredients ?? []);
    setArtwork(food.artwork);
    setMeal(food.meal); setName(food.name);
    setCalories(`${food.calories}`); setProtein(`${food.protein}`);
    setCarbs(`${food.carbs}`); setFats(`${food.fats}`);
  }

  function useCommonFood(choice: FoodChoice) {
    if (choice.source !== "common") return;
    const values = choice.food.per100g;
    if (!buildFromIngredients) {
      const selectedMeal = meal;
      reuseFood(choice);
      setMeal(selectedMeal);
      return;
    }
    const ingredient = scannedIngredient({ name: choice.food.name, basis: "100 g", source: "manual", ...values });
    const blankIndex = scannedIngredients.findIndex(item => item.source === "manual" && !item.name.trim() && !item.calories.trim() && !item.protein.trim() && !item.carbs.trim() && !item.fats.trim());
    updateIngredients(blankIndex < 0
      ? [...scannedIngredients, ingredient]
      : scannedIngredients.map((item, index) => index === blankIndex ? { ...ingredient, id: item.id } : item));
  }

  function useCommonFoodForIngredient(id: string, choice: FoodChoice) {
    if (choice.source !== "common") return;
    const values = choice.food.per100g;
    const ingredient = scannedIngredient({ name: choice.food.name, basis: "100 g", source: "manual", ...values });
    updateIngredients(scannedIngredients.map(item => item.id === id ? { ...ingredient, id } : item));
  }

  function useRecentFood(choice: FoodChoice) {
    if (choice.source === "common") return;
    if (buildFromIngredients) {
      const food = choice.food;
      const ingredient = scannedIngredient({
        name: food.name,
        basis: "1 serving",
        source: "manual",
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fats: food.fats,
      });
      const blankIndex = scannedIngredients.findIndex(item => item.source === "manual" && !item.name.trim() && !item.calories.trim() && !item.protein.trim() && !item.carbs.trim() && !item.fats.trim());
      updateIngredients(blankIndex < 0
        ? [...scannedIngredients, ingredient]
        : scannedIngredients.map((item, index) => index === blankIndex ? { ...ingredient, id: item.id } : item));
      setAddFoodTab("Food");
      return;
    }
    reuseFood(choice);
  }

  function updateCommonServing(grams: string) {
    const item = scannedIngredients[0];
    if (!item || item.basis !== "100 g") return;
    const amount = Number(grams.trim().replace(",", "."));
    const servings = grams.trim() && Number.isFinite(amount) && amount >= 0 ? String(amount / 100) : "";
    updateIngredients([{ ...item, servings }]);
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
      <ScrollBody contentContainerStyle={[styles.body, { paddingBottom: 104 }]}>
        {!nutritionPlanReady ? <AppText muted>Loading saved daily targets...</AppText> : null}
        {nutritionPlanError ? <AppText color={theme.colors.danger}>{nutritionPlanError}</AppText> : null}
        {recipeStorageError ? <AppText size={13} color={theme.colors.danger}>{recipeStorageError}</AppText> : null}
        {foodJournalError ? <AppText size={13} color={theme.colors.danger}>{foodJournalError}</AppText> : null}

        <View accessibilityRole="tablist" style={[styles.viewTabs, { backgroundColor: theme.colors.surfaceRaised }]}>
          {(["Plan", "Journal", "Recipes"] as const).map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: journalTab === tab }} onPress={() => setJournalTab(tab)} style={[styles.viewTab, { backgroundColor: journalTab === tab ? theme.colors.primaryTint : "transparent" }]}><AppText size={13} weight="bold" primary={journalTab === tab} muted={journalTab !== tab}>{tab}</AppText></Pressable>)}
        </View>
        {journalTab === "Journal" ? <TrainingCard padding={16} gap={14}>
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}><View style={[styles.intakeIcon, { backgroundColor: caloriesOverGoal ? overGoalSurface : theme.colors.primaryTint }]}><Icon source={icons.flame} size={20} tint={caloriesOverGoal ? overGoalColor : theme.colors.primary} /></View><View style={{ gap: 2 }}><AppText size={16} weight="extrabold">Daily intake</AppText><AppText size={12} muted>{dayLabel} · {todayEntries.length} foods logged</AppText></View></View>
            <Pressable accessibilityRole="button" onPress={openGoals} style={[styles.goalPill, { backgroundColor: theme.colors.surfaceRaised }]}><AppText size={12} weight="bold" primary>Edit goals</AppText></Pressable>
          </View>
          <View style={[styles.calorieSummary, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border, borderWidth: 1 }]}>
            <View style={styles.sectionHeader}>
              <View><AppText size={34} weight="black">{Math.round(currentNutrition.calories).toLocaleString()}<AppText size={13} weight="semibold" muted> kcal</AppText></AppText><AppText size={12} muted>of {currentNutrition.calorieGoal.toLocaleString()} kcal goal</AppText></View>
              <View style={[styles.remainingPill, { backgroundColor: caloriesOverGoal ? overGoalSurface : theme.colors.primaryTint }]}><AppText size={18} weight="extrabold" color={caloriesOverGoal ? overGoalColor : theme.colors.primary}>{Math.abs(Math.round(currentNutrition.calorieGoal - currentNutrition.calories)).toLocaleString()}</AppText><AppText size={10} weight="bold" color={caloriesOverGoal ? overGoalColor : theme.colors.primary}>{caloriesOverGoal ? "OVER" : "LEFT"}</AppText></View>
            </View>
            <ProgressBar progress={currentNutrition.calories / Math.max(1, currentNutrition.calorieGoal)} />
          </View>
          <View style={{ gap: 8 }}><AppText size={12} weight="bold" muted>MACRO PROGRESS</AppText><View style={styles.macroRow}>{(["protein", "carbs", "fats"] as Macro[]).map((macro, index) => {
            const colors = ["#83A92B", "#D69A28", "#5799A1"];
            const current = currentNutrition[macro];
            const target = currentNutrition[macroGoals[macro]];
            return <View key={macro} style={[styles.macroTile, { backgroundColor: theme.colors.surfaceRaised }]}><AppText size={11} muted>{macroLabel(macro)}</AppText><AppText size={16} weight="bold">{Math.round(current)}<AppText size={10} muted> / {target}g</AppText></AppText><View accessibilityRole="progressbar" accessibilityLabel={`${macroLabel(macro)} progress`} accessibilityValue={{ min: 0, max: target, now: Math.min(current, target) }} style={[styles.macroTrack, { backgroundColor: theme.colors.border }]}><View style={{ height: "100%", width: `${Math.min(100, current / Math.max(1, target) * 100)}%`, borderRadius: 4, backgroundColor: colors[index] }} /></View></View>;
          })}</View></View>
        </TrainingCard> : null}
        {journalTab === "Journal" && todayEntries.length === 0 ? <TrainingCard padding={16} gap={6}><AppText size={15} weight="extrabold">Nothing logged yet</AppText><AppText size={12} muted>Add a food to start tracking this day.</AppText></TrainingCard> : null}
        {journalTab === "Plan" ? <>
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
        </> : null}



        {journalTab === "Journal" ? <View style={{ gap: 12 }}>
        <SecondaryButton disabled={!foodJournalReady || journalDate > daysFromToday(0)} onPress={() => void saveShortcut(`nutrition-day:${journalDate}`, dayComplete ? "" : "complete")}>{dayComplete ? "Day complete ✓ · Mark incomplete" : "Mark day complete"}</SecondaryButton>
        <AppText size={12} muted>{dayComplete ? "All meals for this day are logged." : "This day is unmarked; its totals may be partial."}</AppText>
        <SecondaryButton onPress={() => setCopying(value => !value)}>Copy yesterday's meal</SecondaryButton>
        {copying ? <TrainingCard padding={12} gap={10}><AppText weight="bold">Copy from {yesterdayDate} to {journalDate}</AppText><Field label="Source meal"><View style={styles.mealOptions}>{meals.map(option => <SecondaryButton key={option} onPress={() => setCopySource(option)}>{copySource === option ? `✓ ${option}` : option}</SecondaryButton>)}</View></Field><Field label="Destination meal"><View style={styles.mealOptions}>{meals.map(option => <SecondaryButton key={option} onPress={() => setCopyDestination(option)}>{copyDestination === option ? `✓ ${option}` : option}</SecondaryButton>)}</View></Field><PrimaryButton onPress={async () => {
          const source = foodEntries.filter(entry => entry.date === yesterdayDate && entry.meal === copySource);
          if (!source.length) { setShortcutError("No foods in that source meal."); return; }
          if (!(await copyFoodMeal(yesterdayDate,copySource,journalDate,copyDestination))) return;
          setCopying(false); setShortcutError(null);
        }}>Copy meal</PrimaryButton></TrainingCard> : null}
        {favorites.length ? <TrainingCard padding={12} gap={8}><AppText weight="bold">Favorite portions</AppText>{favorites.map(({ settingId,food }) => <View key={settingId} style={{ gap: 6 }}><SecondaryButton onPress={() => reuseFood({ key: settingId,source:"recent",food })}>{food.name} · {food.calories} cal</SecondaryButton><Pressable onPress={() => void saveShortcut(settingId, "")}><AppText size={12} muted>Remove favorite</AppText></Pressable></View>)}</TrainingCard> : null}
        {undo ? <TrainingCard padding={12} gap={8}><AppText>{undo.entry.name} deleted</AppText><SecondaryButton onPress={async () => { if (Date.now() >= undo.until) { setUndo(null); return; } if (await restoreFoodEntry(undo.entry)) setUndo(null); }}>Undo (10 seconds)</SecondaryButton></TrainingCard> : null}
        {shortcutError ? <AppText color={theme.colors.danger}>{shortcutError}</AppText> : null}
        <View style={[styles.sectionHeader, { flexWrap: "wrap", gap: 12 }]}>
          <View style={{ flex: 1, minWidth: 140 }}>
            <AppText size={20} weight="extrabold">Food journal</AppText>
            <AppText size={13} muted>{todayEntries.length} item{todayEntries.length === 1 ? "" : "s"} logged {isToday ? "today" : "for this day"}</AppText>
          </View>
        </View>
        {entriesByMeal.map(({ meal: mealName, entries }) => (
          entries.length ? <TrainingCard key={mealName} padding={14} gap={12}>
              <View style={styles.sectionHeader}>
                <Pressable accessibilityRole="button" accessibilityLabel={`${mealName}, ${entries.length} foods`} accessibilityState={{ expanded: !collapsedMeals.includes(mealName) }} onPress={() => setCollapsedMeals(current => current.includes(mealName) ? current.filter(value => value !== mealName) : [...current, mealName])} style={{ flex: 1, minHeight: 44, justifyContent: "center", gap: 3 }}>
                  <AppText size={15} weight="extrabold">{mealName} {collapsedMeals.includes(mealName) ? "+" : "−"}</AppText><AppText size={12} muted>{entries.length} item{entries.length === 1 ? "" : "s"} · {Math.round(entries.reduce((total, entry) => total + entry.calories, 0))} cal</AppText>
                </Pressable>
                <SecondaryButton height={44} fontSize={12} onPress={() => { openFoodForm(false); setMeal(mealName); }}>+ Add</SecondaryButton>
              </View>
              {!collapsedMeals.includes(mealName) && entries.map((entry) => (
                <View key={entry.id} style={{ borderTopWidth: 1, borderColor: theme.colors.border, paddingTop: 12, gap: 8 }}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`${entry.name}, ${Math.round(entry.calories)} calories, show details`} accessibilityState={{ expanded: expandedFoodId === entry.id }} onPress={() => setExpandedFoodId(current => current === entry.id ? null : entry.id)} style={[styles.foodRow, { minHeight: 48 }]}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <AppText weight="bold">{entry.name}</AppText>
                      <AppText size={12} muted>{entry.protein}g protein · {entry.carbs}g carbs · {entry.fats}g fat</AppText>
                    </View>
                    <View style={styles.foodRight}>
                      <AppText size={15} weight="extrabold">{entry.calories}</AppText>
                      <AppText size={10} muted>CAL</AppText>
                    </View>
                    <AppText size={18} muted>{expandedFoodId === entry.id ? "−" : "+"}</AppText>
                  </Pressable>
                  {expandedFoodId === entry.id ? <View style={[styles.recipeActions, { backgroundColor: theme.colors.surfaceRaised, borderRadius: 12, paddingHorizontal: 12 }]}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${entry.name}`} onPress={() => openFoodEditor(entry)} style={{ minHeight: 44, justifyContent: "center", flex: 1 }}>
                    <AppText size={12} weight="bold" primary>Edit food</AppText>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Favorite ${entry.name} portion`} onPress={() => void saveShortcut(`favorite-food:${entry.id}`,JSON.stringify(entry))} style={{ minHeight:44,justifyContent:"center" }}><AppText size={12} primary>Favorite portion</AppText></Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${entry.name}`} onPress={() => void removeFood(entry)} style={{ minHeight: 44, justifyContent: "center" }}><AppText size={12} color={theme.colors.danger}>Delete</AppText></Pressable>
                  </View> : null}
                </View>
              ))}
            </TrainingCard>
          : null
        ))}
        </View> : null}

        {journalTab === "Recipes" ? <View style={{ gap: 12 }}>
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
        </View> : null}
        {header}
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
              <ScrollBody style={{ flexShrink: 1, minHeight: 0 }} contentContainerStyle={styles.sheetBody}>
                <View style={styles.sheetHeader}>
                  <View><SectionLabel>{savingNewRecipe ? "Saved recipes" : dayLabel}</SectionLabel><AppText size={23} weight="black">{savingNewRecipe ? "Save recipe" : editingFood ? "Edit food" : "Add food"}</AppText></View>
                  <Pressable accessibilityRole="button" accessibilityLabel={savingNewRecipe ? "Close recipe form" : "Close add food"} onPress={() => setShowAddFood(false)}><AppText size={25} muted>×</AppText></Pressable>
                </View>
                {!savingNewRecipe && !editingFood ? <>
                  <View accessibilityRole="tablist" style={[styles.viewTabs, { backgroundColor: theme.colors.surfaceRaised }]}>
                    {(["Food", "Recent"] as const).map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: addFoodTab === tab }} onPress={() => setAddFoodTab(tab)} style={[styles.viewTab, { backgroundColor: addFoodTab === tab ? theme.colors.primaryTint : "transparent" }]}><AppText size={13} weight="bold" primary={addFoodTab === tab}>{tab === "Food" ? "Food & database" : "Recent foods"}</AppText></Pressable>)}
                  </View>
                  {addFoodTab === "Food" ? <>{Platform.OS === "web" ? <SecondaryButton height={44} onPress={openScanner}>{buildFromIngredients ? "Scan ingredient" : scannedIngredients.length ? `Edit ingredients (${scannedIngredients.length})` : "Scan barcode"}</SecondaryButton> : null}</> : <FoodSearch entries={foodEntries} recipes={savedMeals} ready={foodJournalReady && recipesReady} onSelect={useRecentFood} />}
                </> : null}
                {addFoodTab !== "Recent" ? <>
                {!savingNewRecipe && !editingFood && !buildFromIngredients && scannedIngredients.length === 1 && scannedIngredients[0].basis === "100 g" ? <View style={{ gap: 8 }}>
                  <AppText size={12} weight="bold">Serving: {scannedIngredients[0].servings ? Number(scannedIngredients[0].servings) * 100 : "—"}g</AppText>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{[50, 100, 150, 200].map(grams => <SecondaryButton key={grams} height={34} style={{ flexGrow: 1 }} onPress={() => { setCustomServingTarget(null); setCustomServingDraft(""); updateCommonServing(String(grams)); }}>{grams}g</SecondaryButton>)}<SecondaryButton height={34} style={{ flexGrow: 1 }} onPress={() => { setCustomServingDraft(scannedIngredients[0].servings ? String(Number(scannedIngredients[0].servings) * 100) : ""); setCustomServingTarget("food"); }}>Custom</SecondaryButton></View>
                  {customServingTarget === "food" ? <Field label="Custom serving size (g)"><Input autoFocus bordered accessibilityLabel="Custom common food serving size in grams" keyboardType="decimal-pad" value={customServingDraft} placeholder="Enter grams" onChangeText={(value) => { setCustomServingDraft(value); updateCommonServing(value); }} /></Field> : null}
                  <AppText size={11} muted>Macros below are calculated from the catalog values per 100 g.</AppText>
                </View> : null}
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
                  <View style={{ gap: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ flex: 1, gap: 2 }}><AppText size={14} weight="bold">Ingredients</AppText><AppText size={11} muted>Look up macros in each ingredient, or enter nutrition by hand.</AppText></View>
                    </View>
                  </View>
                  {scannedIngredients.map((item, index) => {
                    const catalogFood = item.basis === "100 g";
                    const portionMacros = catalogFood ? ingredientTotals([item]) : null;
                    const displayedMacro = (key: "calories" | "protein" | "carbs" | "fats") =>
                      portionMacros ? (portionMacros[key] === null ? "" : String(portionMacros[key])) : item[key];
                    return <View key={item.id} style={{ gap: 10, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceRaised }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <AppText size={14} weight="bold">Ingredient {index + 1}</AppText>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ingredient ${index + 1}`} onPress={() => updateIngredients(scannedIngredients.filter((entry) => entry.id !== item.id))}>
                        <AppText size={12} weight="bold" color={theme.colors.danger}>Remove</AppText>
                      </Pressable>
                    </View>
                    {addFoodTab === "Food" ? <FoodSearch key={`food-lookup-${item.id}`} entries={[]} recipes={[]} ready onSelect={choice => useCommonFoodForIngredient(item.id, choice)} mode="find" /> : null}
                    <Field label="Food name"><Input bordered value={item.name} placeholder="e.g. Chicken breast" onChangeText={(value) => editManualIngredient(item.id, { name: value })} /></Field>
                    {item.basis === "100 g" ? <View style={{ gap: 8, padding: 10, borderRadius: 12, backgroundColor: theme.colors.primaryTint }}>
                      <AppText size={11} weight="bold" primary>MACROS FOR YOUR SELECTED AMOUNT</AppText>
                      <AppText size={12} weight="bold">Amount in meal: {item.servings ? Number(item.servings) * 100 : "—"}g</AppText>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{[50, 100, 150, 200].map(grams => <SecondaryButton key={grams} height={32} style={{ flexGrow: 1 }} onPress={() => { setCustomServingTarget(null); setCustomServingDraft(""); editManualIngredient(item.id, { servings: String(grams / 100) }); }}>{grams}g</SecondaryButton>)}<SecondaryButton height={32} style={{ flexGrow: 1 }} onPress={() => { setCustomServingDraft(item.servings ? String(Number(item.servings) * 100) : ""); setCustomServingTarget(item.id); }}>Custom</SecondaryButton></View>
                      {customServingTarget === item.id ? <Field label="Custom amount (g)"><Input autoFocus bordered accessibilityLabel={`Custom serving grams for ingredient ${index + 1}`} keyboardType="decimal-pad" value={customServingDraft} placeholder="Enter grams" onChangeText={(value) => {
                        setCustomServingDraft(value);
                        const grams = Number(value.trim().replace(",", "."));
                        editManualIngredient(item.id, { servings: value.trim() && Number.isFinite(grams) && grams >= 0 ? String(grams / 100) : "" });
                      }} /></Field> : null}
                    </View> : null}
                    <View style={styles.inputRow}>
                      <Field label="Calories" style={styles.inputHalf}><Input bordered editable={!catalogFood} value={displayedMacro("calories")} keyboardType="decimal-pad" placeholder={catalogFood ? "—" : "0"} onChangeText={(value) => editManualIngredient(item.id, { calories: value })} /></Field>
                      <Field label="Protein (g)" style={styles.inputHalf}><Input bordered editable={!catalogFood} value={displayedMacro("protein")} keyboardType="decimal-pad" placeholder={catalogFood ? "—" : "0"} onChangeText={(value) => editManualIngredient(item.id, { protein: value })} /></Field>
                    </View>
                    <View style={styles.inputRow}>
                      <Field label="Carbs (g)" style={styles.inputHalf}><Input bordered editable={!catalogFood} value={displayedMacro("carbs")} keyboardType="decimal-pad" placeholder={catalogFood ? "—" : "0"} onChangeText={(value) => editManualIngredient(item.id, { carbs: value })} /></Field>
                      <Field label="Fat (g)" style={styles.inputHalf}><Input bordered editable={!catalogFood} value={displayedMacro("fats")} keyboardType="decimal-pad" placeholder={catalogFood ? "—" : "0"} onChangeText={(value) => editManualIngredient(item.id, { fats: value })} /></Field>
                    </View>
                  </View>; })}
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <SecondaryButton style={{ flex: 1 }} onPress={addManualIngredient}>Add ingredient</SecondaryButton>
                  </View>
                  <View style={{ padding: 12, borderRadius: 14, backgroundColor: theme.colors.primaryTint, gap: 3 }}>
                    <AppText size={11} weight="bold" primary>ONE MEAL TOTAL</AppText>
                    <AppText size={16} weight="black">{calories || "—"} calories</AppText>
                    <AppText size={11} muted>{protein || "—"}g protein · {carbs || "—"}g carbs · {fats || "—"}g fat</AppText>
                  </View>
                </View> : <>
                  {scannedIngredients.length ? <AppText size={12} muted>{scannedIngredients.length} scanned ingredients. Totals include the servings you chose. You can also adjust the totals below.</AppText> : null}
                </>}
                {!buildFromIngredients && !savingNewRecipe && !editingFood && addFoodTab === "Food" ? <View style={{ gap: 12 }}>
                  <View style={{ flex: 1, gap: 7 }}><AppText size={12} weight="bold" muted>MEAL</AppText><View style={styles.mealOptions}>{meals.map((option) => <Pressable key={option} onPress={() => setMeal(option)} style={[styles.mealOption, { borderColor: meal === option ? theme.colors.primary : theme.colors.border, backgroundColor: meal === option ? theme.colors.primaryTint : theme.colors.surfaceRaised }]}><AppText size={12} weight="bold" primary={meal === option}>{option}</AppText></Pressable>)}</View></View>
                  <FoodSearch entries={[]} recipes={[]} ready onSelect={useCommonFood} mode="find" compact />
                </View> : <Field label="Meal">
                  <View style={styles.mealOptions}>{meals.map((option) => <Pressable key={option} onPress={() => setMeal(option)} style={[styles.mealOption, { borderColor: meal === option ? theme.colors.primary : theme.colors.border, backgroundColor: meal === option ? theme.colors.primaryTint : theme.colors.surfaceRaised }]}><AppText size={12} weight="bold" primary={meal === option}>{option}</AppText></Pressable>)}</View>
                </Field>}
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
                </> : null}
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
                {Platform.OS === "web" ? <SecondaryButton height={44} onPress={openScanner}>{scannedIngredients.length ? `Edit or add ingredients (${scannedIngredients.length})` : "Scan barcode"}</SecondaryButton> : null}
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
        <View style={styles.floatingAdd}><PrimaryButton height={54} fontSize={16} onPress={() => openFoodForm(false)}>+ Add food</PrimaryButton></View>
        {sheets}
      </View>
    );
  }

  return (
    <Screen>
      <TitleBar title="Nutrition tracker" onBack={nav.back} />
      {journal}
      <View style={styles.floatingAdd}><PrimaryButton height={54} fontSize={16} onPress={() => openFoodForm(false)}>+ Add food</PrimaryButton></View>
      {sheets}
    </Screen>
  );
}

const styles = StyleSheet.create({
  viewTabs: { flexDirection: "row", gap: 4, padding: 4, borderRadius: 14 },
  viewTab: { flex: 1, minHeight: 44, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  intakeIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  goalPill: { minHeight: 40, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  calorieSummary: { gap: 11, padding: 14, borderRadius: 16 },
  remainingPill: { minWidth: 66, minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: 14, paddingHorizontal: 10 },
  macroTrack: { height: 6, borderRadius: 4, overflow: "hidden", marginTop: 3 },
  floatingAdd: { position: "absolute", left: 18, right: 18, bottom: 14, zIndex: 20 },
  body: { gap: 18, paddingBottom: 30 }, hero: { gap: 5 }, summaryHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }, goalButton: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8 }, macroRow: { flexDirection: "row", gap: 8 }, macroTile: { borderRadius: 12, flex: 1, gap: 2, padding: 10 }, sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, calculatorCallout: { alignItems: "center", borderRadius: 15, borderWidth: 1, flexDirection: "row", gap: 12, padding: 14 }, addButton: { borderRadius: 10, paddingHorizontal: 12 }, mealSection: { gap: 8 }, foodRow: { alignItems: "center", flexDirection: "row", gap: 12 }, foodRight: { alignItems: "flex-end", minWidth: 42 }, savedMeals: { gap: 10 }, savedAddButton: { borderRadius: 9, paddingHorizontal: 12 }, recipeActions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 14 }, keyboardAvoiding: { flex: 1 }, overlay: { backgroundColor: "rgba(0, 0, 0, 0.74)", flex: 1, justifyContent: "flex-end" }, sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, maxHeight: "88%", padding: 18 }, calculatorSheet: { alignSelf: "center", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 18, paddingBottom: 22 }, sheetBody: { gap: 15, paddingBottom: 18 }, sheetHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, mealOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, mealOption: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 9 }, inputRow: { flexDirection: "row", gap: 8 }, inputHalf: { flex: 1 }, goalGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, goalHalf: { minWidth: "46%" },
});
