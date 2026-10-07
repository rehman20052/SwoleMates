import { useState } from "react";
import { View } from "react-native";
import { AppText, Icon, SecondaryButton } from "./ui";
import { TrainingCard } from "./training-card";
import { icons } from "@/assets";
import { trainingHistory, weeklyRecap } from "@/lib/progress-recap";
import { daysFromToday, formatShortDate, useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";

export function WeeklyRecap() {
  const theme = useAppTheme();
  const { logs, foodEntries, trackedLifts, weeklyWorkoutGoal, foodJournalReady, workspaceSettings } = useAppData();
  const [offset, setOffset] = useState(0);
  const [weeks, setWeeks] = useState<4 | 8 | 12>(4);
  const [showHistory, setShowHistory] = useState(false);
  const completed = workspaceSettings.filter(item => item.id.startsWith("nutrition-day:") && typeof item.value === "object" && item.value.content === "complete").map(item => item.id.slice("nutrition-day:".length));
  const recap = weeklyRecap(daysFromToday(0), offset, logs, foodEntries, trackedLifts, completed);
  const history = trainingHistory(daysFromToday(0), weeks, logs, trackedLifts);
  return <TrainingCard padding={16} gap={14}>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Icon source={icons.award} size={23} tint={theme.colors.accent} /><AppText size={16} weight="bold">Weekly recap</AppText></View>
      <SecondaryButton height={32} fontSize={12} onPress={() => setOffset(offset === 0 ? -1 : 0)}>{offset === 0 ? "View last week" : "View this week"}</SecondaryButton>
    </View>
    <AppText size={12} muted>{offset === 0 ? "This week" : "Last week"} · {formatShortDate(recap.start)} – {formatShortDate(recap.end)}</AppText>
    {!foodJournalReady ? <AppText muted>Loading your week…</AppText> : <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {[{ value: `${recap.workoutDays}/${weeklyWorkoutGoal}`, label: "days trained", icon: icons.training }, { value: `${recap.nutritionDays}/7`, label: "food logged", icon: icons.fuel }, { value: `${recap.bests.length}`, label: "lift bests", icon: icons.progress }].map(item => <View key={item.label} style={{ flex: 1, minWidth: 75, padding: 10, gap: 7, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.panelBorder, backgroundColor: theme.colors.insetSurface }}>
          <Icon source={item.icon} size={18} tint={theme.colors.muted} />
          <AppText size={22} weight="black" primary>{offset !== 0 && item.label === "days trained" ? recap.workoutDays : item.value}</AppText><AppText size={11} muted>{item.label}</AppText>
        </View>)}
      </View>
      {recap.averageCalories !== null ? <AppText size={12} muted>{`Logged-day average: ${recap.averageCalories.toLocaleString()} cal · ${recap.averageProtein}g protein. Includes partial days.`}</AppText> : null}
      <AppText size={12} muted>{recap.completedDays}/7 days marked complete. {recap.completedAverageCalories === null ? "No completed-day average yet." : `Completed-day average: ${recap.completedAverageCalories} cal · ${recap.completedAverageProtein}g protein.`}</AppText>
      <SecondaryButton onPress={() => setShowHistory(value => !value)}>{showHistory ? "Hide training history" : "Training consistency and lift history"}</SecondaryButton>
      {showHistory ? <View style={{ gap: 10 }}><View style={{ flexDirection:"row",gap:8 }}>{([4,8,12] as const).map(value => <SecondaryButton key={value} style={{ flex:1 }} onPress={() => setWeeks(value)}>{weeks === value ? "✓ " : ""}{value} weeks</SecondaryButton>)}</View><AppText size={12} muted>{history.start} – {history.end} · {history.days} days trained · {history.sessions} sessions · {history.activeWeeks} calendar weeks with training</AppText>{!history.sessions ? <AppText muted>No workouts recorded in this period.</AppText> : null}{history.lifts.map((lift,index) => <View key={index} style={{gap:4}}><AppText weight="bold">{lift.name} ({lift.unit})</AppText>{lift.entries.length ? lift.entries.map((entry,i) => <AppText key={i} size={12} muted>{entry.date} · {entry.weight} {lift.unit} · {entry.minReps}–{entry.maxReps} reps</AppText>) : <AppText muted>No lift history in this period.</AppText>}</View>)}</View> : null}
      {recap.bests.slice(0, 3).map((record, index) => <View key={`${record.name}-${record.date}-${index}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
        <AppText size={12} weight="bold" style={{ flex: 1 }}>{record.name}</AppText><AppText size={12} primary>+{record.increase} {record.unit} · {formatShortDate(record.date)}</AppText>
      </View>)}
      {!recap.workoutDays && !recap.nutritionDays && !recap.bests.length ? <AppText size={12} muted>Your saved activity will build this recap.</AppText> : null}
    </>}
  </TrainingCard>;
}
