import { useState } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "./ui";
import { LiftProgressBar } from "./lift-progress-bar";
import { liftProgress, type TrackedLift } from "@/lib/lift-progression";
import { liftMilestones } from "@/lib/progress-recap";
import { daysFromToday, formatShortDate } from "@/state/app-data";
import { useAppTheme } from "@/theme";

export function LiftProgressRow({ lift, onUpdate, onRemove }: { lift: TrackedLift; onUpdate: () => void; onRemove: () => void }) {
  const theme = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  const [replay, setReplay] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const progress = liftProgress(lift);
  const milestones = liftMilestones(lift);
  const latestBest = milestones.records.at(-1);
  return <View style={{ borderRadius: 16, borderWidth: 1, borderColor: theme.colors.panelBorder, padding: 10, gap: 8, backgroundColor: theme.colors.rowSurface }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? "Hide" : "Show"} ${lift.name} details`} accessibilityState={{ expanded }} accessibilityHint="Shows lift milestones and history" onPress={() => setExpanded(value => !value)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><AppText size={13} weight="extrabold" style={{ flex: 1 }}>{lift.name}</AppText><AppText size={11} muted>{expanded ? "⌃" : "⌄"}</AppText></Pressable>
        <AppText size={11} muted>{lift.currentWeight} / {lift.goalWeight} {lift.unit}</AppText>
        <LiftProgressBar progress={progress} name={lift.name} replay={replay} onMotionPreference={setReducedMotion} />
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Update ${lift.name}`} onPress={onUpdate} style={{ minHeight: 36, paddingHorizontal: 10, borderRadius: 12, justifyContent: "center", borderWidth: 1, borderColor: theme.colors.borderStrong }}><AppText size={11} weight="bold">Update</AppText></Pressable>
        <AppText size={15} weight="extrabold" primary>{Math.round(progress * 100)}%</AppText>
      </View>
    </View>
    {expanded ? <View style={{ gap: 10 }}>
      {reducedMotion ? <AppText size={11} muted>Animations paused by your device’s Reduce Motion setting.</AppText> : <Pressable accessibilityRole="button" accessibilityLabel={`Replay ${lift.name} progress animation`} hitSlop={6} onPress={() => setReplay(value => value + 1)}><AppText size={11} primary>Replay progress</AppText></Pressable>}
      <AppText size={12} muted>Typical reps: {lift.minReps === lift.maxReps ? lift.minReps : `${lift.minReps}–${lift.maxReps}`}{progress < 1 ? ` · ${Math.round((lift.goalWeight - lift.currentWeight) * 100) / 100} ${lift.unit} to go` : ""}</AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {[25, 50, 75, 100].map(mark => <View key={mark} accessibilityLabel={`${lift.name}: ${mark === 100 ? "goal" : `${mark}% checkpoint`} ${progress * 100 >= mark ? "reached" : "ahead"}`} style={{ borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: progress * 100 >= mark ? theme.colors.primaryTint : "transparent", borderColor: progress * 100 >= mark ? theme.colors.primary : theme.colors.border }}>
          <AppText size={10} weight="bold" color={progress * 100 >= mark ? theme.colors.accent : theme.colors.muted}>{progress * 100 >= mark ? "✓ " : ""}{mark === 100 ? "Goal" : `${mark}%`}</AppText>
        </View>)}
      </View>
      <AppText size={12} muted>Best logged: {milestones.best} {lift.unit}{latestBest ? ` · +${latestBest.increase} ${lift.unit} on ${formatShortDate(latestBest.date)}` : " · Your starting point is set"}</AppText>
      <AppText size={11} weight="bold" muted>History ({lift.history.length})</AppText>
      {[...lift.history].reverse().slice(0, 5).map((entry, index) => <View key={`${entry.date}-${index}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
        <AppText size={11} muted>{entry.date === daysFromToday(0) ? "Today" : formatShortDate(entry.date)}</AppText><AppText size={11}>{entry.weight} {lift.unit} · {entry.minReps}–{entry.maxReps} reps</AppText>
      </View>)}
      {lift.history.length > 5 ? <FullHistory lift={lift} /> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${lift.name}`} onPress={onRemove}><AppText size={12} color={theme.colors.danger}>Remove lift</AppText></Pressable>
    </View> : null}
  </View>;
}

function FullHistory({ lift }: { lift: TrackedLift }) {
  const [open, setOpen] = useState(false);
  return <View style={{ gap: 8 }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(value => !value)}><AppText size={11} primary>{open ? "Show recent entries" : `Show all ${lift.history.length} entries`}</AppText></Pressable>
    {open ? [...lift.history].reverse().slice(5).map((entry, index) => <View key={`${entry.date}-${index}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}><AppText size={11} muted>{formatShortDate(entry.date)}</AppText><AppText size={11}>{entry.weight} {lift.unit} · {entry.minReps}–{entry.maxReps} reps</AppText></View>) : null}
  </View>;
}
