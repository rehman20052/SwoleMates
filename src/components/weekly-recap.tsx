import { useState } from "react";
import { View } from "react-native";
import { AppText, Card, SecondaryButton, SectionLabel } from "./ui";
import { weeklyRecap } from "@/lib/progress-recap";
import { daysFromToday, formatShortDate, useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";

export function WeeklyRecap() {
  const theme = useAppTheme();
  const { logs, foodEntries, trackedLifts, weeklyWorkoutGoal, foodJournalReady } = useAppData();
  const [offset, setOffset] = useState(0);
  const recap = weeklyRecap(daysFromToday(0), offset, logs, foodEntries, trackedLifts);
  return <Card padding={16} radius={20} gap={12}>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <SectionLabel>Weekly recap</SectionLabel>
      <SecondaryButton height={32} fontSize={12} onPress={() => setOffset(offset === 0 ? -1 : 0)}>{offset === 0 ? "Last week" : "This week"}</SecondaryButton>
    </View>
    <AppText size={12} muted>{formatShortDate(recap.start)} – {formatShortDate(recap.end)}</AppText>
    {!foodJournalReady ? <AppText muted>Loading your week…</AppText> : <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {[{ value: `${recap.workoutDays}/${weeklyWorkoutGoal}`, label: offset === 0 ? "workout day goal" : "days trained" }, { value: `${recap.nutritionDays}/7`, label: "days food logged" }, { value: `${recap.bests.length}`, label: "new lift bests" }].map(item => <View key={item.label} style={{ flex: 1, minWidth: 85, padding: 12, gap: 3, borderRadius: 12, backgroundColor: theme.colors.surfaceRaised }}>
          <AppText size={22} weight="black" primary>{offset !== 0 && item.label === "days trained" ? recap.workoutDays : item.value}</AppText><AppText size={11} muted>{item.label}</AppText>
        </View>)}
      </View>
      <AppText size={12} muted>{recap.averageCalories === null ? "Log food to see your nutrition recap." : `Average on days with entries: ${recap.averageCalories.toLocaleString()} calories · ${recap.averageProtein}g protein. Partial food logs are included.`}</AppText>
      {recap.bests.slice(0, 3).map((record, index) => <View key={`${record.name}-${record.date}-${index}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
        <AppText size={12} weight="bold" style={{ flex: 1 }}>{record.name}</AppText><AppText size={12} primary>+{record.increase} {record.unit} · {formatShortDate(record.date)}</AppText>
      </View>)}
      {!recap.workoutDays && !recap.nutritionDays && !recap.bests.length ? <AppText size={12} muted>Your saved activity will build this recap.</AppText> : null}
    </>}
  </Card>;
}
