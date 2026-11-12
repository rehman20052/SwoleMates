import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { nutritionSnapshot } from "@/lib/diet-recap";
import { formatDate, formatShortDate, useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";
import { useTrainPalette } from "./train-ui";
import { AppText } from "./ui";

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const amount = (value: number, missing: boolean) => missing ? value > 0 ? `At least ${number.format(value)}` : "—" : number.format(value);

export function NutritionSnapshot({ today, onOpenFuel }: { today: string; onOpenFuel: (date: string) => void }) {
  const { foodEntries, foodJournalReady, foodJournalError, accountSyncError, nutrition, nutritionProfile, nutritionGoalSource, nutritionPlanReady, nutritionPlanError } = useAppData();
  const palette = useTrainPalette();
  const theme = useAppTheme();
  const snapshot = useMemo(() => nutritionSnapshot(today, foodEntries), [today, foodEntries]);
  const refreshFailed = Boolean(foodJournalError || accountSyncError);
  const showMeals = snapshot.meals > 0 && (foodJournalReady || refreshFailed);
  const goals = nutritionPlanReady && !nutritionPlanError ? nutrition : null;
  const calorieGoal = goals?.calorieGoal ?? 0;
  const chartMax = Math.max(calorieGoal, ...snapshot.days.map(day => day.calories), 1) * 1.25;
  const goalLabel = nutritionProfile ? { lose: "Weight loss", maintain: "Weight maintenance", gain: "Weight gain" }[nutritionProfile.goal] : "Daily nutrition";
  const difference = Math.round(snapshot.averages.calories - calorieGoal);
  const macros = [
    { key: "protein", label: "Protein", goal: goals?.proteinGoal ?? 0, color: "#6CA9EE" },
    { key: "carbs", label: "Carbs", goal: goals?.carbGoal ?? 0, color: "#E5B468" },
    { key: "fats", label: "Fat", goal: goals?.fatGoal ?? 0, color: "#B79BE9" },
  ] as const;
  const pick = snapshot.proteinPicks[0];
  const startLabel = snapshot.start.slice(0, 4) === snapshot.end.slice(0, 4) ? formatShortDate(snapshot.start) : formatDate(snapshot.start);

  return <View testID="nutrition-snapshot" style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
    <View style={styles.section}>
      <AppText accessibilityRole="header" size={23} weight="bold" color={palette.text}>Nutrition overview</AppText>
      <AppText size={12} color={palette.muted}>{startLabel} – {formatDate(snapshot.end)}</AppText>
    </View>
    {refreshFailed ? <AppText size={13} color={palette.muted}>Food history couldn’t refresh</AppText> : null}
    {showMeals ? <>
      <AppText size={12} color={palette.muted}>{`Based on ${snapshot.meals} logged ${snapshot.meals === 1 ? "meal" : "meals"} across ${snapshot.loggedDays} ${snapshot.loggedDays === 1 ? "day" : "days"}`}</AppText>
      <View style={[styles.summary, { backgroundColor: palette.field }]}>
        <AppText size={13} weight="semibold" color={palette.text}>{goals ? `${goalLabel} · ${nutritionGoalSource === "manual" ? "custom Fuel targets" : "Fuel targets"}` : "Fuel targets unavailable"}</AppText>
        <AppText size={12} color={palette.muted}>Calories per logged day</AppText>
        <View style={styles.valueRow}>
          <AppText size={32} weight="bold" color={palette.text}>{number.format(snapshot.averages.calories)}</AppText>
          <AppText size={13} color={palette.muted}>{calorieGoal > 0 ? `/ ${number.format(calorieGoal)} kcal daily target` : "kcal recorded"}</AppText>
        </View>
        {calorieGoal > 0 ? <AppText size={13} color={palette.text}>{difference === 0 ? "Recorded average matches your daily target" : `${number.format(Math.abs(difference))} kcal ${difference > 0 ? "above" : "below"} your daily target`}</AppText> : null}
        <AppText size={12} color={palette.muted}>{number.format(snapshot.totals.calories)} kcal recorded in this window</AppText>
      </View>
      <View style={styles.section}>
        <AppText accessibilityRole="header" size={15} weight="semibold" color={palette.text}>Calories by day</AppText>
        <AppText size={11} color={palette.muted}>{calorieGoal > 0 ? `Dashed line: current Fuel target · ${number.format(calorieGoal)} kcal` : "Recorded calories"}</AppText>
        <View accessible accessibilityRole="image" accessibilityLabel={`Calories by day. ${calorieGoal > 0 ? `Current daily target ${calorieGoal} calories. ` : ""}${snapshot.days.map(day => `${formatShortDate(day.date)}: ${day.meals ? `${day.calories} calories recorded` : "no meals logged"}`).join(". ")}`}>
          <View style={styles.chart}>
            {calorieGoal > 0 ? <View testID="calorie-target-line" style={[styles.targetLine, { bottom: `${calorieGoal / chartMax * 100}%`, borderColor: palette.muted }]} /> : null}
            {snapshot.days.map(day => <View key={day.date} style={styles.column}>
              <AppText size={9} color={palette.muted}>{day.meals ? number.format(day.calories) : "—"}</AppText>
              <View testID="calorie-day-bar" style={[styles.calorieBar, { height: day.meals ? Math.max(2, day.calories / chartMax * 100) : 2, backgroundColor: day.meals ? "#6CA9EE" : palette.border }]} />
            </View>)}
          </View>
          <View style={styles.dates}>{snapshot.days.map(day => <View key={day.date} style={styles.date}><AppText size={10} color={palette.muted}>{day.date.slice(-5).replace("-", "/")}</AppText></View>)}</View>
        </View>
      </View>
      <View style={styles.section}>
        <AppText accessibilityRole="header" size={15} weight="semibold" color={palette.text}>Macros per logged day</AppText>
        {macros.map(({ key, label, goal, color }) => {
          const value = snapshot.averages[key];
          const missing = snapshot.missing[key];
          const percent = goal > 0 ? Math.round(value / goal * 100) : null;
          return <View key={key} style={styles.section} accessible accessibilityLabel={`${label}: ${amount(value, missing)} grams per logged day${goal > 0 ? `, daily target ${goal} grams` : ""}. ${missing ? "Some values were not entered." : ""}`}>
            <View style={styles.valueRow}>
              <AppText size={14} weight="semibold" color={color}>{label}</AppText>
              <AppText size={13} color={palette.text}>{amount(value, missing)}{missing && value === 0 ? "" : " g"}{goal > 0 ? ` / ${number.format(goal)} g` : ""}</AppText>
            </View>
            {goal > 0 ? <>
              <View style={[styles.track, { backgroundColor: palette.field }]}><View testID="macro-goal-bar" style={[styles.bar, { width: `${Math.min(100, value / goal * 100)}%`, backgroundColor: color }]} /></View>
              <AppText size={11} color={palette.muted}>{missing ? value > 0 ? `At least ${percent}% of daily target recorded` : "Enter missing values to compare with your target" : `${percent}% of daily target recorded`}</AppText>
            </> : null}
          </View>;
        })}
      </View>
      <AppText size={12} color={palette.muted}>Logged days only; partial logs can understate intake. Targets reflect your current Fuel plan, not a weight-change prediction.</AppText>
      {Object.values(snapshot.missing).some(Boolean) ? <AppText size={12} color={palette.muted}>Some macro values weren’t entered</AppText> : null}
      {pick && (goals?.proteinGoal ?? 0) > 0 ? <View style={[styles.summary, { backgroundColor: palette.field }]}>
        <AppText size={13} weight="semibold" color={palette.text}>A meal that helps with protein</AppText>
        <AppText size={13} color={palette.text}>{pick.entry.name}</AppText>
        <AppText size={12} color={palette.muted}>{number.format(pick.protein)} g protein in a logged portion · {number.format(pick.protein / goals!.proteinGoal * 100)}% of your daily protein target</AppText>
      </View> : null}
    </> : !refreshFailed ? <AppText size={13} color={palette.muted}>{foodJournalReady ? "No meals logged in the last 7 days" : "Loading food history…"}</AppText> : null}
    <Pressable accessibilityRole="button" onPress={() => onOpenFuel(snapshot.latestDate ?? today)} style={styles.action}>
      <AppText size={14} weight="semibold" color={theme.colors.accent}>Open Fuel</AppText>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 20, gap: 18 },
  section: { gap: 6 },
  summary: { padding: 14, borderRadius: 10, gap: 6 },
  valueRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 6, flexWrap: "wrap" },
  chart: { height: 112, flexDirection: "row", gap: 6, alignItems: "flex-end", marginTop: 8 },
  targetLine: { position: "absolute", left: 0, right: 0, borderTopWidth: 1, borderStyle: "dashed" },
  column: { flex: 1, minWidth: 0, height: "100%", justifyContent: "flex-end", alignItems: "center", gap: 3 },
  calorieBar: { width: "65%", borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  dates: { flexDirection: "row", gap: 6, marginTop: 5 },
  date: { flex: 1, alignItems: "center", minWidth: 0 },
  track: { height: 7, borderRadius: 4, overflow: "hidden" },
  bar: { height: "100%", borderRadius: 4 },
  action: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center" },
});
