import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppText, Card, Field, Input, PrimaryButton, SecondaryButton, SectionLabel } from "./ui";
import { useSavedDraft } from "@/lib/use-saved-draft";
import { SaveFeedback } from "./save-feedback";
import { exerciseOptions, loadExerciseCatalog } from "@/lib/exercise-catalog";
import { validWorkoutExercises, type WorkoutExercise } from "@/lib/workout-session";
import { daysFromToday, type SessionLog, useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";

import { parseWorkoutDraft, type DraftExercise } from "@/lib/workout-drafts";
const newId = () => `exercise-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export function QuickWorkoutLog({ date = daysFromToday(0), existing, onSaved, onManageRoutines }: { date?: string; existing?: SessionLog; onSaved: () => void; onManageRoutines?: () => void }) {
  const theme = useAppTheme();
  const { logWorkout, updateWorkoutLog, foodJournalReady, saveFeedback, workspaceSettings } = useAppData();
  const options = ["Choose exercise", ...exerciseOptions([], "")];
  const [names, setNames] = useState<string[]>([]);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  useEffect(() => {
    let active = true;
    void loadExerciseCatalog(AsyncStorage).then(catalog => { if (active) setNames(catalog.names); });
    return () => { active = false; };
  }, []);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [rows, setRows] = useState<DraftExercise[]>(() => (existing?.exercises ?? []).map(row => ({ id: row.id, exercise: options.includes(row.name) ? row.name : "Other", customName: row.name, sets: String(row.sets), reps: String(row.reps), weight: String(row.weight), unit: row.unit, setValues: row.setDetails?.map(set => ({ reps: String(set.reps), weight: String(set.weight) })) ?? Array.from({ length: row.sets }, () => ({ reps: String(row.reps), weight: String(row.weight) })) })));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const recordId = useRef(`log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [error, setError] = useState<string | null>(null);
  const [plansOpen, setPlansOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const draft = useSavedDraft("draft:workout:" + (existing?.id ?? date), content => {
    const saved = parseWorkoutDraft(content);
    if (!saved) return;
    setTitle(saved.title); setNotes(saved.notes); setRows(saved.rows);
    if (typeof saved.recordId === "string") recordId.current = saved.recordId;
  });
  const changed = useRef(false);
  useEffect(() => {
    if (draft.ready && changed.current) draft.save(JSON.stringify({ title, notes, rows, recordId: recordId.current }));
  }, [title, notes, rows, draft.ready]);
  const changeTitle = (value: string) => { changed.current = true; setTitle(value); };
  const changeNotes = (value: string) => { changed.current = true; setNotes(value); };
  const changeRows = (update: React.SetStateAction<DraftExercise[]>) => { changed.current = true; setRows(update); };
  const plans = workspaceSettings.flatMap(item => {
    if (!item.id.startsWith("workout-plan:") || typeof item.value !== "object" || !item.value.content) return [];
    const plan = parseWorkoutDraft(item.value.content); return plan ? [{ id: item.id, ...plan }] : [];
  });
  const updateRow = (id: string, changes: Partial<DraftExercise>) => changeRows(current => current.map(row => row.id === id ? { ...row, ...changes } : row));
  async function save() {
    if (busyRef.current || !foodJournalReady) return;
    const exercises: WorkoutExercise[] = rows.map(row => {
      const details = row.setValues?.length ? row.setValues : Array.from({ length: Number(row.sets) }, () => ({ reps: row.reps, weight: row.weight }));
      return { id: row.id, name: (row.exercise === "Other" ? row.customName : row.exercise === "Choose exercise" ? "" : row.exercise).trim(), sets: details.length, reps: Number(details[0]?.reps), weight: details[0]?.weight.trim() ? Number(details[0].weight) : NaN, unit: row.unit, setDetails: details.map(set => ({ reps: Number(set.reps), weight: set.weight.trim() ? Number(set.weight) : NaN })) };
    });
    if (!title.trim() || !validWorkoutExercises(exercises)) { setError("Add a workout name. Each exercise needs a name, 1–100 sets and reps, and a valid weight (use 0 for bodyweight)."); return; }
    busyRef.current = true; setBusy(true); setError(null);
    const saved = existing ? await updateWorkoutLog(existing.id, { title: title.trim(), notes: notes.trim() || undefined, exercises }) : await logWorkout(title.trim(), notes.trim() || undefined, date, { exercises }, recordId.current);
    busyRef.current = false; setBusy(false);
    if (saved) { changed.current = false; draft.clear(); onSaved(); }
  }
  return <Card padding={16} radius={20} gap={12}>
    <SectionLabel>{existing ? "Edit workout" : "Quick workout log"}</SectionLabel>
    <AppText muted size={12}>{draft.status || "Unfinished workouts save as drafts"}</AppText>
    <View style={{ flexDirection: "row", gap: 8 }}><SecondaryButton style={{ flex: 1 }} height={38} onPress={() => setPlansOpen(!plansOpen)}>{plansOpen ? "Hide routines" : "Use a routine"}</SecondaryButton>{onManageRoutines ? <SecondaryButton style={{ flex: 1 }} height={38} onPress={onManageRoutines}>Manage routines</SecondaryButton> : null}</View>
    {plansOpen ? <View style={{ gap: 8 }}>
      <AppText muted size={12}>Choose a routine to fill today’s exercises. You can still change every set.</AppText>
      {plans.map(plan => <SecondaryButton key={plan.id} onPress={() => {
          if (rows.length || title.trim()) { setError("Start a fresh log before loading a plan so your current exercises stay safe."); return; }
          changed.current = true; setTitle(plan.title); setNotes(plan.notes ?? ""); setRows(plan.rows.map((row: DraftExercise) => ({ ...row, id: newId(), setValues: Array.from({ length: Math.max(1, Number(row.sets) || 3) }, () => ({ reps: row.reps || "8", weight: row.weight || "" })) }))); setPlansOpen(false); setSelectedPlan(plan.id); setError(null);
        }}>{plan.title}</SecondaryButton>)}
      {!plans.length ? <AppText muted>No routines yet. Open Manage routines to build one.</AppText> : null}
    </View> : null}
    <Input bordered placeholder="Workout name, e.g. Push Day" value={title} onChangeText={changeTitle} editable={!busy && draft.ready} maxLength={100} />
    {rows.map((row, index) => <View key={row.id} style={{ backgroundColor: theme.colors.surfaceRaised, padding: 12, borderRadius: 12, gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><AppText size={12} weight="bold">Exercise {index + 1}</AppText><SecondaryButton height={30} fontSize={11} disabled={busy} onPress={() => changeRows(current => current.filter(item => item.id !== row.id))}>Remove</SecondaryButton></View>
      <Pressable accessibilityRole="button" accessibilityLabel={row.exercise} accessibilityState={{ expanded: pickingId === row.id, disabled: busy }} disabled={busy} onPress={() => { setPickingId(pickingId === row.id ? null : row.id); setSearch(""); }} style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <AppText style={{ flex: 1 }}>{row.exercise === "Other" ? "Other — custom exercise" : row.exercise}</AppText><AppText muted>{pickingId === row.id ? "⌃" : "⌄"}</AppText>
      </Pressable>
      {pickingId === row.id ? <View style={{ gap: 8 }}>
        <Input bordered autoFocus placeholder="Search exercises" accessibilityLabel={`Search exercises for exercise ${index + 1}`} value={search} onChangeText={setSearch} />
        <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
          {exerciseOptions(names, search).map(exercise => <Pressable key={exercise} accessibilityRole="button" accessibilityLabel={`Select ${exercise}`} onPress={() => { updateRow(row.id, { exercise }); setPickingId(null); setSearch(""); }} style={{ paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: theme.colors.border }}><AppText>{exercise === "Other" ? "Other — custom exercise" : exercise}</AppText></Pressable>)}
        </ScrollView>
      </View> : null}
      {row.exercise === "Other" ? <Input bordered placeholder="Exercise name" value={row.customName} onChangeText={customName => updateRow(row.id, { customName })} editable={!busy && draft.ready} maxLength={100} /> : null}
      <AppText size={11} muted>Log each set separately</AppText>
      {(row.setValues?.length ? row.setValues : [{ reps: row.reps || "8", weight: row.weight }]).map((set, setIndex) => <View key={setIndex} style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
        <AppText size={12} weight="bold" style={{ width: 38, paddingBottom: 13 }}>Set {setIndex + 1}</AppText>
        <Field label="Reps" style={{ flex: 1 }}><Input bordered value={set.reps} onChangeText={reps => updateRow(row.id, { setValues: (row.setValues?.length ? row.setValues : [{ reps: row.reps || "8", weight: row.weight }]).map((item, i) => i === setIndex ? { ...item, reps } : item) })} keyboardType="number-pad" editable={!busy && draft.ready} accessibilityLabel={`Exercise ${index + 1} set ${setIndex + 1} reps`} /></Field>
        <Field label={`Weight (${row.unit})`} style={{ flex: 1.25 }}><Input bordered value={set.weight} onChangeText={weight => updateRow(row.id, { setValues: (row.setValues?.length ? row.setValues : [{ reps: row.reps || "8", weight: row.weight }]).map((item, i) => i === setIndex ? { ...item, weight } : item) })} keyboardType="decimal-pad" editable={!busy && draft.ready} accessibilityLabel={`Exercise ${index + 1} set ${setIndex + 1} weight`} /></Field>
        {(row.setValues?.length ?? 1) > 1 ? <SecondaryButton height={42} fontSize={16} accessibilityLabel={`Remove set ${setIndex + 1}`} onPress={() => { const next = (row.setValues ?? [{ reps: row.reps || "8", weight: row.weight }]).filter((_, i) => i !== setIndex); updateRow(row.id, { setValues: next, sets: String(next.length), reps: next[0]?.reps ?? "", weight: next[0]?.weight ?? "" }); }}>−</SecondaryButton> : null}
      </View>)}
      <SecondaryButton height={34} fontSize={11} disabled={busy || (row.setValues?.length ?? 1) >= 100} onPress={() => { const current = row.setValues?.length ? row.setValues : [{ reps: row.reps || "8", weight: row.weight }]; const last = current[current.length - 1]; const next = [...current, { ...last }]; updateRow(row.id, { setValues: next, sets: String(next.length) }); }}>+ Add set</SecondaryButton>
      <SecondaryButton height={30} fontSize={11} disabled={busy} onPress={() => {
        const unit = row.unit === "lb" ? "kg" : "lb";
        const convert = (weight: string) => weight.trim() && Number.isFinite(Number(weight)) ? String(Math.round(Number(weight) * (unit === "kg" ? 1 / 2.2046226218 : 2.2046226218) * 100) / 100) : weight;
        updateRow(row.id, { unit, weight: convert(row.weight), setValues: row.setValues?.map(set => ({ ...set, weight: convert(set.weight) })) });
      }}>Switch to {row.unit === "lb" ? "kg" : "lb"}</SecondaryButton>
    </View>)}
    <SecondaryButton height={38} fontSize={12} disabled={busy || rows.length >= 30} onPress={() => changeRows(current => [...current, { id: newId(), exercise: "Choose exercise", customName: "", sets: "1", reps: "8", weight: "", unit: "lb", setValues: [{ reps: "8", weight: "" }] }])}>+ Add exercise</SecondaryButton>
    <Input bordered multiline maxLength={10000} placeholder="Workout notes (optional)" value={notes} onChangeText={changeNotes} editable={!busy && draft.ready} />
    {!existing && (title || rows.length || notes) ? <View style={{ flexDirection: "row", gap: 8 }}>
      <SecondaryButton disabled={busy} onPress={() => {
        if (!discarding) { setDiscarding(true); return; }
        changed.current = false; setTitle(""); setNotes(""); setRows([]); draft.clear();
        recordId.current = newId(); setSelectedPlan(null); setDiscarding(false); setError(null);
      }}>{discarding ? "Confirm discard" : "Discard draft"}</SecondaryButton>
      {discarding ? <SecondaryButton onPress={() => setDiscarding(false)}>Keep draft</SecondaryButton> : null}
    </View> : null}
    {error ? <AppText color={theme.colors.danger}>{error}</AppText> : null}
    <SaveFeedback area="drafts" />
    <SaveFeedback area="workouts" onRetried={() => { changed.current = false; draft.clear(); onSaved(); }} />
    <PrimaryButton height={46} disabled={busy || !foodJournalReady || saveFeedback.workouts?.phase === "saving"} onPress={save}>{busy ? "Saving…" : "Save workout"}</PrimaryButton>
  </Card>;
}
