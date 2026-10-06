import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppText, Card, Input, PrimaryButton, ScrollBody, SecondaryButton, TitleBar } from "@/components/ui";
import { exerciseOptions, loadExerciseCatalog } from "@/lib/exercise-catalog";
import { parseWorkoutDraft, type DraftExercise } from "@/lib/workout-drafts";
import { useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";

const newId = () => `exercise-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function WorkoutRoutines({ onClose }: { onClose: () => void }) {
  const theme = useAppTheme();
  const { workspaceSettings, saveWorkspaceSetting, accountUserId } = useAppData();
  const [names, setNames] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<DraftExercise[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const routines = workspaceSettings.flatMap(item => {
    if (!item.id.startsWith("workout-plan:") || typeof item.value !== "object" || !item.value.content) return [];
    const plan = parseWorkoutDraft(item.value.content);
    return plan ? [{ id: item.id, ...plan }] : [];
  });
  useEffect(() => {
    let active = true;
    void loadExerciseCatalog(AsyncStorage).then(catalog => { if (active) setNames(catalog.names); });
    return () => { active = false; };
  }, []);
  function create() { setEditingId(null); setTitle(""); setRows([]); setMessage(""); }
  function edit(id: string) {
    const routine = routines.find(item => item.id === id);
    if (!routine) return;
    setEditingId(id); setTitle(routine.title); setRows(routine.rows.map(row => ({ ...row, id: newId() }))); setMessage("");
  }
  async function save() {
    const name = title.trim();
    if (!name || rows.length === 0 || rows.some(row => row.exercise === "Choose exercise")) { setMessage("Add a name and at least one exercise."); return; }
    if (!accountUserId) { setMessage("Sign in to save routines to your account."); return; }
    setBusy(true);
    const id = editingId ?? `workout-plan:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const saved = await saveWorkspaceSetting(id, JSON.stringify({ title: name, notes: "", rows: rows.map(row => ({ ...row, setValues: undefined, sets: "3", reps: "8", weight: "" })) }), accountUserId, Date.now());
    setBusy(false); setMessage(saved ? "Routine saved." : "Could not save this routine. Try again.");
    if (saved) create();
  }
  async function remove(id: string) {
    if (!accountUserId) return;
    setBusy(true); const saved = await saveWorkspaceSetting(id, "", accountUserId, Date.now()); setBusy(false);
    setMessage(saved ? "Routine deleted." : "Could not delete this routine.");
  }
  const options = exerciseOptions(names, search).filter(option => option !== "Choose exercise");
  return <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
    <TitleBar title="Workout routines" onBack={onClose} />
    <ScrollBody contentContainerStyle={{ gap: 14, paddingHorizontal: 18, paddingBottom: 28 }}>
      <AppText muted>Build a reusable exercise list here. Your workout log stays focused on today’s session and set-by-set numbers.</AppText>
      <Card padding={16} radius={20} gap={12}>
        <AppText size={19} weight="bold">{editingId ? "Edit routine" : "Create a routine"}</AppText>
        <Input bordered placeholder="Routine name, e.g. Upper body" value={title} onChangeText={setTitle} maxLength={100} />
        {rows.map((row, index) => <View key={row.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 13, backgroundColor: theme.colors.surfaceRaised }}>
          <AppText size={12} weight="bold" color={theme.colors.accent}>{String(index + 1).padStart(2, "0")}</AppText>
          <AppText style={{ flex: 1 }}>{row.exercise === "Other" ? row.customName || "Custom exercise" : row.exercise}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${row.exercise}`} onPress={() => setRows(current => current.filter(item => item.id !== row.id))}><AppText color={theme.colors.danger} size={12} weight="bold">Remove</AppText></Pressable>
        </View>)}
        {rows.length < 30 ? <View style={{ gap: 8 }}>
          <Input bordered placeholder="Search exercises to add" value={search} onChangeText={setSearch} />
          <View style={{ maxHeight: 190 }}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 2 }}>
              {options.slice(0, 12).map(exercise => <Pressable key={exercise} accessibilityRole="button" onPress={() => { setRows(current => [...current, { id: newId(), exercise, customName: "", sets: "3", reps: "8", weight: "", unit: "lb" }]); setSearch(""); }} style={{ padding: 10, borderBottomWidth: 1, borderColor: theme.colors.border }}><AppText size={13}>{exercise === "Other" ? "Custom exercise" : exercise}</AppText></Pressable>)}
            </ScrollView>
          </View>
          <AppText muted size={11}>Tap an exercise above to add it to the routine.</AppText>
        </View> : null}
        <View style={{ flexDirection: "row", gap: 8 }}><PrimaryButton style={{ flex: 1 }} disabled={busy} onPress={() => void save()}>{busy ? "Saving…" : editingId ? "Save changes" : "Save routine"}</PrimaryButton><SecondaryButton onPress={create}>Clear</SecondaryButton></View>
        {message ? <AppText muted size={12}>{message}</AppText> : null}
      </Card>
      <AppText size={18} weight="bold">Your routines</AppText>
      {routines.length ? routines.map(routine => <Card key={routine.id} padding={14} radius={16} gap={8}>
        <AppText size={16} weight="bold">{routine.title}</AppText>
        <AppText size={12} muted>{routine.rows.map(row => row.exercise === "Other" ? row.customName : row.exercise).join(" · ")}</AppText>
        <View style={{ flexDirection: "row", gap: 8 }}><SecondaryButton style={{ flex: 1 }} onPress={() => edit(routine.id)}>Edit routine</SecondaryButton><SecondaryButton textColor={theme.colors.danger} disabled={busy} onPress={() => void remove(routine.id)}>Delete</SecondaryButton></View>
      </Card>) : <AppText muted>No routines saved yet. Create one above.</AppText>}
    </ScrollBody>
  </View>;
}
