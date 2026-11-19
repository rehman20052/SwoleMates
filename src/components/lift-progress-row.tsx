import { BRAND_LIME } from "@/theme";
import { TrainNumber, TrainIconBadge, TrainText as AppText, TrainInput as Input, useTrainPalette } from "./train-ui";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { liftProgress, type TrackedLift } from "@/lib/lift-progression";
import { liftMilestones } from "@/lib/progress-recap";
import { daysFromToday, formatShortDate } from "@/state/app-data";
import { useAppTheme } from "@/theme";
import { TrainProgressBar } from "./train-progress-bar";

export function LiftProgressRow({ lift, onUpdate, onRemove, recordLabel, prototype = false }: { prototype?: boolean; recordLabel?: string; lift: TrackedLift; onUpdate: () => void; onRemove: () => void }) {
  const theme = useAppTheme();
  const trainPalette = useTrainPalette();
  const [expanded, setExpanded] = useState(false);
  const progress = liftProgress(lift);
  const needsGoal = lift.goalWeight <= 0;
  const milestones = liftMilestones(lift);
  const latestBest = milestones.records.at(-1);
  if (prototype) {
    const monthStart = daysFromToday(0).slice(0, 7) + "-01";
    const prior = [...lift.history].sort((a, b) => a.date.localeCompare(b.date)).filter(entry => entry.date < monthStart).at(-1) ?? [...lift.history].sort((a, b) => a.date.localeCompare(b.date))[0];
    const gain = Math.max(0, Math.round((lift.currentWeight - (prior?.weight ?? lift.currentWeight)) * 100) / 100);
    return <View style={{ gap: 12, paddingVertical: 14 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? "Hide" : "Show"} ${lift.name} details`} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44 }}><AppText size={16} weight="bold">{lift.name}</AppText><AppText size={25} weight="medium">{lift.currentWeight}<AppText size={12} muted> {lift.unit}</AppText></AppText></Pressable>
      {needsGoal ? <Pressable accessibilityRole="button" accessibilityLabel={`Set goal for ${lift.name}`} onPress={onUpdate} style={{ minHeight: 44, justifyContent: "center" }}><AppText size={13} color="#bdf40b">Set your first weight goal ↗</AppText></Pressable> : <TrainProgressBar progress={progress} label={`${lift.name} goal progress`} track={trainPalette.track} color="#bdf40b" />}
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}><AppText size={12} color="#bdf40b">↗ +{gain} {lift.unit} this month</AppText>{!needsGoal ? <AppText size={12} muted>Goal: {lift.goalWeight} {lift.unit}</AppText> : null}</View>
      {expanded ? <View style={{ gap: 12 }}><AppText size={12} muted>{recordLabel ?? `${lift.minReps}–${lift.maxReps} reps`}</AppText><FullHistory lift={lift} /><Pressable accessibilityRole="button" accessibilityLabel={`Update ${lift.name}`} onPress={onUpdate} style={{ minHeight: 44, justifyContent: "center" }}><AppText color="#bdf40b">Update lift</AppText></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Remove ${lift.name}`} onPress={onRemove} style={{ minHeight: 44, justifyContent: "center" }}><AppText color={theme.colors.danger}>Remove lift</AppText></Pressable></View> : null}
    </View>;
  }
  return <View style={{ borderBottomWidth: 1, borderRadius: 0, backgroundColor: "transparent", borderBottomColor: trainPalette.separator, paddingVertical: 16, gap: 8 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <TrainIconBadge />
      <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? "Hide" : "Show"} ${lift.name} details`} accessibilityState={{ expanded }} accessibilityHint="Shows lift milestones and history" onPress={() => setExpanded(value => !value)} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 }}><AppText size={13} weight="extrabold" style={{ flex: 1 }}>{lift.name}</AppText><AppText size={11} muted>{expanded ? "⌃" : "⌄"}</AppText></Pressable>
        <TrainNumber size={12}>{lift.currentWeight} {lift.unit}{needsGoal ? " · Set your first weight goal" : ` / Goal ${lift.goalWeight} ${lift.unit}`}</TrainNumber>{recordLabel ? <AppText size={11} muted>{recordLabel}</AppText> : null}
        <View accessibilityRole="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} accessibilityLabel={`${lift.name} goal progress`} accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }} style={{ height: 2, borderRadius: 0, backgroundColor: trainPalette.track, overflow: "hidden" }}><View style={{ position: "absolute", left: 0, top: 0, height: 2, width: `${Math.min(100, Math.max(0, progress * 100))}%`, backgroundColor: BRAND_LIME }} /></View>
      </View>
      <View style={{ alignItems: "flex-end", justifyContent: "center", gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${needsGoal ? "Set goal for" : "Update"} ${lift.name}${recordLabel ? ", " + recordLabel : ""}`} onPress={onUpdate} style={{ minHeight: 44, paddingLeft: 8, justifyContent: "center", alignItems: "flex-end" }}><AppText size={11} weight="bold" muted>{needsGoal ? "Set goal" : "Update"}</AppText></Pressable>
        {!needsGoal ? <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: BRAND_LIME }} /><TrainNumber size={14}>{Math.round(progress * 100)}%</TrainNumber></View> : null}
      </View>
    </View>
    {expanded ? <View style={{ gap: 8 }}>
      <AppText size={12} muted>Typical reps: {lift.minReps === lift.maxReps ? lift.minReps : `${lift.minReps}–${lift.maxReps}`}{!needsGoal && progress < 1 ? ` · ${Math.round((lift.goalWeight - lift.currentWeight) * 100) / 100} ${lift.unit} to go` : ""}</AppText>
      <AppText size={12} muted>Best logged: {milestones.best} {lift.unit}{latestBest ? ` · +${latestBest.increase} ${lift.unit} on ${formatShortDate(latestBest.date)}` : " · Your starting point is set"}</AppText>
      <AppText size={11} weight="bold" muted>History ({lift.history.length})</AppText>
      {[...lift.history].reverse().slice(0, 5).map((entry, index) => <View key={`${entry.date}-${index}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <AppText size={11} muted>{entry.date === daysFromToday(0) ? "Today" : formatShortDate(entry.date)}</AppText><AppText size={11}>{entry.weight} {lift.unit} · {entry.minReps}–{entry.maxReps} reps</AppText>
      </View>)}
      {lift.history.length > 5 ? <FullHistory lift={lift} /> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${lift.name}${recordLabel ? ", " + recordLabel : ""}`} onPress={onRemove} style={{ minHeight: 44, justifyContent: "center" }}><AppText size={12} color={theme.colors.danger}>Remove lift</AppText></Pressable>
    </View> : null}
  </View>;
}

function FullHistory({ lift }: { lift: TrackedLift }) {
  const [open, setOpen] = useState(false);
  return <View style={{ gap: 8 }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(value => !value)} style={{ minHeight: 44, justifyContent: "center" }}><AppText size={11} primary>{open ? "Show recent entries" : `Show all ${lift.history.length} entries`}</AppText></Pressable>
    {open ? [...lift.history].reverse().slice(5).map((entry, index) => <View key={`${entry.date}-${index}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}><AppText size={11} muted>{formatShortDate(entry.date)}</AppText><AppText size={11}>{entry.weight} {lift.unit} · {entry.minReps}–{entry.maxReps} reps</AppText></View>) : null}
  </View>;
}
