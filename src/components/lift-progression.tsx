import { TrainText as AppText, TrainInput as Input, useTrainPalette } from "./train-ui";
import { TrainSection as Card, TrainPrimary as PrimaryButton, TrainSecondary as SecondaryButton, TrainSaveFeedback as SaveFeedback } from "./train-ui";
import { useEffect, useState, type ReactNode } from "react";
import { ProgressVisibilityProvider, useProgressVisibility } from "./train-progress-bar";
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Field, Icon, ScrollBody, SectionLabel, SelectField } from "@/components/ui";
import { TrainSection as TrainingCard } from "./train-ui";
import { icons } from "@/assets";
import { LiftProgressRow } from "./lift-progress-row";

import { saveArtworkPhoto, type ArtworkDraft } from "@/lib/artwork-photo";
import { exerciseOptions, loadExerciseCatalog } from "@/lib/exercise-catalog";
import { validLiftDetails, type TrackedLift } from "@/lib/lift-progression";
import { workoutLiftGroups } from "@/lib/workout-lift-progression";
import { parseWorkoutDraft } from "@/lib/workout-drafts";
import { useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";

export function LiftProgression({ prototype = false }: { prototype?: boolean } = {}) {
  const theme = useAppTheme();
  const trainPalette = useTrainPalette();
  const insets = useSafeAreaInsets();
  const { trackedLifts, logs, workspaceSettings, saveTrackedLift, deleteTrackedLift, liftStorageError, foodJournalReady } = useAppData();
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
  const [artwork, setArtwork] = useState<ArtworkDraft>();
  const [confirmDelete, setConfirmDelete] = useState<TrackedLift | null>(null);
  const [liftQuery, setLiftQuery] = useState("");
  const [directory, setDirectory] = useState(false);
  const [templateFilter, setTemplateFilter] = useState<string | null>(null);

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
    setArtwork(lift?.artwork);
    setDirectory(false);
    setEditingId(lift?.id ?? null);
    setExercise(lift?.name ?? ""); setCustomName(""); setSearch("");
    setPicking(!lift); setWeight(lift ? `${lift.currentWeight}` : "");
    setGoal(lift?.goalWeight ? `${lift.goalWeight}` : ""); setUnit(lift?.unit ?? "lb");
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
    if (!weight.trim() || !goal.trim() || details.goalWeight <= 0 || !validLiftDetails(details)) {
      setError("Choose a lift, enter current and goal weights, and a rep range from 1 to 100. Goal weight must be greater than zero."); return;
    }
    setSaving(true); setError(null);
    let savedArtwork;
    try { savedArtwork = await saveArtworkPhoto(artwork); setArtwork(savedArtwork); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not save your image."); setSaving(false); return; }
    const id = editingId ?? `lift-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    // Retain this ID after a failed response, so retry cannot create a duplicate.
    setEditingId(id);
    const saved = await saveTrackedLift(id, { ...details, artwork: savedArtwork });
    setSaving(false); if (saved) setOpen(false);
  }
  const options = exerciseOptions(names, search);
  const filteredLifts = trackedLifts.filter(lift => lift.name.toLocaleLowerCase().includes(liftQuery.trim().toLocaleLowerCase()));
  const templates = workspaceSettings.flatMap(item => {
    if (!item.id.startsWith("workout-plan:") || typeof item.value !== "object") return [];
    const template = parseWorkoutDraft(item.value.content);
    return template ? [{ id: item.id, title: template.title }] : [];
  });
  const groups = workoutLiftGroups(trackedLifts, logs, templates);
  const activeGroup = groups.find(group => group.id === templateFilter);
  const directoryLifts = activeGroup ? filteredLifts.filter(lift => activeGroup.liftIds.includes(lift.id)) : filteredLifts;
  const renderLift = (lift: TrackedLift) => <LiftProgressRow key={lift.id} prototype={prototype} lift={lift} recordLabel={trackedLifts.filter(item => item.name.trim().toLocaleLowerCase() === lift.name.trim().toLocaleLowerCase()).length > 1 ? `Record ${trackedLifts.filter(item => item.name.trim().toLocaleLowerCase() === lift.name.trim().toLocaleLowerCase()).findIndex(item => item.id === lift.id) + 1} / ${lift.minReps}-${lift.maxReps} reps / Since ${lift.history[0]?.date ?? "today"}` : undefined} onUpdate={() => openEditor(lift)} onRemove={() => { setDirectory(false); setConfirmDelete(lift); }} />;
  return <>
    <TrainingCard padding={16} gap={16} style={prototype ? { padding: 24, borderWidth: 1, borderRadius: 8, backgroundColor: "#111314", borderColor: "#2a2e30" } : undefined}>
      <View style={[styles.header, { flexWrap: "wrap", gap: 8 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>{!prototype ? <Icon source={icons.progress} size={20} tint={theme.colors.accent} /> : null}<AppText size={prototype ? 23 : 16} weight="bold">Lift progression</AppText></View>
        <SecondaryButton height={34} fontSize={12} disabled={!foodJournalReady} onPress={() => openEditor()}>Add lift</SecondaryButton>
      </View>
      {!foodJournalReady ? <AppText muted>Loading your saved lifts…</AppText> : !trackedLifts.length ?
        <AppText size={13} muted>Log a workout to add your exercises automatically, then set your weight goals.</AppText> : null}
      {prototype && trackedLifts.length > 0 ? <AppText size={14} muted>Logged exercises appear automatically. Set a goal for each lift.</AppText> : null}
      {trackedLifts.length && !prototype ? <Input bordered style={{ height: 44 }} placeholder="Search your lifts" accessibilityLabel="Search your lifts" value={liftQuery} onChangeText={setLiftQuery} /> : null}
      {trackedLifts.length && !prototype ? <AppText size={11} muted>{liftQuery.trim() ? `${filteredLifts.length} matching lifts` : `Showing ${Math.min(2, trackedLifts.length)} of ${trackedLifts.length} tracked lifts`}</AppText> : null}
      {!directory ? filteredLifts.slice(0, prototype ? 3 : 2).map(renderLift) : null}
      {trackedLifts.length > 0 && !filteredLifts.length ? <AppText muted>No lifts match that search.</AppText> : null}
      {filteredLifts.length > (prototype ? 3 : 2) ? <SecondaryButton height={38} fontSize={12} onPress={() => setDirectory(true)}>{liftQuery.trim() ? `View all ${filteredLifts.length} matches` : `View all ${trackedLifts.length} lifts`}</SecondaryButton> : null}
      {prototype ? <View style={{ borderTopWidth: 1, borderColor: "#2a2e30", paddingTop: 20, flexDirection: "row", alignItems: "center", gap: 10 }}><View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: "#bdf40b" }} /><AppText size={13} muted>One good rep closer to your goals.</AppText></View> : null}
      <SaveFeedback area="lifts" />
      {liftStorageError ? <AppText color={theme.colors.danger}>{liftStorageError}</AppText> : null}
    </TrainingCard>
    <Modal transparent animationType="fade" visible={!!confirmDelete} onRequestClose={() => { if (!saving) setConfirmDelete(null); }}>
      <View style={[styles.overlay, { backgroundColor: theme.colors.sheetOverlay, justifyContent: "center", padding: 16 }]}>
      {confirmDelete ? <View style={{ gap: 8, borderRadius: 20, padding: 16, backgroundColor: theme.colors.surface }}>
        <AppText>Remove {confirmDelete.name} and its progression history from your account?</AppText>
        <View style={styles.header}>
          <SecondaryButton disabled={saving} onPress={() => setConfirmDelete(null)}>Cancel</SecondaryButton>
          <PrimaryButton disabled={saving} onPress={async () => {
            if (saving) return; setSaving(true);
            const removed = await deleteTrackedLift(confirmDelete.id);
            setSaving(false); if (removed) setConfirmDelete(null);
          }}>{saving ? "Removing…" : "Remove lift"}</PrimaryButton>
        </View>
        <SaveFeedback area="lifts" onRetried={() => setConfirmDelete(null)} />
      </View> : null}
      </View>
    </Modal>
    <Modal transparent animationType="slide" visible={directory} onRequestClose={() => setDirectory(false)}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.overlay, { backgroundColor: theme.colors.sheetOverlay }]}>
          <View style={[styles.sheet, { height: "88%", backgroundColor: trainPalette.background, borderColor: theme.colors.border, paddingBottom: Math.max(18, insets.bottom) }]}>
            <View style={[styles.header, { marginBottom: 12 }]}><AppText size={20} weight="bold">Tracked lifts</AppText><Pressable accessibilityRole="button" accessibilityLabel="Close tracked lifts" hitSlop={10} onPress={() => setDirectory(false)}><AppText size={24} muted>×</AppText></Pressable></View>
            <Input bordered style={{ height: 44 }} placeholder="Search all tracked lifts" accessibilityLabel="Search all tracked lifts" value={liftQuery} onChangeText={setLiftQuery} />
            {groups.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 12 }}>
              {[{ id: null, title: "All lifts" }, ...groups].map(group => <Pressable key={group.id ?? "all"} accessibilityRole="button" accessibilityState={{ selected: group.id === (activeGroup?.id ?? null) }} onPress={() => setTemplateFilter(group.id)} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: "center", borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: group.id === (activeGroup?.id ?? null) ? theme.colors.primaryTint : "transparent" }}><AppText size={14} weight="semibold">{group.title}</AppText></Pressable>)}
            </View> : null}
            <ProgressVisibilityProvider><LiftDirectoryScroll>
              <AppText size={12} muted>{directoryLifts.length} {directoryLifts.length === 1 ? "lift" : "lifts"}{activeGroup ? ` · ${activeGroup.title}` : ""}</AppText>
              {directoryLifts.map(renderLift)}
              {!directoryLifts.length ? <AppText muted>No lifts match that search.</AppText> : null}
            </LiftDirectoryScroll></ProgressVisibilityProvider>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    <Modal transparent animationType="slide" visible={open} onRequestClose={() => { if (!saving) setOpen(false); }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={[styles.overlay, { backgroundColor: theme.colors.sheetOverlay }]} onPress={() => { if (!saving) setOpen(false); }}>
          <Pressable onPress={() => undefined} style={[styles.sheet, { backgroundColor: trainPalette.background, borderColor: theme.colors.border, paddingBottom: Math.max(18, insets.bottom) }]}>
            <ScrollBody contentContainerStyle={{ gap: 8 }}>
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
                <Field label={`Current weight (${unit})`} style={{ flex: 1 }}><Input accessibilityLabel="Current lift weight" style={{ height: 44 }} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="135" bordered /></Field>
                <Field label={`Goal weight (${unit})`} style={{ flex: 1 }}><Input accessibilityLabel="Lift goal weight" style={{ height: 44 }} value={goal} onChangeText={setGoal} keyboardType="decimal-pad" placeholder="225" bordered /></Field>
              </View>
              <View style={styles.header}>
                <Field label="Minimum reps" style={{ flex: 1 }}><Input accessibilityLabel="Minimum lift reps" style={{ height: 44 }} value={minReps} onChangeText={setMinReps} keyboardType="number-pad" bordered /></Field>
                <Field label="Maximum reps" style={{ flex: 1 }}><Input accessibilityLabel="Maximum lift reps" style={{ height: 44 }} value={maxReps} onChangeText={setMaxReps} keyboardType="number-pad" bordered /></Field>
              </View>
              <AppText size={12} muted>Updating weight or reps adds a dated history entry. Your lift and goal sync to your account.</AppText>
              {error || liftStorageError ? <AppText color={theme.colors.danger}>{error ?? liftStorageError}</AppText> : null}
              <SaveFeedback area="lifts" onRetried={() => setOpen(false)} />
              <PrimaryButton disabled={saving || !foodJournalReady} onPress={save}>{saving ? "Saving…" : "Save lift"}</PrimaryButton>
            </ScrollBody>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  </>;
}
function LiftDirectoryScroll({ children }: { children: ReactNode }) {
  const visibility = useProgressVisibility();
  useEffect(() => {
    // Re-measure after the modal's opening transition finishes.
    const timer = setTimeout(visibility.check, 400);
    return () => clearTimeout(timer);
  }, [visibility.check]);
  return <ScrollBody ref={visibility.setViewport} onScroll={visibility.check} onLayout={visibility.check} scrollEventThrottle={32} contentContainerStyle={{ gap: 8, paddingTop: 16, paddingBottom: 16 }}>{children}</ScrollBody>;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  lift: { borderRadius: 14, padding: 16, gap: 8 },
  picker: { flexDirection: "row", gap: 8, borderRadius: 12, padding: 16 },
  option: { padding: 16, borderRadius: 8, marginBottom: 3 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.74)", justifyContent: "flex-end" },
  sheet: { maxHeight: "92%", width: "100%", maxWidth: 450, alignSelf: "center", borderTopLeftRadius: 14, borderTopRightRadius: 14, borderWidth: 1, padding: 16 },
});
