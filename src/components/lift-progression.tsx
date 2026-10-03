import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, Card, Field, Input, PrimaryButton, ProgressBar, ScrollBody, SecondaryButton, SectionLabel, SelectField } from "@/components/ui";
import { exerciseOptions, loadExerciseCatalog } from "@/lib/exercise-catalog";
import { liftProgress, validLiftDetails, type TrackedLift } from "@/lib/lift-progression";
import { daysFromToday, formatShortDate, useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";

export function LiftProgression() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { trackedLifts, saveTrackedLift, deleteTrackedLift, liftStorageError, foodJournalReady } = useAppData();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [exercise, setExercise] = useState("");
  const [customName, setCustomName] = useState("");
  const [search, setSearch] = useState("");
  const [picking, setPicking] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<"loading" | "ready" | "offline">("loading");
  const [unit, setUnit] = useState<"lb" | "kg">("lb");
  const [weight, setWeight] = useState("");
  const [goal, setGoal] = useState("");
  const [minReps, setMinReps] = useState("6");
  const [maxReps, setMaxReps] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TrackedLift | null>(null);
  const [historyOpen, setHistoryOpen] = useState(new Set<string>());

  useEffect(() => {
    if (!open) return;
    let active = true;
    setCatalogStatus("loading");
    void loadExerciseCatalog(AsyncStorage).then((catalog) => {
      if (!active) return;
      setNames(catalog.names); setCatalogStatus(catalog.offline ? "offline" : "ready");
    });
    return () => { active = false; };
  }, [open]);
  function openEditor(lift?: TrackedLift) {
    setEditingId(lift?.id ?? null);
    setExercise(lift?.name ?? ""); setCustomName(""); setSearch("");
    setPicking(!lift); setWeight(lift ? `${lift.currentWeight}` : "");
    setGoal(lift ? `${lift.goalWeight}` : ""); setUnit(lift?.unit ?? "lb");
    setMinReps(`${lift?.minReps ?? 6}`); setMaxReps(`${lift?.maxReps ?? 10}`);
    setError(null); setOpen(true);
  }
  function changeUnit(next: "lb" | "kg") {
    if (unit === next) return;
    const factor = next === "kg" ? 1 / 2.2046226218 : 2.2046226218;
    const convert = (text: string) => text.trim() && Number.isFinite(Number(text)) ? `${Math.round(Number(text) * factor * 100) / 100}` : text;
    setWeight(convert(weight)); setGoal(convert(goal)); setUnit(next);
  }
  async function save() {
    if (saving || !foodJournalReady) return;
    const details = { name: (exercise === "Other" ? customName : exercise).trim(), unit,
      currentWeight: Number(weight), goalWeight: Number(goal), minReps: Number(minReps), maxReps: Number(maxReps) };
    if (!weight.trim() || !goal.trim() || !validLiftDetails(details)) {
      setError("Choose a lift, enter current and goal weights, and a rep range from 1 to 100. Goal weight must be greater than zero."); return;
    }
    setSaving(true); setError(null);
    const id = editingId ?? `lift-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    // Retain this ID after a failed response, so retry cannot create a duplicate.
    setEditingId(id);
    const saved = await saveTrackedLift(id, details);
    setSaving(false); if (saved) setOpen(false);
  }
  const options = exerciseOptions(names, search);
  return <>
    <Card padding={16} radius={20} gap={14}>
      <View style={styles.header}>
        <SectionLabel>Lift progression</SectionLabel>
        <SecondaryButton height={34} fontSize={12} disabled={!foodJournalReady} onPress={() => openEditor()}>Add lift</SecondaryButton>
      </View>
      {!foodJournalReady ? <AppText muted>Loading your saved lifts…</AppText> : !trackedLifts.length ?
        <AppText muted>Track a lift, your usual reps, and the weight you want to reach.</AppText> : null}
      {trackedLifts.map((lift) => {
        const progress = liftProgress(lift);
        const showHistory = historyOpen.has(lift.id);
        return <View key={lift.id} style={[styles.lift, { backgroundColor: theme.colors.surfaceRaised }]}>
          <View style={styles.header}>
            <View style={{ flex: 1, gap: 3 }}>
              <AppText weight="extrabold">{lift.name}</AppText>
              <AppText size={12} muted>Typical reps: {lift.minReps === lift.maxReps ? lift.minReps : `${lift.minReps}–${lift.maxReps}`}</AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Update ${lift.name}`} hitSlop={8} onPress={() => openEditor(lift)}>
              <AppText size={13} weight="bold" primary>Update</AppText>
            </Pressable>
          </View>
          <View style={styles.header}>
            <AppText size={19} weight="black">{lift.currentWeight} {lift.unit}</AppText>
            <AppText size={12} muted>Goal: {lift.goalWeight} {lift.unit}</AppText>
          </View>
          <View accessibilityRole="progressbar" accessibilityLabel={`${lift.name} goal progress`} accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
            <ProgressBar progress={progress} />
          </View>
          <AppText size={12} primary weight="bold">{progress >= 1 ? "Goal reached!" : `${Math.round(progress * 100)}% of goal · ${Math.round((lift.goalWeight - lift.currentWeight) * 100) / 100} ${lift.unit} to go`}</AppText>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: showHistory }} onPress={() => setHistoryOpen((current) => {
              const next = new Set(current); if (next.has(lift.id)) next.delete(lift.id); else next.add(lift.id); return next;
            })}><AppText size={12} muted>{showHistory ? "Hide history" : `History (${lift.history.length})`}</AppText></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${lift.name}`} onPress={() => setConfirmDelete(lift)}><AppText size={12} muted>Remove</AppText></Pressable>
          </View>
          {showHistory ? [...lift.history].reverse().map((entry, index) => <View key={`${entry.date}-${index}`} style={styles.header}>
            <AppText size={12} muted>{entry.date === daysFromToday(0) ? "Today" : formatShortDate(entry.date)}</AppText>
            <AppText size={12}>{entry.weight} {lift.unit} · {entry.minReps}–{entry.maxReps} reps</AppText>
          </View>) : null}
        </View>;
      })}
      {liftStorageError ? <AppText color={theme.colors.danger}>{liftStorageError}</AppText> : null}
      {confirmDelete ? <View style={{ gap: 10 }}>
        <AppText>Remove {confirmDelete.name} and its progression history from your account?</AppText>
        <View style={styles.header}>
          <SecondaryButton disabled={saving} onPress={() => setConfirmDelete(null)}>Cancel</SecondaryButton>
          <PrimaryButton disabled={saving} onPress={async () => {
            if (saving) return; setSaving(true);
            const removed = await deleteTrackedLift(confirmDelete.id);
            setSaving(false); if (removed) setConfirmDelete(null);
          }}>{saving ? "Removing…" : "Remove lift"}</PrimaryButton>
        </View>
      </View> : null}
    </Card>
    <Modal transparent animationType="slide" visible={open} onRequestClose={() => { if (!saving) setOpen(false); }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={styles.overlay} onPress={() => { if (!saving) setOpen(false); }}>
          <Pressable onPress={() => undefined} style={[styles.sheet, { backgroundColor: theme.colors.background, borderColor: theme.colors.border, paddingBottom: Math.max(18, insets.bottom) }]}>
            <ScrollBody contentContainerStyle={{ gap: 14 }}>
              <View style={styles.header}>
                <AppText size={23} weight="black">{editingId ? "Update lift" : "Track a lift"}</AppText>
                <Pressable disabled={saving} accessibilityRole="button" accessibilityLabel="Close lift editor" hitSlop={10} onPress={() => setOpen(false)}><AppText size={24} muted>×</AppText></Pressable>
              </View>
              <Field label="Exercise">
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: picking }} onPress={() => setPicking((current) => !current)} style={[styles.picker, { backgroundColor: theme.colors.surfaceRaised }]}>
                  <AppText muted={!exercise} style={{ flex: 1 }}>{exercise || "Choose an exercise"}</AppText><AppText muted>{picking ? "▴" : "▾"}</AppText>
                </Pressable>
                {picking ? <View style={{ gap: 8 }}>
                  <Input placeholder="Search exercises" value={search} onChangeText={setSearch} bordered />
                  <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={{ maxHeight: 220 }}>
                    {options.map((name) => <Pressable key={name} accessibilityRole="button" accessibilityState={{ selected: exercise === name }} onPress={() => { setExercise(name); setPicking(false); }} style={[styles.option, { backgroundColor: exercise === name ? theme.colors.primaryTint : theme.colors.surface }]}>
                      <AppText>{name === "Other" ? "Other — enter your own exercise" : name}</AppText>
                    </Pressable>)}
                  </ScrollView>
                  <AppText size={11} muted>{catalogStatus === "loading" ? "Loading more exercises… Common lifts are ready." : catalogStatus === "offline" ? "Common and cached exercises are available offline." : "Common lifts and the wger exercise catalog."}</AppText>
                  <Pressable accessibilityRole="link" onPress={() => void Linking.openURL("https://wger.de")}><AppText size={11} muted>Exercise catalog: wger.de</AppText></Pressable>
                </View> : null}
              </Field>
              {exercise === "Other" ? <Field label="Your exercise"><Input placeholder="Exercise name" maxLength={100} value={customName} onChangeText={setCustomName} bordered /></Field> : null}
              <Field label="Weight unit"><SelectField value={unit} options={["lb", "kg"]} onChange={changeUnit} renderLabel={(value) => value === "lb" ? "Pounds (lb)" : "Kilograms (kg)"} /></Field>
              <View style={styles.header}>
                <Field label={`Current weight (${unit})`} style={{ flex: 1 }}><Input value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="135" bordered /></Field>
                <Field label={`Goal weight (${unit})`} style={{ flex: 1 }}><Input value={goal} onChangeText={setGoal} keyboardType="decimal-pad" placeholder="225" bordered /></Field>
              </View>
              <View style={styles.header}>
                <Field label="Minimum reps" style={{ flex: 1 }}><Input value={minReps} onChangeText={setMinReps} keyboardType="number-pad" bordered /></Field>
                <Field label="Maximum reps" style={{ flex: 1 }}><Input value={maxReps} onChangeText={setMaxReps} keyboardType="number-pad" bordered /></Field>
              </View>
              <AppText size={12} muted>Updating weight or reps adds a dated history entry. Your lift and goal sync to your account.</AppText>
              {error || liftStorageError ? <AppText color={theme.colors.danger}>{error ?? liftStorageError}</AppText> : null}
              <PrimaryButton disabled={saving || !foodJournalReady} onPress={save}>{saving ? "Saving…" : "Save lift"}</PrimaryButton>
            </ScrollBody>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  lift: { borderRadius: 14, padding: 14, gap: 10 },
  picker: { flexDirection: "row", gap: 10, borderRadius: 12, padding: 14 },
  option: { padding: 12, borderRadius: 8, marginBottom: 3 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.74)", justifyContent: "flex-end" },
  sheet: { maxHeight: "92%", width: "100%", maxWidth: 450, alignSelf: "center", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 18 },
});
