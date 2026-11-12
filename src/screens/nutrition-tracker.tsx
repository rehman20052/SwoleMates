import { AppAlert as Alert } from "@/components/app-alert";
import { FoodLogSheet } from "@/components/food-log-sheet";
import { HomeBackdrop } from "@/components/home-backdrop";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { AppText, Card, Field, Input, PrimaryButton, Screen, ScrollBody, SecondaryButton, SectionLabel, TitleBar } from "@/components/ui";
import { sumFoodEntries } from "@/lib/food-journal";
import { savedRecipeServing } from "@/lib/food-log-draft";
import { daysFromToday, type FoodLogEntry, type SavedMeal, useAppData } from "@/state/app-data";
import { MacroCalculator, WeightTrendCard } from "@/screens/macro-calculator";
import { SaveFeedback } from "@/components/save-feedback";
import { MacroPlanCard } from "@/components/macro-plan-card";
import { useNavigation } from "@/navigation";
import { Image } from "expo-image";
import { TrainingCard } from "@/components/training-card";
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

function FuelMacroRow({ label, current, target, color, incomplete }: { label: string; current: number; target: number; color: string; incomplete?: boolean }) {
  const theme = useAppTheme();
  const progress = Math.min(1, current / Math.max(1, target));
  return (
    <View style={styles.fuelMacroRow}>
      <View style={styles.fuelMacroMeta}>
        <View style={[styles.fuelMacroDot, { backgroundColor: color }]} />
        <AppText size={13} weight="semibold" style={{ flex: 1 }}>{label}</AppText>
        <AppText size={13} weight="bold" style={{ fontVariant: ["tabular-nums"] }}>
          {incomplete ? "Known " : ""}{Math.round(current)}<AppText size={11} muted> / {target}g</AppText>
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

function FuelDailySummary({ dayLabel, entryCount, calories, calorieGoal, protein, proteinGoal, carbs, carbGoal, fats, fatGoal, onEditGoals, incomplete = [] }: {
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
  incomplete?: string[];
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
    { label: "Protein", current: protein, target: proteinGoal, incomplete: incomplete.includes("protein"), color: theme.colors.protein },
    { label: "Carbs", current: carbs, target: carbGoal, incomplete: incomplete.includes("carbs"), color: theme.colors.carbs },
    { label: "Fat", current: fats, target: fatGoal, incomplete: incomplete.includes("fats"), color: theme.colors.fat },
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
              transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
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
  const { addFoodEntry, deleteFoodEntry, deleteSavedMeal, foodEntries, foodJournalReady, foodJournalError, logWeighIn, nutrition, nutritionProfile, nutritionGoalSource, nutritionPlanReady, nutritionPlanError, recipesReady, recipeStorageError, saveMeal, savedMeals, updateNutrition, updateNutritionProfile } = useAppData();
  const [savingPlan, setSavingPlan] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const addingSavedMeal = useRef(false);
  const savedMealAttempts = useRef(new Map<string, { id: string; serving: ReturnType<typeof savedRecipeServing> }>());
  const lastSavedMeal = useRef<{ key: string; at: number; category: Meal } | null>(null);
  const [addingSavedMealId, setAddingSavedMealId] = useState<string | null>(null);
  const [savedMealFeedback, setSavedMealFeedback] = useState<{ id: string; date: string; account: string | null; message: string; success: boolean } | null>(null);
  const [foodForm, setFoodForm] = useState<{ date: string; recipeOnly: boolean; entry: FoodLogEntry | SavedMeal | null } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showGoals, setShowGoals] = useState(false);
  const [journalTab, setJournalTab] = useState<"Journal" | "Recipes" | "Plan">("Journal");
  useEffect(() => { scrolled.current = false; onScrolledChange?.(false); }, [journalTab, onScrolledChange]);
  const [collapsedMeals, setCollapsedMeals] = useState<Meal[]>([]);
  const [expandedFoodId, setExpandedFoodId] = useState<string | null>(null);
  const [showCalculator, setShowCalculator] = useState(false);
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
      const { id: _id, date: _date, ...savedPortion } = entry;
      const { name } = entry;
      if (!duplicate && !await saveMeal(savedPortion)) {
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

  function openFoodForm(recipeOnly: boolean) {
    setFoodForm({ date: journalDate, recipeOnly, entry: null });
  }

  function openFoodEditor(entry: FoodLogEntry) {
    setFoodForm({ date: entry.date, recipeOnly: false, entry });
  }

  function openRecipeEditor(entry: SavedMeal) {
    setConfirmDeleteId(null);
    setFoodForm({ date: journalDate, recipeOnly: true, entry });
  }

  async function logSavedMeal(recipe: SavedMeal, targetDate: string): Promise<Meal | null> {
    if (addingSavedMeal.current || !foodJournalReady || !accountUserId) return null;
    const key = JSON.stringify([accountUserId, targetDate, recipe.id]);
    const last = lastSavedMeal.current;
    if (last?.key === key && Date.now() - last.at < 750) return last.category;
    const attempt = savedMealAttempts.current.get(key) ?? {
      id: `food-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      serving: savedRecipeServing(recipe),
    };
    savedMealAttempts.current.set(key, attempt);
    addingSavedMeal.current = true; setAddingSavedMealId(recipe.id);
    try {
      if (!await addFoodEntry(attempt.serving, targetDate, attempt.id)) return null;
      savedMealAttempts.current.delete(key);
      lastSavedMeal.current = { key, at: Date.now(), category: attempt.serving.meal };
      return attempt.serving.meal;
    } catch {
      return null;
    } finally {
      addingSavedMeal.current = false; setAddingSavedMealId(null);
    }
  }

  async function addSavedMeal(recipe: SavedMeal) {
    if (addingSavedMeal.current) return;
    setSavedMealFeedback(null);
    const category = await logSavedMeal(recipe, journalDate);
    setSavedMealFeedback({ id: recipe.id, date: journalDate, account: accountUserId, success: Boolean(category),
      message: category ? `${recipe.name} logged to ${category.toLowerCase()}.` : `Could not log ${recipe.name}. Please try again.` });
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
        {journalTab === "Journal" ? <SaveFeedback area="food" hideSaved /> : journalTab === "Recipes" ? <SaveFeedback area="recipes" hideSaved /> : null}

        <View accessibilityRole="tablist" style={[styles.viewTabs, { backgroundColor: theme.colors.segmentSurface, borderColor: theme.colors.panelBorder }]}>
          {journalTabs.map(tab => {
            const selected = journalTab === tab.value;
            return <Pressable key={tab.value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setJournalTab(tab.value)} style={({ pressed }) => [styles.viewTab, selected && { backgroundColor: theme.colors.surfaceRaised }, pressed && { opacity: 0.72 }]}><AppText size={13} weight={selected ? "extrabold" : "semibold"} primary={selected} muted={!selected}>{tab.label}</AppText></Pressable>;
          })}
        </View>
        {journalTab === "Journal" && foodJournalReady ? <FuelDailySummary
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
          incomplete={[...new Set(todayEntries.flatMap(entry => entry.incompleteNutrients ?? []))]}
          onEditGoals={openGoals}
        /> : null}
        {journalTab === "Plan" ? <>
        <MacroPlanCard calories={currentNutrition.calorieGoal} protein={currentNutrition.proteinGoal} carbs={currentNutrition.carbGoal} fat={currentNutrition.fatGoal}
          manual={nutritionGoalSource === "manual"} progressLabel={isToday ? "Today's macros" : "Macros for this day"} onEdit={openGoals} consumed={{ calories: currentNutrition.calories, protein: currentNutrition.protein, carbs: currentNutrition.carbs, fats: currentNutrition.fats }} goal={nutritionProfile?.goal} hasPlan={Boolean(nutritionProfile)} disabled={!nutritionPlanReady || savingPlan} onPress={() => setShowCalculator(true)} />
        <SaveFeedback area="plan" />
        {nutritionProfile && isToday ? (
          <WeightTrendCard
            profile={nutritionProfile}
            manual={nutritionGoalSource === "manual"}
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
        ) : todayEntries.length === 0 ? <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start with your first meal"
          disabled={!foodJournalReady}
          onPress={() => openFoodForm(false)}
          style={({ pressed }) => [styles.journalEmpty, { backgroundColor: theme.colors.insetSurface }, pressed && { opacity: 0.72 }]}
        >
          <View style={styles.journalEmptyHeader}>
            <View style={[styles.emptyStateMark, { backgroundColor: theme.colors.primaryTint }]}><AppText size={22} weight="black" primary>+</AppText></View>
            <View style={{ flex: 1, gap: 3 }}><AppText size={15} weight="extrabold">Start with your first meal</AppText><AppText size={12} muted>Log it once. We’ll keep the day’s numbers moving.</AppText></View>
          </View>
        </Pressable> : null}
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
              </View>
              {!collapsedMeals.includes(mealName) && entries.map((entry) => (
                <View key={entry.id} style={{ borderTopWidth: 1, borderColor: theme.colors.border, paddingTop: 12, gap: 8 }}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`${entry.name}, ${Math.round(entry.calories)} calories, show details`} accessibilityState={{ expanded: expandedFoodId === entry.id }} onPress={() => setExpandedFoodId(current => current === entry.id ? null : entry.id)} style={[styles.foodRow, { minHeight: 48 }]}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <AppText weight="bold">{entry.name}</AppText>
                      <AppText size={12} muted>{entry.incompleteNutrients?.length ? "Known amounts · " : ""}{entry.protein}g protein · {entry.carbs}g carbs · {entry.fats}g fat{entry.incompleteNutrients?.length ? " · macros incomplete" : ""}</AppText>
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
                    <SecondaryButton height={44} fontSize={12} style={styles.savedAddButton} accessibilityLabel={`Add 1 serving of ${savedMeal.name} ${isToday ? "to today" : "to this day"}`} disabled={!foodJournalReady || addingSavedMealId !== null} onPress={() => void addSavedMeal(savedMeal)}>
                      {addingSavedMealId === savedMeal.id ? "Adding…" : "Add 1 serving"}
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
      {foodForm ? <FoodLogSheet visible {...foodForm} addingSavedMealId={addingSavedMealId} onAddSavedMeal={logSavedMeal} onClose={() => setFoodForm(null)} /> : null}

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
