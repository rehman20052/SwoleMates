import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppText, Card, Field, Input, PrimaryButton, SecondaryButton, SectionLabel } from "./ui";
import { SaveFeedback } from "./save-feedback";
import { exerciseOptions, loadExerciseCatalog } from "@/lib/exercise-catalog";
import { validWorkoutExercises, type WorkoutExercise } from "@/lib/workout-session";
import { daysFromToday, type SessionLog, useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";

type DraftExercise = { id: string; exercise: string; customName: string; sets: string; reps: string; weight: string; unit: "lb" | "kg" };
const newId = () => `exercise-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export function QuickWorkoutLog({ date = daysFromToday(0), existing, onSaved }: { date?: string; existing?: SessionLog; onSaved: () => void }) {
  const theme = useAppTheme();
  const { logWorkout, updateWorkoutLog, foodJournalReady, saveFeedback } = useAppData();
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
  const [rows, setRows] = useState<DraftExercise[]>(() => (existing?.exercises ?? []).map(row => ({ id: row.id, exercise: options.includes(row.name) ? row.name : "Other", customName: row.name, sets: String(row.sets), reps: String(row.reps), weight: String(row.weight), unit: row.unit })));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const recordId = useRef(`log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [error, setError] = useState<string | null>(null);
  const updateRow = (id: string, changes: Partial<DraftExercise>) => setRows(current => current.map(row => row.id === id ? { ...row, ...changes } : row));
  async function save() {
    if (busyRef.current || !foodJournalReady) return;
    const exercises: WorkoutExercise[] = rows.map(row => ({ id: row.id, name: (row.exercise === "Other" ? row.customName : row.exercise === "Choose exercise" ? "" : row.exercise).trim(), sets: Number(row.sets), reps: Number(row.reps), weight: row.weight.trim() ? Number(row.weight) : NaN, unit: row.unit }));
    if (!title.trim() || !validWorkoutExercises(exercises)) { setError("Add a workout name. Each exercise needs a name, 1–100 sets and reps, and a valid weight (use 0 for bodyweight)."); return; }
    busyRef.current = true; setBusy(true); setError(null);
    const saved = existing ? await updateWorkoutLog(existing.id, { title: title.trim(), notes: notes.trim() || undefined, exercises }) : await logWorkout(title.trim(), notes.trim() || undefined, date, { exercises }, recordId.current);
    busyRef.current = false; setBusy(false);
    if (saved) onSaved();
  }
  return <Card padding={16} radius={20} gap={12}>
    <SectionLabel>{existing ? "Edit workout" : "Quick workout log"}</SectionLabel>
    <Input bordered placeholder="Workout name, e.g. Push Day" value={title} onChangeText={setTitle} editable={!busy} maxLength={100} />
    {rows.map((row, index) => <View key={row.id} style={{ backgroundColor: theme.colors.surfaceRaised, padding: 12, borderRadius: 12, gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><AppText size={12} weight="bold">Exercise {index + 1}</AppText><SecondaryButton height={30} fontSize={11} disabled={busy} onPress={() => setRows(current => current.filter(item => item.id !== row.id))}>Remove</SecondaryButton></View>
      <Pressable accessibilityRole="button" accessibilityLabel={row.exercise} accessibilityState={{ expanded: pickingId === row.id, disabled: busy }} disabled={busy} onPress={() => { setPickingId(pickingId === row.id ? null : row.id); setSearch(""); }} style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <AppText style={{ flex: 1 }}>{row.exercise === "Other" ? "Other — custom exercise" : row.exercise}</AppText><AppText muted>{pickingId === row.id ? "⌃" : "⌄"}</AppText>
      </Pressable>
      {pickingId === row.id ? <View style={{ gap: 8 }}>
        <Input bordered autoFocus placeholder="Search exercises" accessibilityLabel={`Search exercises for exercise ${index + 1}`} value={search} onChangeText={setSearch} />
        <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
          {exerciseOptions(names, search).map(exercise => <Pressable key={exercise} accessibilityRole="button" accessibilityLabel={`Select ${exercise}`} onPress={() => { updateRow(row.id, { exercise }); setPickingId(null); setSearch(""); }} style={{ paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: theme.colors.border }}><AppText>{exercise === "Other" ? "Other — custom exercise" : exercise}</AppText></Pressable>)}
        </ScrollView>
      </View> : null}
      {row.exercise === "Other" ? <Input bordered placeholder="Exercise name" value={row.customName} onChangeText={customName => updateRow(row.id, { customName })} editable={!busy} maxLength={100} /> : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Field label="Sets" style={{ flex: 1 }}><Input bordered value={row.sets} onChangeText={sets => updateRow(row.id, { sets })} keyboardType="number-pad" editable={!busy} accessibilityLabel={`Exercise ${index + 1} sets`} /></Field>
        <Field label="Reps" style={{ flex: 1 }}><Input bordered value={row.reps} onChangeText={reps => updateRow(row.id, { reps })} keyboardType="number-pad" editable={!busy} accessibilityLabel={`Exercise ${index + 1} reps`} /></Field>
        <Field label={`Weight (${row.unit})`} style={{ flex: 1.3 }}><Input bordered value={row.weight} onChangeText={weight => updateRow(row.id, { weight })} keyboardType="decimal-pad" editable={!busy} accessibilityLabel={`Exercise ${index + 1} weight`} /></Field>
      </View>
      <SecondaryButton height={30} fontSize={11} disabled={busy} onPress={() => {
        const unit = row.unit === "lb" ? "kg" : "lb";
        const weight = row.weight.trim() && Number.isFinite(Number(row.weight)) ? String(Math.round(Number(row.weight) * (unit === "kg" ? 1 / 2.2046226218 : 2.2046226218) * 100) / 100) : row.weight;
        updateRow(row.id, { unit, weight });
      }}>Switch to {row.unit === "lb" ? "kg" : "lb"}</SecondaryButton>
    </View>)}
    <SecondaryButton height={38} fontSize={12} disabled={busy || rows.length >= 30} onPress={() => setRows(current => [...current, { id: newId(), exercise: "Choose exercise", customName: "", sets: "3", reps: "8", weight: "", unit: "lb" }])}>Add exercise</SecondaryButton>
    <Input bordered multiline placeholder="Workout notes (optional)" value={notes} onChangeText={setNotes} editable={!busy} />
    {error ? <AppText color={theme.colors.danger}>{error}</AppText> : null}
    <SaveFeedback area="workouts" onRetried={onSaved} />
    <PrimaryButton height={46} disabled={busy || !foodJournalReady || saveFeedback.workouts?.phase === "saving"} onPress={save}>{busy ? "Saving…" : "Save workout"}</PrimaryButton>
  </Card>;
}
