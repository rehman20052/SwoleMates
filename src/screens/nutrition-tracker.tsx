import { HomeBackdrop } from "@/components/home-backdrop";
import { type ReactNode, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import { AppText, Card, Field, Input, PrimaryButton, ProgressBar, Screen, ScrollBody, SecondaryButton, SectionLabel, TitleBar } from "@/components/ui";
import { sumFoodEntries } from "@/lib/food-journal";
import { daysFromToday, type FoodLogEntry, type NutritionTotals, type SavedMeal, useAppData } from "@/state/app-data";
import { MacroCalculator, WeightTrendCard } from "@/screens/macro-calculator";
import { SaveFeedback } from "@/components/save-feedback";
import { FoodSearch } from "@/components/food-search";
import { FuelThumbnail } from "@/components/fuel-thumbnail";
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
  const parsed = Number(value.replace(/[^\d]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
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
  const { addFoodEntry, updateFoodEntry, deleteFoodEntry, deleteSavedMeal, foodEntries, foodJournalReady, foodJournalError, logWeighIn, nutrition, nutritionProfile, nutritionPlanReady, nutritionPlanError, recipesReady, recipeStorageError, saveMeal, savedMeals, updateNutrition, updateNutritionProfile, updateSavedMeal } = useAppData();
  const [savingPlan, setSavingPlan] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [showAddFood, setShowAddFood] = useState(false);
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

  async function saveFood(recipeOnly = false) {
    if (savingRecipe || (recipeOnly ? !recipesReady : !foodJournalReady)) return;
    const trimmedName = name.trim();
    const calorieValue = numberFrom(calories);
    if (!trimmedName || calorieValue <= 0) {
      setFormError("Enter a name and calories greater than zero.");
      return;
    }
    const entry = {
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
    setArtwork(food.artwork);
    setMeal(food.meal); setName(food.name);
    setCalories(`${food.calories}`); setProtein(`${food.protein}`);
    setCarbs(`${food.carbs}`); setFats(`${food.fats}`);
  }

  function openRecipeEditor(saved: SavedMeal) {
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
        <View style={[styles.hero, { minHeight: 132, padding: 18, justifyContent: "center", overflow: "hidden", borderRadius: 16 }]}>
          <HomeBackdrop source={require("../../assets/brand/fuel-hero.jpg")} opacity={theme.effects.fuelHeroOpacity} />
          <SectionLabel color={theme.colors.photoAccent}>{dayLabel}</SectionLabel>
          <AppText size={29} weight="black" color={theme.colors.photoText}>{isToday ? "Fuel your training." : "Your food journal."}</AppText>
          <AppText size={12} color={theme.colors.photoMuted}>{isToday ? "Good nutrition. Better training." : "Meals and macros for this day."}</AppText>
          {!nutritionPlanReady ? <AppText color={theme.colors.photoMuted}>Loading saved daily targets…</AppText> : null}
          {nutritionPlanError ? <AppText color={theme.colors.photoText}>{nutritionPlanError}</AppText> : null}
        </View>
        {recipeStorageError ? <AppText size={13} color={theme.colors.danger}>{recipeStorageError}</AppText> : null}
        {foodJournalError ? <AppText size={13} color={theme.colors.danger}>{foodJournalError}</AppText> : null}

        {isToday ? (
        <>
        <TrainingCard padding={16} gap={12} style={{ borderColor: theme.colors.primary }}>
        <View style={[styles.sectionHeader, { flexWrap: "wrap", gap: 12 }]}>
          <View style={{ flex: 1, minWidth: 140 }}>
            <AppText size={20} weight="extrabold">Macro plan</AppText>
          </View>
        </View>
        <SaveFeedback area="plan" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={nutritionProfile ? "Open your macro plan" : "Build a macro plan"}
          disabled={!nutritionPlanReady || savingPlan}
          onPress={() => setShowCalculator(true)}
          style={({ pressed }) => ({ borderRadius: 18, borderWidth: 1, padding: 14, gap: 16, overflow: "hidden", backgroundColor: theme.colors.planSurface, borderColor: pressed ? theme.colors.primary : theme.colors.border, opacity: !nutritionPlanReady || savingPlan ? 0.55 : pressed ? 0.85 : 1 })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <FuelThumbnail kind="plan" size={frame.width < 360 ? 76 : 88} />
            <View style={{ flex: 1, gap: 4 }}>
              <SectionLabel>Daily targets</SectionLabel>
              <AppText size={nutritionProfile ? 30 : 22} weight="black">{nutritionProfile ? currentNutrition.calorieGoal.toLocaleString() : "Build your plan"}</AppText>
              <AppText size={12} muted>{nutritionProfile ? "calories / day" : "Nutrition built around your training."}</AppText>
            </View>
          </View>
          {nutritionProfile ? <View style={{ flexDirection: "row", gap: 8 }}>
            {[{ label: "Protein", value: currentNutrition.proteinGoal, color: theme.colors.primary }, { label: "Carbs", value: currentNutrition.carbGoal, color: theme.colors.carbs }, { label: "Fat", value: currentNutrition.fatGoal, color: theme.colors.fat }].map(item => <View key={item.label} style={{ flex: 1, gap: 4, padding: 10, borderRadius: 12, backgroundColor: theme.colors.surfaceRaised }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: item.color }} /><AppText size={10} muted>{item.label}</AppText></View>
              <AppText size={16} weight="extrabold">{item.value}<AppText size={11} muted> g</AppText></AppText>
            </View>)}
          </View> : null}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, backgroundColor: theme.colors.primary }}>
            <AppText size={13} weight="extrabold" color={theme.colors.primaryText}>{nutritionProfile ? "View & adjust plan" : "Create my macro plan"}</AppText>
            <AppText size={18} color={theme.colors.primaryText}>↗</AppText>
          </View>
        </Pressable>
        </TrainingCard>
        {nutritionProfile ? (
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
        ) : null}

        <TrainingCard padding={20} gap={18}>
          <View style={styles.summaryHeader}>
            <View style={{ gap: 5 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Icon source={icons.flame} size={24} tint={theme.colors.accent} /><AppText size={16} weight="bold">Daily energy</AppText></View>
              <AppText size={38} weight="black">{currentNutrition.calories.toLocaleString()}<AppText size={12} muted> cal</AppText></AppText>
              <AppText size={11} muted>of {currentNutrition.calorieGoal.toLocaleString()} daily target</AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Edit nutrition goals" onPress={openGoals} style={[styles.goalButton, { borderColor: theme.colors.primary }]}> 
              <AppText size={12} weight="bold" primary>Goals</AppText>
            </Pressable>
          </View>
          <ProgressBar progress={Math.min(currentNutrition.calories / Math.max(currentNutrition.calorieGoal, 1), 1)} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <View style={{ borderRadius: 20, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: theme.colors.primaryTint }}><AppText size={11} weight="bold" primary>{Math.max(currentNutrition.calorieGoal - currentNutrition.calories, 0).toLocaleString()} cal left</AppText></View>
            <AppText size={11} muted>{Math.round(currentNutrition.calories / Math.max(currentNutrition.calorieGoal, 1) * 100)}% of target</AppText>
          </View>
          <View style={[styles.macroRow, { borderTopWidth: 1, borderColor: theme.colors.border, paddingTop: 16, gap: 16 }]}>
            {(["protein", "carbs", "fats"] as Macro[]).map((macro) => (
              <View key={macro} style={[styles.macroTile, { padding: 0 }]}>
                <AppText size={12} muted>{macroLabel(macro)}</AppText>
                <AppText size={18} weight="bold">{currentNutrition[macro]}g</AppText>
                <AppText size={11} muted>of {nutrition[macroGoals[macro]]}g</AppText>
                <View style={{ height: 4, borderRadius: 2, overflow: "hidden", marginTop: 5, backgroundColor: theme.colors.progressTrack }}><View style={{ height: "100%", width: `${Math.min(100, currentNutrition[macro] / Math.max(1, nutrition[macroGoals[macro]]) * 100)}%`, backgroundColor: macro === "protein" ? theme.colors.primary : macro === "carbs" ? theme.colors.carbs : theme.colors.fat }} /></View>
              </View>
            ))}
          </View>
        </TrainingCard>

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
      <Modal animationType="slide" transparent visible={showAddFood} onRequestClose={() => setShowAddFood(false)}>
        <KeyboardAvoidingView enabled={Platform.OS !== "web"} behavior="padding" style={styles.keyboardAvoiding}>
          <Pressable style={[styles.overlay, { backgroundColor: theme.colors.sheetOverlay }]} onPress={() => setShowAddFood(false)}>
            <Pressable onPress={() => undefined} style={[styles.sheet, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
              <ScrollBody contentContainerStyle={styles.sheetBody}>
                <View style={styles.sheetHeader}>
                  <View><SectionLabel>{savingNewRecipe ? "Saved recipes" : dayLabel}</SectionLabel><AppText size={23} weight="black">{savingNewRecipe ? "Save recipe" : editingFood ? "Edit food" : "Add food"}</AppText></View>
                  <Pressable accessibilityRole="button" accessibilityLabel={savingNewRecipe ? "Close recipe form" : "Close add food"} onPress={() => setShowAddFood(false)}><AppText size={25} muted>×</AppText></Pressable>
                </View>
                <Field label="Meal">
                  <View style={styles.mealOptions}>{meals.map((option) => <Pressable key={option} onPress={() => setMeal(option)} style={[styles.mealOption, { borderColor: meal === option ? theme.colors.primary : theme.colors.border, backgroundColor: meal === option ? theme.colors.primaryTint : theme.colors.surfaceRaised }]}><AppText size={12} weight="bold" primary={meal === option}>{option}</AppText></Pressable>)}</View>
                </Field>
                <Field label="Food or meal name"><Input value={name} onChangeText={setName} placeholder="e.g. Chicken burrito bowl" bordered /></Field>
                <Field label="Calories"><Input value={calories} onChangeText={setCalories} keyboardType="number-pad" placeholder="0" bordered /></Field>
                <View style={styles.inputRow}>
                  <Field label="Protein (g)" style={styles.inputHalf}><Input value={protein} onChangeText={setProtein} keyboardType="number-pad" placeholder="0" bordered /></Field>
                  <Field label="Carbs (g)" style={styles.inputHalf}><Input value={carbs} onChangeText={setCarbs} keyboardType="number-pad" placeholder="0" bordered /></Field>
                  <Field label="Fat (g)" style={styles.inputHalf}><Input value={fats} onChangeText={setFats} keyboardType="number-pad" placeholder="0" bordered /></Field>
                </View>
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

      <Modal animationType="slide" transparent visible={editingRecipe != null} onRequestClose={closeRecipeEditor}>
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
                <View style={styles.sheetHeader}><View><SectionLabel>Daily targets</SectionLabel><AppText size={23} weight="black">Nutrition goals</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="Close nutrition goals" onPress={() => setShowGoals(false)}><AppText size={25} muted>×</AppText></Pressable></View>
                <Field label="Calories"><Input value={goalValues.calories} onChangeText={(value) => setGoalValues((current) => ({ ...current, calories: value }))} keyboardType="number-pad" bordered /></Field>
                <View style={styles.goalGrid}>{(["protein", "carbs", "fats"] as Macro[]).map((macro) => <Field key={macro} label={`${macroLabel(macro)} (g)`} style={styles.goalHalf}><Input value={goalValues[macro]} onChangeText={(value) => setGoalValues((current) => ({ ...current, [macro]: value }))} keyboardType="number-pad" bordered /></Field>)}</View>
                {goalError || nutritionPlanError ? <AppText>{goalError ?? nutritionPlanError}</AppText> : null}
                <AppText size={12} muted>These daily targets carry forward until you change them.</AppText>
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
