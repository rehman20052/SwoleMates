import { TrainTelemetry, TrainNumber, trainingVolume, TrainText as AppText, TrainInput as Input, useTrainPalette } from "./train-ui";
import { TrainSecondary as SecondaryButton } from "./train-ui";
import { useState } from "react";
import { View } from "react-native";
import { Icon } from "./ui";
import { TrainSection as TrainingCard } from "./train-ui";
import { icons } from "@/assets";
import { trainingHistory, weeklyRecap } from "@/lib/progress-recap";
import { daysFromToday, formatShortDate, useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";

export function WeeklyRecap() {
  const theme = useAppTheme();
  const trainPalette = useTrainPalette();
  const { logs, foodEntries, trackedLifts, weeklyWorkoutGoal, foodJournalReady, workspaceSettings } = useAppData();
  const [offset, setOffset] = useState(0);
  const [weeks, setWeeks] = useState<4 | 8 | 12>(4);
  const [showHistory, setShowHistory] = useState(false);
  const [showNutrition, setShowNutrition] = useState(false);
  const completed = workspaceSettings.filter(item => item.id.startsWith("nutrition-day:") && typeof item.value === "object" && item.value.content === "complete").map(item => item.id.slice("nutrition-day:".length));
  const recap = weeklyRecap(daysFromToday(0), offset, logs, foodEntries, trackedLifts, completed);
  const weekLogs = logs.filter(log => log.date >= recap.start && log.date <= recap.end && log.date <= daysFromToday(0));
  const setCount = weekLogs.reduce((sum, log) => sum + (log.exercises ?? []).reduce((total, exercise) => total + (exercise.setDetails?.length ?? exercise.sets), 0), 0);
  const history = trainingHistory(daysFromToday(0), weeks, logs, trackedLifts);
  return <TrainingCard padding={16} gap={16}>
    <TrainTelemetry>[ WEEKLY_RECAP // TRAINING ]</TrainTelemetry>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Icon source={icons.award} size={23} tint={theme.colors.accent} /><AppText size={16} weight="bold">Weekly recap</AppText></View>
      <SecondaryButton height={32} fontSize={12} onPress={() => setOffset(offset === 0 ? -1 : 0)}>{offset === 0 ? "View last week" : "View this week"}</SecondaryButton>
    </View>
    <AppText size={12} muted>{offset === 0 ? "This week" : "Last week"} · {formatShortDate(recap.start)} – {formatShortDate(recap.end)}</AppText>
    {!foodJournalReady ? <AppText muted>Loading your week…</AppText> : <>
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: trainPalette.border }}>
        <View style={{ flex: 1, paddingVertical: 16, paddingRight: 16, gap: 8 }}>
          <TrainNumber size={32} style={{ letterSpacing: -1 }}>{recap.workoutDays}/{offset === 0 ? weeklyWorkoutGoal : 7}</TrainNumber>
          <AppText size={12} muted>Days trained</AppText>
        </View>
        <View style={{ flex: 1, padding: 16, gap: 8, borderLeftWidth: 1, borderColor: trainPalette.border }}>
          <TrainNumber size={32} style={{ letterSpacing: -1 }}>{recap.bests.length}</TrainNumber>
          <AppText size={12} muted>Strength bests</AppText>
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", borderBottomWidth: 1, borderColor: trainPalette.border }}>
        {[{ label: "Workouts", value: String(recap.sessions) }, ...(weekLogs.some(log => log.exercises?.length) ? [{ label: "Sets", value: String(setCount) }] : []), ...(trainingVolume(weekLogs) ? [{ label: "Volume", value: trainingVolume(weekLogs) }] : [])].map((metric, index) => <View key={metric.label} style={{ flex: 1, minWidth: 72, paddingVertical: 16, paddingHorizontal: index ? 8 : 0, gap: 8, borderLeftWidth: index ? 1 : 0, borderColor: trainPalette.border }}><TrainNumber size={20} style={{ letterSpacing: -0.5 }}>{metric.value}</TrainNumber><AppText size={11} muted>{metric.label}</AppText></View>)}
      </View>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}><AppText size={12} weight="bold">Training consistency</AppText><AppText size={12} muted>{recap.workoutDays} of 7 days</AppText></View>
        <View style={{ flexDirection: "row", gap: 8 }}>{Array.from({ length: 7 }, (_, index) => {
          const date = new Date(recap.start + "T12:00:00"); date.setDate(date.getDate() + index);
          const iso = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
          const trained = weekLogs.some(log => log.date === iso);
          return <View key={iso} accessibilityLabel={iso + (trained ? ": trained" : ": no workout")} style={{ flex: 1, alignItems: "center", gap: 8 }}><AppText size={10} muted>{["M","T","W","T","F","S","S"][index]}</AppText><View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: "transparent", backgroundColor: "transparent", alignItems: "center", justifyContent: "center" }}>{trained ? <AppText size={11} weight="black" color={theme.colors.accent}>✓</AppText> : null}</View></View>;
        })}</View>
      </View>

      {recap.bests.slice(0, 3).map((record, index) => <View key={index} style={{ flexDirection: "row", gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderColor: trainPalette.border }}><AppText size={13} weight="bold" style={{ flex: 1 }}>{record.name}</AppText><AppText size={12} muted>+{record.increase} {record.unit}</AppText></View>)}
      <SecondaryButton accessibilityState={{ expanded: showNutrition }} onPress={() => setShowNutrition(value => !value)}>{showNutrition ? "Hide nutrition" : "Nutrition / " + recap.nutritionDays + " days logged"}</SecondaryButton>
      {showNutrition ? <View style={{ gap: 8 }}>      {recap.averageCalories !== null ? <AppText size={12} muted>{`Logged-day average: ${recap.averageCalories.toLocaleString()} cal · ${recap.averageProtein}g protein. Includes partial days.`}</AppText> : null}
      <AppText size={12} muted>{recap.completedDays}/7 days marked complete. {recap.completedAverageCalories === null ? "No completed-day average yet." : `Completed-day average: ${recap.completedAverageCalories} cal · ${recap.completedAverageProtein}g protein.`}</AppText>
</View> : null}
      <SecondaryButton onPress={() => setShowHistory(value => !value)}>{showHistory ? "Hide training history" : "Training consistency and lift history"}</SecondaryButton>
      {showHistory ? <View style={{ gap: 8 }}><View style={{ flexDirection:"row",gap:8 }}>{([4,8,12] as const).map(value => <SecondaryButton key={value} style={{ flex:1 }} onPress={() => setWeeks(value)}>{weeks === value ? "✓ " : ""}{value} weeks</SecondaryButton>)}</View><AppText size={12} muted>{history.start} – {history.end} · {history.days} days trained · {history.sessions} sessions · {history.activeWeeks} calendar weeks with training</AppText>{!history.sessions ? <AppText muted>No workouts recorded in this period.</AppText> : null}{history.lifts.map((lift,index) => <View key={index} style={{gap:4}}><AppText weight="bold">{lift.name} ({lift.unit})</AppText>{lift.entries.length ? lift.entries.map((entry,i) => <AppText key={i} size={12} muted>{entry.date} · {entry.weight} {lift.unit} · {entry.minReps}–{entry.maxReps} reps</AppText>) : <AppText muted>No lift history in this period.</AppText>}</View>)}</View> : null}
      {!recap.workoutDays && !recap.nutritionDays && !recap.bests.length ? <AppText size={12} muted>Your saved activity will build this recap.</AppText> : null}
    </>}
  </TrainingCard>;
}
