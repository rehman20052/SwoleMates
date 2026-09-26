import { useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from "react-native";

import { AppText, Card, Field, Input, PrimaryButton, ProgressBar, Screen, ScrollBody, SecondaryButton, SectionLabel, TitleBar } from "@/components/ui";
import { daysFromToday, type FoodLogEntry, type NutritionTotals, type SavedMeal, useAppData } from "@/state/app-data";
import { useNavigation } from "@/navigation";
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

export function NutritionTrackerScreen() {
  const theme = useAppTheme();
  const nav = useNavigation();
  const { addFoodEntry, deleteFoodEntry, foodEntries, nutrition, saveMeal, savedMeals, updateNutrition } = useAppData();
  const [showAddFood, setShowAddFood] = useState(false);
  const [showGoals, setShowGoals] = useState(false);
  const [meal, setMeal] = useState<Meal>("Breakfast");
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fats, setFats] = useState("");
  const [goalValues, setGoalValues] = useState({ calories: "", protein: "", carbs: "", fats: "" });

  const todayEntries = useMemo(
    () => foodEntries.filter((entry) => entry.date === daysFromToday(0)),
    [foodEntries],
  );

  const entriesByMeal = useMemo(
    () => meals.map((mealName) => ({ meal: mealName, entries: todayEntries.filter((entry) => entry.meal === mealName) })),
    [todayEntries],
  );

  if (!nutrition) return null;
  const currentNutrition = nutrition;

  function resetForm() {
    setMeal("Breakfast");
    setName("");
    setCalories("");
    setProtein("");
    setCarbs("");
    setFats("");
  }

  function saveFood(alsoSave = false) {
    const trimmedName = name.trim();
    const calorieValue = numberFrom(calories);
    if (!trimmedName || calorieValue <= 0) {
      Alert.alert("Add a food and calories", "Give this entry a name and enter its calories to save it.");
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
    addFoodEntry(entry);
    if (alsoSave) saveMeal(entry);
    resetForm();
    setShowAddFood(false);
  }

  function addSavedMeal(savedMeal: SavedMeal) {
    addFoodEntry({
      meal: savedMeal.meal,
      name: savedMeal.name,
      calories: savedMeal.calories,
      protein: savedMeal.protein,
      carbs: savedMeal.carbs,
      fats: savedMeal.fats,
    });
  }

  function openGoals() {
    setGoalValues({
      calories: `${currentNutrition.calorieGoal}`,
      protein: `${currentNutrition.proteinGoal}`,
      carbs: `${currentNutrition.carbGoal}`,
      fats: `${currentNutrition.fatGoal}`,
    });
    setShowGoals(true);
  }

  function saveGoals() {
    updateNutrition({
      calorieGoal: numberFrom(goalValues.calories),
      proteinGoal: numberFrom(goalValues.protein),
      carbGoal: numberFrom(goalValues.carbs),
      fatGoal: numberFrom(goalValues.fats),
    });
    setShowGoals(false);
  }

  return (
    <Screen>
      <TitleBar title="Nutrition tracker" onBack={nav.back} />
      <ScrollBody contentContainerStyle={styles.body}>
        <View style={styles.hero}>
          <SectionLabel>Today</SectionLabel>
          <AppText size={29} weight="black">Fuel your training.</AppText>
          <AppText muted>Log your meals to keep your daily macros in view.</AppText>
        </View>

        <Card padding={18} radius={24} gap={14} style={{ backgroundColor: theme.colors.primaryDeep }}>
          <View style={styles.summaryHeader}>
            <View>
              <AppText size={12} weight="bold" muted upper>Calories consumed</AppText>
              <AppText size={31} weight="black">{nutrition.calories.toLocaleString()} <AppText size={15} muted>/ {nutrition.calorieGoal.toLocaleString()}</AppText></AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Edit nutrition goals" onPress={openGoals} style={[styles.goalButton, { borderColor: theme.colors.primary }]}> 
              <AppText size={12} weight="bold" primary>Goals</AppText>
            </Pressable>
          </View>
          <ProgressBar progress={Math.min(nutrition.calories / Math.max(nutrition.calorieGoal, 1), 1)} />
          <AppText size={13} muted>
            {Math.max(nutrition.calorieGoal - nutrition.calories, 0).toLocaleString()} calories remaining
          </AppText>
          <View style={styles.macroRow}>
            {(["protein", "carbs", "fats"] as Macro[]).map((macro) => (
              <View key={macro} style={[styles.macroTile, { backgroundColor: theme.colors.surfaceRaised }]}>
                <AppText size={11} weight="bold" muted upper>{macroLabel(macro)}</AppText>
                <AppText size={17} weight="extrabold">{nutrition[macro]}g</AppText>
                <AppText size={11} muted>/ {nutrition[macroGoals[macro]]}g</AppText>
              </View>
            ))}
          </View>
        </Card>

        <View style={styles.sectionHeader}>
          <View>
            <SectionLabel>Food journal</SectionLabel>
            <AppText size={13} muted>{todayEntries.length} item{todayEntries.length === 1 ? "" : "s"} logged today</AppText>
          </View>
          <PrimaryButton height={38} fontSize={13} style={styles.addButton} onPress={() => setShowAddFood(true)}>+ Add food</PrimaryButton>
        </View>

        {entriesByMeal.map(({ meal: mealName, entries }) => (
          entries.length ? (
            <View key={mealName} style={styles.mealSection}>
              <AppText size={12} weight="extrabold" muted upper>{mealName}</AppText>
              {entries.map((entry) => (
                <Card key={entry.id} padding={14} radius={16} gap={8}>
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
                </Card>
              ))}
            </View>
          ) : null
        ))}

        <View style={styles.sectionHeader}>
          <View>
            <SectionLabel>Saved meals</SectionLabel>
            <AppText size={13} muted>Quickly add meals you eat often.</AppText>
          </View>
        </View>
        <View style={styles.savedMeals}>
          {savedMeals.map((savedMeal) => (
            <Card key={savedMeal.id} padding={14} radius={16} gap={10} style={styles.savedMealCard}>
              <View style={{ gap: 3 }}>
                <AppText size={11} weight="bold" muted upper>{savedMeal.meal}</AppText>
                <AppText weight="bold" numberOfLines={1}>{savedMeal.name}</AppText>
                <AppText size={12} muted>{savedMeal.calories} cal · {savedMeal.protein}g protein</AppText>
              </View>
              <SecondaryButton height={34} fontSize={12} style={styles.savedAddButton} onPress={() => addSavedMeal(savedMeal)}>Add</SecondaryButton>
            </Card>
          ))}
        </View>

        <SecondaryButton onPress={() => setShowAddFood(true)}>Add another meal</SecondaryButton>
      </ScrollBody>

      <Modal animationType="slide" transparent visible={showAddFood} onRequestClose={() => setShowAddFood(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboardAvoiding}>
          <Pressable style={styles.overlay} onPress={() => setShowAddFood(false)}>
            <Pressable onPress={() => undefined} style={[styles.sheet, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
              <ScrollBody contentContainerStyle={styles.sheetBody}>
                <View style={styles.sheetHeader}>
                  <View><SectionLabel>Today</SectionLabel><AppText size={23} weight="black">Add food</AppText></View>
                  <Pressable accessibilityRole="button" accessibilityLabel="Close add food" onPress={() => setShowAddFood(false)}><AppText size={25} muted>×</AppText></Pressable>
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
                <PrimaryButton onPress={() => saveFood()}>Add to today</PrimaryButton>
                <SecondaryButton onPress={() => saveFood(true)}>Save meal & add</SecondaryButton>
              </ScrollBody>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal animationType="slide" transparent visible={showGoals} onRequestClose={() => setShowGoals(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboardAvoiding}>
          <Pressable style={styles.overlay} onPress={() => setShowGoals(false)}>
            <Pressable onPress={() => undefined} style={[styles.sheet, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
              <ScrollBody contentContainerStyle={styles.sheetBody}>
                <View style={styles.sheetHeader}><View><SectionLabel>Daily targets</SectionLabel><AppText size={23} weight="black">Nutrition goals</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="Close nutrition goals" onPress={() => setShowGoals(false)}><AppText size={25} muted>×</AppText></Pressable></View>
                <Field label="Calories"><Input value={goalValues.calories} onChangeText={(value) => setGoalValues((current) => ({ ...current, calories: value }))} keyboardType="number-pad" bordered /></Field>
                <View style={styles.goalGrid}>{(["protein", "carbs", "fats"] as Macro[]).map((macro) => <Field key={macro} label={`${macroLabel(macro)} (g)`} style={styles.goalHalf}><Input value={goalValues[macro]} onChangeText={(value) => setGoalValues((current) => ({ ...current, [macro]: value }))} keyboardType="number-pad" bordered /></Field>)}</View>
                <PrimaryButton onPress={saveGoals}>Save goals</PrimaryButton>
              </ScrollBody>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 18, paddingBottom: 30 }, hero: { gap: 5 }, summaryHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }, goalButton: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8 }, macroRow: { flexDirection: "row", gap: 8 }, macroTile: { borderRadius: 12, flex: 1, gap: 2, padding: 10 }, sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, addButton: { borderRadius: 10, paddingHorizontal: 12 }, mealSection: { gap: 8 }, foodRow: { alignItems: "center", flexDirection: "row", gap: 12 }, foodRight: { alignItems: "flex-end", minWidth: 42 }, savedMeals: { gap: 10 }, savedMealCard: { flexDirection: "row", justifyContent: "space-between" }, savedAddButton: { alignSelf: "center", borderRadius: 9, paddingHorizontal: 12 }, keyboardAvoiding: { flex: 1 }, overlay: { backgroundColor: "rgba(0, 0, 0, 0.74)", flex: 1, justifyContent: "flex-end" }, sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, maxHeight: "88%", padding: 18 }, sheetBody: { gap: 15, paddingBottom: 18 }, sheetHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, mealOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, mealOption: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 9 }, inputRow: { flexDirection: "row", gap: 8 }, inputHalf: { flex: 1 }, goalGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, goalHalf: { minWidth: "46%" },
});
