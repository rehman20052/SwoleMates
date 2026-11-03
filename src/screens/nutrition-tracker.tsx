import { AppAlert as Alert } from "@/components/app-alert";
import { FoodScanner } from "@/components/food-scanner";
import { ingredientTotals, scannedIngredient, type ScanIngredient } from "@/lib/food-scanner";
import { HomeBackdrop } from "@/components/home-backdrop";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { AppText, Card, Field, Input, PrimaryButton, Screen, ScrollBody, SecondaryButton, SectionLabel, TitleBar } from "@/components/ui";
import { sumFoodEntries } from "@/lib/food-journal";
import { daysFromToday, type FoodLogEntry, type SavedMeal, useAppData } from "@/state/app-data";
import { MacroCalculator, WeightTrendCard } from "@/screens/macro-calculator";
import { SaveFeedback } from "@/components/save-feedback";
import { FoodSearch } from "@/components/food-search";
import { MacroPlanCard } from "@/components/macro-plan-card";
import type { FoodChoice } from "@/lib/food-search";
import { useNavigation } from "@/navigation";
import { Image } from "expo-image";
import { TrainingCard } from "@/components/training-card";
import { saveArtworkPhoto, type ArtworkDraft } from "@/lib/artwork-photo";
import { useAppTheme } from "@/theme";

type Meal = FoodLogEntry["meal"];
type Macro = "protein" | "carbs" | "fats";

const meals: Meal[] = ["Breakfast", "Lunch", "Dinner", "Snack"];
function numberFrom(value: string) {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function macroLabel(macro: Macro) {
  return macro === "fats" ? "Fat" : macro[0].toUpperCase() + macro.slice(1);
}

const journalTabs = [
  { value: "Journal", label: "Today" },
  { value: "Plan", label: "Plan" },
  { value: "Recipes", label: "Recipes" },
] as const;

function FuelMacroRow({ label, current, target, color }: { label: string; current: number; target: number; color: string }) {
  const theme = useAppTheme();
  const progress = Math.min(1, current / Math.max(1, target));
  return (
    <View style={styles.fuelMacroRow}>
      <View style={styles.fuelMacroMeta}>
        <View style={[styles.fuelMacroDot, { backgroundColor: color }]} />
        <AppText size={13} weight="semibold" style={{ flex: 1 }}>{label}</AppText>
        <AppText size={13} weight="bold" style={{ fontVariant: ["tabular-nums"] }}>
          {Math.round(current)}<AppText size={11} muted> / {target}g</AppText>
        </AppText>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={`${label} progress`}
        accessibilityValue={{ min: 0, max: target, now: Math.min(Math.round(current), target) }}
        style={[styles.fuelMacroTrack, { backgroundColor: theme.colors.progressTrack }]}
      >
        <View style={[styles.fuelMacroFill, { width: `${progress * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function FuelDailySummary({ dayLabel, entryCount, calories, calorieGoal, protein, proteinGoal, carbs, carbGoal, fats, fatGoal, onEditGoals }: {
  dayLabel: string;
  entryCount: number;
  calories: number;
  calorieGoal: number;
  protein: number;
  proteinGoal: number;
  carbs: number;
  carbGoal: number;
  fats: number;
  fatGoal: number;
  onEditGoals: () => void;
}) {
  const theme = useAppTheme();
  const overGoal = calories > calorieGoal;
  const progress = Math.min(1, calories / Math.max(1, calorieGoal));
  const remaining = Math.abs(Math.round(calorieGoal - calories));
  const ringSize = 108;
  const ringRadius = 45;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringColor = overGoal ? theme.colors.warning : theme.colors.accent;
  const macros = [
    { label: "Protein", current: protein, target: proteinGoal, color: theme.colors.protein },
    { label: "Carbs", current: carbs, target: carbGoal, color: theme.colors.carbs },
    { label: "Fat", current: fats, target: fatGoal, color: theme.colors.fat },
  ];

  return (
    <View style={[styles.fuelSummary, { backgroundColor: theme.colors.surface, borderColor: theme.colors.panelBorder, boxShadow: theme.effects.cardShadow }]}>
      <View style={styles.sectionHeader}>
        <View style={{ gap: 2 }}>
          <AppText size={12} weight="bold" muted upper>{dayLabel}</AppText>
          <AppText size={22} weight="extrabold">Daily fuel</AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit nutrition goals"
          onPress={onEditGoals}
          style={({ pressed }) => [styles.fuelEditGoals, { backgroundColor: theme.colors.actionSurface, opacity: pressed ? 0.68 : 1 }]}
        >
          <AppText size={12} weight="bold" primary>Edit goals</AppText>
        </Pressable>
      </View>

      <View style={styles.fuelEnergyRow}>
        <View style={{ flex: 1, gap: 5 }}>
          <AppText size={12} muted>{entryCount ? `${entryCount} food${entryCount === 1 ? "" : "s"} logged` : "Ready when you are"}</AppText>
          <AppText size={42} weight="black" style={{ fontVariant: ["tabular-nums"] }}>
            {Math.round(calories).toLocaleString()}
          </AppText>
          <AppText size={12} muted>of {calorieGoal.toLocaleString()} kcal</AppText>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Daily calorie progress"
          aria-valuemin={0}
          aria-valuemax={calorieGoal}
          aria-valuenow={Math.min(Math.round(calories), calorieGoal)}
          accessibilityValue={{ min: 0, max: calorieGoal, now: Math.min(Math.round(calories), calorieGoal), text: `${Math.round(calories)} of ${calorieGoal} calories consumed` }}
          style={[styles.fuelRing, { backgroundColor: overGoal ? theme.colors.warningTint : theme.colors.insetSurface }]}
        >
          <Svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`} style={StyleSheet.absoluteFill}>
            <Circle cx={ringSize / 2} cy={ringSize / 2} r={ringRadius} fill="none" stroke={theme.colors.progressTrack} strokeWidth={8} />
            <Circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={ringRadius}
              fill="none"
              stroke={ringColor}
              strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={`${ringCircumference} ${ringCircumference}`}
              strokeDashoffset={ringCircumference * (1 - progress)}
              rotation={-90}
              origin={`${ringSize / 2}, ${ringSize / 2}`}
            />
          </Svg>
          <AppText size={22} weight="black" color={ringColor} style={{ fontVariant: ["tabular-nums"] }}>{remaining.toLocaleString()}</AppText>
          <AppText size={9} weight="bold" color={ringColor} upper>{overGoal ? "over" : "left"}</AppText>
        </View>
      </View>

      <View style={[styles.fuelDivider, { backgroundColor: theme.colors.border }]} />
      <View style={{ gap: 14 }}>
        <View style={styles.sectionHeader}>
          <AppText size={12} weight="bold" muted upper>Macro progress</AppText>
          <AppText size={11} muted>{Math.round(progress * 100)}% calories</AppText>
        </View>
        {macros.map((macro) => <FuelMacroRow key={macro.label} {...macro} />)}
      </View>
    </View>
  );
}

export function NutritionTrackerScreen({ embedded = false, header, date, onScrolledChange }: { embedded?: boolean; header?: ReactNode; date?: string; onScrolledChange?: (scrolled: boolean) => void }) {
  const theme = useAppTheme();
  const frame = useWindowDimensions();
  const scrolled = useRef(false);

  const nav = useNavigation();
  const framed = Platform.OS === "web" && frame.width > 450;
  const phoneHeight = Math.min(874, frame.height - 32);
  const { addFoodEntry, updateFoodEntry, deleteFoodEntry, deleteSavedMeal, foodEntries, foodJournalReady, foodJournalError, logWeighIn, nutrition, nutritionProfile, nutritionGoalSource, nutritionPlanReady, nutritionPlanError, recipesReady, recipeStorageError, saveMeal, savedMeals, updateNutrition, updateNutritionProfile, updateSavedMeal } = useAppData();
  const [savingPlan, setSavingPlan] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const addingSavedMeal = useRef(false);
  const [addingSavedMealId, setAddingSavedMealId] = useState<string | null>(null);
  const [savedMealFeedback, setSavedMealFeedback] = useState<{ id: string; date: string; account: string | null; message: string; success: boolean } | null>(null);
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
  useEffect(() => { scrolled.current = false; onScrolledChange?.(false); }, [journalTab, onScrolledChange]);
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
  const [copyingMeal, setCopyingMeal] = useState(false);
  const [copySource, setCopySource] = useState<Meal>("Breakfast");
  const [copyDestination, setCopyDestination] = useState<Meal>("Breakfast");
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [journalNotice, setJournalNotice] = useState<string | null>(null);
  const savingPortion = useRef(false);
  const [savingPortionId, setSavingPortionId] = useState<string | null>(null);
  useEffect(() => { if (!undo) return; const timer = setTimeout(() => setUndo(null), Math.max(0, undo.until - Date.now())); return () => clearTimeout(timer); }, [undo]);
  useEffect(() => { setUndo(null); setCopying(false); setShortcutError(null); setJournalNotice(null); }, [accountUserId, date]);
  const favorites = workspaceSettings.flatMap(item => {
    if (!item.id.startsWith("favorite-food:") || typeof item.value !== "object" || !item.value.content) return [];
    try { const food = JSON.parse(item.value.content) as FoodLogEntry; return [{ settingId: item.id, food }]; } catch { return []; }
  });
  async function saveShortcut(id: string, content: string) {
    if (!accountUserId) {
      setShortcutError("Sign in to save this change.");
      return false;
    }
    const saved = await saveWorkspaceSetting(id, content, accountUserId, Date.now());
    setShortcutError(saved ? null : "Could not save this change."); return saved;
  }
  async function savePortionAsMeal(entry: FoodLogEntry, legacySettingId?: string) {
    if (savingPortion.current || !recipesReady || !accountUserId) return;
    savingPortion.current = true; setSavingPortionId(entry.id);
    setShortcutError(null); setJournalNotice(null);
    try {
      const duplicate = savedMeals.some(meal => meal.name.trim().toLowerCase() === entry.name.trim().toLowerCase()
        && meal.meal === entry.meal && meal.calories === entry.calories && meal.protein === entry.protein && meal.carbs === entry.carbs && meal.fats === entry.fats);
      const { name, meal, calories, protein, carbs, fats, artwork, scannedIngredients } = entry;
      if (!duplicate && !await saveMeal({ name, meal, calories, protein, carbs, fats, artwork, scannedIngredients })) {
        setShortcutError('Could not save this meal. Please try again.'); return;
      }
      // Existing favorites can be moved without losing them if the meal save fails.
      if (legacySettingId) await saveShortcut(legacySettingId, '');
      setJournalNotice(duplicate ? `${name} is already in saved recipes.` : `${name} saved as a meal. Find it in Recipes.`);
    } catch { setShortcutError('Could not save this meal. Please try again.'); }
    finally { savingPortion.current = false; setSavingPortionId(null); }
  }
  async function removeFood(entry: FoodLogEntry) {
    if (await deleteFoodEntry(entry.id)) setUndo({ entry, until: Date.now() + 10000 });
  }

  const journalDate = date ?? daysFromToday(0);
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
  const yesterdayMealOptions = useMemo(
    () => meals.filter((mealName) => foodEntries.some((entry) => entry.date === yesterdayDate && entry.meal === mealName)),
    [foodEntries, yesterdayDate],
  );

  const entriesByMeal = useMemo(
    () => meals.map((mealName) => ({ meal: mealName, entries: todayEntries.filter((entry) => entry.meal === mealName) })),
    [todayEntries],
  );

  if (!nutrition) return null;
  const currentNutrition = { ...nutrition, ...sumFoodEntries(foodEntries, journalDate) };
  const canRepeatYesterday = foodJournalReady && yesterdayMealOptions.length > 0;

  function toggleMealCopy() {
    setShortcutError(null);
    setJournalNotice(null);
    if (copying) {
      setCopying(false);
      return;
    }
    const firstAvailableMeal = yesterdayMealOptions[0];
    if (!firstAvailableMeal) {
      setShortcutError("There are no meals logged yesterday to repeat.");
      return;
    }
    setCopySource(firstAvailableMeal);
    setCopyDestination(firstAvailableMeal);
    setCopying(true);
  }

  async function repeatMeal() {
    if (copyingMeal) return;
    const sourceCount = foodEntries.filter((entry) => entry.date === yesterdayDate && entry.meal === copySource).length;
    if (!sourceCount) {
      setShortcutError("That meal no longer has any foods to copy.");
      return;
    }
    setCopyingMeal(true);
    setShortcutError(null);
    setJournalNotice(null);
    try {
      const saved = await copyFoodMeal(yesterdayDate, copySource, journalDate, copyDestination);
      if (!saved) {
        setShortcutError("Could not copy that meal. Try again.");
        return;
      }
      setCopying(false);
      setJournalNotice(`${copySource} copied to ${copyDestination} (${sourceCount} item${sourceCount === 1 ? "" : "s"}).`);
    } finally {
      setCopyingMeal(false);
    }
  }

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

  function openBarcodeForm() {
    openFoodForm(false);
    setShowScanner(true);
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
    for (const [index, item] of scannedIngredients.entries()) {
      const label = `Ingredient ${index + 1}${item.name.trim() ? ` (${item.name.trim()})` : ""}`;
      if (!item.name.trim()) return `${label}: enter a food name.`;
      const amount = Number(item.servings.trim().replace(",", "."));
      if (!item.servings.trim() || !Number.isFinite(amount) || amount <= 0 || amount > 100) return `${label}: enter a serving amount greater than 0 and no more than 100 servings.`;
      for (const key of ["calories", "protein", "carbs", "fats"] as const) {
        const value = Number(item[key].trim().replace(",", "."));
        if (!item[key].trim() || !Number.isFinite(value) || value < 0 || value > 100000) return `${label}: enter valid ${key === "fats" ? "fat" : key} (0 is allowed).`;
      }
    }
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

  async function addSavedMeal(savedMeal: SavedMeal) {
    if (addingSavedMeal.current || !foodJournalReady) return;
    addingSavedMeal.current = true;
    setAddingSavedMealId(savedMeal.id);
    setSavedMealFeedback(null);
    const targetDate = journalDate;
    const targetAccount = accountUserId;
    const targetLabel = dayLabel.toLowerCase();
    try {
    const added = await addFoodEntry({
      scannedIngredients: savedMeal.scannedIngredients,
      artwork: savedMeal.artwork,
      meal: savedMeal.meal,
      name: savedMeal.name,
      calories: savedMeal.calories,
      protein: savedMeal.protein,
      carbs: savedMeal.carbs,
      fats: savedMeal.fats,
    }, targetDate);
    setSavedMealFeedback({ id: savedMeal.id, date: targetDate, account: targetAccount, success: added, message: added
      ? `Added ${savedMeal.name} (${savedMeal.calories} cal) to ${savedMeal.meal.toLowerCase()} for ${targetLabel}. Your daily intake is updated.`
      : "Could not add this recipe. Please try again." });
    } catch {
      setSavedMealFeedback({ id: savedMeal.id, date: targetDate, account: targetAccount, success: false, message: "Could not add this recipe. Please try again." });
    } finally {
      addingSavedMeal.current = false;
      setAddingSavedMealId(null);
    }
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

  const fuelActions = (
    <View style={[styles.fuelActionBar, { backgroundColor: theme.colors.background, borderTopColor: theme.colors.border }]}>
      <View style={styles.fuelIntroActions}>
        {Platform.OS === "web" ? (
          <SecondaryButton
            accessibilityLabel="Scan a food barcode"
            disabled={!foodJournalReady}
            height={46}
            style={[styles.fuelIntroButton, { opacity: foodJournalReady ? 1 : 0.5 }]}
            onPress={openBarcodeForm}
          >
            Scan barcode
          </SecondaryButton>
        ) : null}
        <PrimaryButton
          accessibilityLabel="Log food"
          disabled={!foodJournalReady}
          height={46}
          style={[styles.fuelIntroButton, { opacity: foodJournalReady ? 1 : 0.5 }]}
          onPress={() => openFoodForm(false)}
        >
          Log food
        </PrimaryButton>
      </View>
    </View>
  );

  const journal = (
      <ScrollBody key={journalTab} contentContainerStyle={styles.body} scrollEventThrottle={16} onScroll={event => {
        const next = event.nativeEvent.contentOffset.y > 0;
        if (next !== scrolled.current) { scrolled.current = next; onScrolledChange?.(next); }
      }}>
        <View style={styles.fuelIntro}>
          <View style={{ flex: 1, minWidth: 220, gap: 8 }}>
            <AppText size={frame.width > 700 ? 44 : 34} weight="black">
              Fuel<AppText size={frame.width > 700 ? 44 : 34} weight="black" primary>.</AppText>
            </AppText>
            <AppText size={15} muted>Eat with intent. Recover. Come back stronger.</AppText>
          </View>

        </View>
        {!nutritionPlanReady ? <AppText muted>Loading saved daily targets...</AppText> : null}
        {nutritionPlanError ? <AppText color={theme.colors.danger}>{nutritionPlanError}</AppText> : null}
        {recipeStorageError ? <AppText size={13} color={theme.colors.danger}>{recipeStorageError}</AppText> : null}
        {foodJournalError ? <AppText size={13} color={theme.colors.danger}>{foodJournalError}</AppText> : null}

        <View accessibilityRole="tablist" style={[styles.viewTabs, { backgroundColor: theme.colors.segmentSurface, borderColor: theme.colors.panelBorder }]}>
          {journalTabs.map(tab => {
            const selected = journalTab === tab.value;
            return <Pressable key={tab.value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setJournalTab(tab.value)} style={({ pressed }) => [styles.viewTab, selected && { backgroundColor: theme.colors.surfaceRaised }, pressed && { opacity: 0.72 }]}><AppText size={13} weight={selected ? "extrabold" : "semibold"} primary={selected} muted={!selected}>{tab.label}</AppText></Pressable>;
          })}
        </View>
        {journalTab === "Journal" ? <FuelDailySummary
          dayLabel={dayLabel}
          entryCount={todayEntries.length}
          calories={currentNutrition.calories}
          calorieGoal={currentNutrition.calorieGoal}
          protein={currentNutrition.protein}
          proteinGoal={currentNutrition.proteinGoal}
          carbs={currentNutrition.carbs}
          carbGoal={currentNutrition.carbGoal}
          fats={currentNutrition.fats}
          fatGoal={currentNutrition.fatGoal}
          onEditGoals={openGoals}
        /> : null}
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
        <View style={[styles.sectionHeader, { flexWrap: "wrap", gap: 12 }]}>
          <View style={{ flex: 1, minWidth: 140, gap: 2 }}>
            <AppText size={20} weight="extrabold">Food journal</AppText>
            <AppText size={13} muted>{todayEntries.length ? `${todayEntries.length} item${todayEntries.length === 1 ? "" : "s"} logged ${isToday ? "today" : "for this day"}` : "Meals and snacks will appear here"}</AppText>
          </View>
        </View>
        {!foodJournalReady ? (
          <View style={[styles.journalEmpty, { backgroundColor: theme.colors.insetSurface }]}>
            <AppText size={13} muted>Loading your food journal…</AppText>
          </View>
        ) : todayEntries.length === 0 ? <View style={[styles.journalEmpty, { backgroundColor: theme.colors.insetSurface }]}>
          <View style={styles.journalEmptyHeader}>
            <View style={[styles.emptyStateMark, { backgroundColor: theme.colors.primaryTint }]}><AppText size={22} weight="black" primary>+</AppText></View>
            <View style={{ flex: 1, gap: 3 }}><AppText size={15} weight="extrabold">Start with your first meal</AppText><AppText size={12} muted>Log it once. We’ll keep the day’s numbers moving.</AppText></View>
          </View>
        </View> : null}
        {canRepeatYesterday || copying ? (
          <View style={styles.journalActions}>
            {canRepeatYesterday || copying ? (
            <SecondaryButton
              accessibilityLabel="Copy a meal from yesterday"
              accessibilityState={{ disabled: copyingMeal, expanded: copying }}
              disabled={copyingMeal}
              height={44}
              fontSize={12}
              onPress={toggleMealCopy}
              style={[styles.journalActionButton, { opacity: copyingMeal ? 0.5 : 1 }]}
            >
              {copying ? "Close repeat" : "Repeat a meal"}
            </SecondaryButton>
            ) : null}
          </View>
        ) : null}
        {copying ? <TrainingCard padding={14} gap={12}>
          <View style={{ gap: 3 }}><AppText size={15} weight="extrabold">Repeat yesterday's meal</AppText><AppText size={12} muted>Choose what to copy and where it should go today.</AppText></View>
          <Field label="From yesterday"><View style={styles.mealOptions}>{yesterdayMealOptions.map(option => <SecondaryButton key={option} height={40} fontSize={12} disabled={copyingMeal} onPress={() => setCopySource(option)}>{copySource === option ? `✓ ${option}` : option}</SecondaryButton>)}</View></Field>
          <Field label={isToday ? "Add to today" : "Add to this day"}><View style={styles.mealOptions}>{meals.map(option => <SecondaryButton key={option} height={40} fontSize={12} disabled={copyingMeal} onPress={() => setCopyDestination(option)}>{copyDestination === option ? `✓ ${option}` : option}</SecondaryButton>)}</View></Field>
          <PrimaryButton disabled={copyingMeal} style={{ opacity: copyingMeal ? 0.55 : 1 }} onPress={() => void repeatMeal()}>{copyingMeal ? "Copying meal…" : "Copy meal"}</PrimaryButton>
        </TrainingCard> : null}
        {favorites.length ? <TrainingCard padding={12} gap={8}><AppText weight="bold">Previously favorited portions</AppText>{favorites.map(({ settingId,food }) => <View key={settingId} style={{ gap: 6 }}><AppText>{food.name} · {food.calories} cal</AppText><SecondaryButton disabled={!recipesReady || savingPortionId !== null} onPress={() => void savePortionAsMeal(food, settingId)}>Save as meal in Recipes</SecondaryButton><Pressable accessibilityRole="button" accessibilityLabel={`Remove ${food.name} from favorites`} onPress={() => void saveShortcut(settingId, "")}><AppText size={12} muted>Remove</AppText></Pressable></View>)}</TrainingCard> : null}
        {undo ? <TrainingCard padding={12} gap={8}><AppText>{undo.entry.name} deleted</AppText><SecondaryButton onPress={async () => { if (Date.now() >= undo.until) { setUndo(null); return; } if (await restoreFoodEntry(undo.entry)) setUndo(null); }}>Undo (10 seconds)</SecondaryButton></TrainingCard> : null}
        {journalNotice ? <View accessibilityLiveRegion="polite"><AppText size={13} weight="semibold" color={theme.colors.success}>{journalNotice}</AppText></View> : null}
        {journalNotice?.includes('saved') ? <SecondaryButton onPress={() => setJournalTab('Recipes')}>View saved recipes</SecondaryButton> : null}
        {shortcutError ? <View accessibilityLiveRegion="assertive"><AppText size={13} weight="semibold" color={theme.colors.danger}>{shortcutError}</AppText></View> : null}
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
                  <Pressable accessibilityRole="button" accessibilityLabel={`Save ${entry.name} as a meal`} disabled={!recipesReady || !accountUserId || savingPortionId !== null} onPress={() => void savePortionAsMeal(entry)} style={{ minHeight:44,justifyContent:"center", opacity: recipesReady && savingPortionId === null ? 1 : 0.5 }}><AppText size={12} primary>{savingPortionId === entry.id ? 'Saving…' : 'Save as meal'}</AppText></Pressable>
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
                    <SecondaryButton height={34} fontSize={12} style={styles.savedAddButton} disabled={!foodJournalReady || addingSavedMealId !== null} onPress={() => void addSavedMeal(savedMeal)}>
                      {addingSavedMealId === savedMeal.id ? "Adding..." : isToday ? "Add to today" : "Add to this day"}
                    </SecondaryButton>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${savedMeal.name}`} hitSlop={6} onPress={() => openRecipeEditor(savedMeal)}>
                      <AppText size={13} weight="extrabold" primary>Edit</AppText>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${savedMeal.name}`} hitSlop={6} onPress={() => setConfirmDeleteId(savedMeal.id)}>
                      <AppText size={13} weight="bold" color={theme.colors.danger}>Delete</AppText>
                    </Pressable>
                  </View>
                )}
                {savedMealFeedback?.id === savedMeal.id && savedMealFeedback.date === journalDate && savedMealFeedback.account === accountUserId ? (
                  <View accessibilityLiveRegion="polite">
                    <AppText size={13} weight="semibold" color={savedMealFeedback.success ? theme.colors.success : theme.colors.danger}>{savedMealFeedback.message}</AppText>
                  </View>
                ) : null}
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
                    {!catalogFood ? <Field label={`Servings (${item.basis})`}><Input bordered accessibilityLabel={`Servings for ingredient ${index + 1}`} value={item.servings} keyboardType="decimal-pad" onChangeText={value => editManualIngredient(item.id, { servings: value })} /></Field> : null}
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
                  <View style={{ flex: 1, gap: 7 }}><AppText size={12} weight="bold" muted>MEAL</AppText><View style={styles.mealOptions}>{meals.map((option) => <Pressable key={option} accessibilityRole="button" accessibilityLabel={`Use ${option}`} accessibilityState={{ selected: meal === option }} onPress={() => setMeal(option)} style={[styles.mealOption, { borderColor: meal === option ? theme.colors.primary : theme.colors.border, backgroundColor: meal === option ? theme.colors.primaryTint : theme.colors.surfaceRaised }]}><AppText size={12} weight="bold" primary={meal === option}>{option}</AppText></Pressable>)}</View></View>
                  <FoodSearch entries={[]} recipes={[]} ready onSelect={useCommonFood} mode="find" compact />
                </View> : <Field label="Meal">
                  <View style={styles.mealOptions}>{meals.map((option) => <Pressable key={option} accessibilityRole="button" accessibilityLabel={`Use ${option}`} accessibilityState={{ selected: meal === option }} onPress={() => setMeal(option)} style={[styles.mealOption, { borderColor: meal === option ? theme.colors.primary : theme.colors.border, backgroundColor: meal === option ? theme.colors.primaryTint : theme.colors.surfaceRaised }]}><AppText size={12} weight="bold" primary={meal === option}>{option}</AppText></Pressable>)}</View>
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
                  <View style={styles.mealOptions}>{meals.map((option) => <Pressable key={option} accessibilityRole="button" accessibilityLabel={`Use ${option}`} accessibilityState={{ selected: meal === option }} onPress={() => setMeal(option)} style={[styles.mealOption, { borderColor: meal === option ? theme.colors.primary : theme.colors.border, backgroundColor: meal === option ? theme.colors.primaryTint : theme.colors.surfaceRaised }]}><AppText size={12} weight="bold" primary={meal === option}>{option}</AppText></Pressable>)}</View>
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
        {fuelActions}
        {sheets}
      </View>
    );
  }

  return (
    <Screen>
      <TitleBar title="Nutrition tracker" onBack={nav.back} />
      {journal}
      {fuelActions}
      {sheets}
    </Screen>
  );
}

const styles = StyleSheet.create({
  viewTabs: { flexDirection: "row", gap: 4, padding: 4, borderRadius: 16, borderCurve: "continuous", borderWidth: 1 },
  viewTab: { flex: 1, minHeight: 42, borderRadius: 12, borderCurve: "continuous", alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  fuelSummary: { borderRadius: 22, borderCurve: "continuous", borderWidth: 1, gap: 18, padding: 18 },
  fuelEditGoals: { minHeight: 40, paddingHorizontal: 13, alignItems: "center", justifyContent: "center", borderRadius: 12, borderCurve: "continuous" },
  fuelEnergyRow: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 112 },
  fuelRing: { width: 108, height: 108, borderRadius: 54, alignItems: "center", justifyContent: "center" },
  fuelDivider: { height: StyleSheet.hairlineWidth, width: "100%" },
  fuelMacroRow: { gap: 7 },
  fuelMacroMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  fuelMacroDot: { width: 7, height: 7, borderRadius: 4 },
  fuelMacroTrack: { height: 7, borderRadius: 4, overflow: "hidden" },
  fuelMacroFill: { height: "100%", borderRadius: 4 },
  fuelIntro: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 20, paddingTop: 8, paddingBottom: 6 },
  fuelActionBar: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  fuelIntroActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, flexGrow: 1, justifyContent: "flex-end" },
  fuelIntroButton: { flexGrow: 1, minWidth: 126 },
  journalEmpty: { gap: 14, padding: 16, borderRadius: 18, borderCurve: "continuous" },
  journalEmptyHeader: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12 },
  emptyStateMark: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  journalActions: { flexDirection: "row", gap: 8 },
  journalActionButton: { flex: 1, minWidth: 0, paddingHorizontal: 8 },
  body: { gap: 16, paddingBottom: 30 },
  sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  foodRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  foodRight: { alignItems: "flex-end", minWidth: 42 },
  savedMeals: { gap: 10 },
  savedAddButton: { borderRadius: 9, paddingHorizontal: 12 },
  recipeActions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 14 },
  keyboardAvoiding: { flex: 1 },
  overlay: { backgroundColor: "rgba(0, 0, 0, 0.74)", flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, maxHeight: "88%", padding: 18 },
  calculatorSheet: { alignSelf: "center", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 18, paddingBottom: 22 },
  sheetBody: { gap: 15, paddingBottom: 18 },
  sheetHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  mealOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mealOption: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 9 },
  inputRow: { flexDirection: "row", gap: 8 },
  inputHalf: { flex: 1 },
  goalGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  goalHalf: { minWidth: "46%" },
});
