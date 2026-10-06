import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppText, Card, Field, Input, PrimaryButton, ScrollBody, SecondaryButton, SectionLabel, TitleBar } from "@/components/ui";
import { exerciseOptions, loadExerciseCatalog } from "@/lib/exercise-catalog";
import { parseWorkoutDraft, type DraftExercise } from "@/lib/workout-drafts";
import { useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";
import { RepeatStepButton } from "@/components/repeat-step-button";

type Step = "list" | "details" | "exercises" | "review";
const newId = () => `exercise-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const blankRow = (exercise: string, customName = ""): DraftExercise => ({ id: newId(), exercise, customName, sets: "3", reps: "", weight: "", unit: "lb", restSeconds: "" });

export function WorkoutRoutines({ onClose }: { onClose: () => void }) {
  const theme = useAppTheme();
  const { workspaceSettings, saveWorkspaceSetting, accountUserId } = useAppData();
  const [step, setStep] = useState<Step>("list");
  const [names, setNames] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<DraftExercise[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
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
  function startNew() { setEditingId(null); setConfirmDeleteId(null); setTitle(""); setDescription(""); setRows([]); setSearch(""); setMessage(""); setStep("details"); }
  function edit(id: string) {
    const routine = routines.find(item => item.id === id); if (!routine) return;
    setEditingId(id); setTitle(routine.title); setDescription(routine.notes ?? "");
    setRows(routine.rows.map(row => ({ ...row, id: newId(), reps: "", weight: "", restSeconds: "" })));
    setConfirmDeleteId(null); setMessage(""); setStep("details");
  }
  function updateRow(id: string, patch: Partial<DraftExercise>) { setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row)); }
  function setCount(row: DraftExercise) {
    const value = Number(row.sets);
    return Number.isInteger(value) && value >= 1 && value <= 100 ? value : 1;
  }
  function move(index: number, direction: -1 | 1) {
    const target = index + direction; if (target < 0 || target >= rows.length) return;
    setRows(current => { const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  }
  async function save() {
    if (!title.trim() || !rows.length) { setMessage("Add a template name and at least one exercise."); return; }
    if (rows.some(row => row.exercise === "Other" && !row.customName.trim())) { setMessage("Enter a name for every custom exercise."); return; }
    if (rows.some(row => !Number.isInteger(Number(row.sets)) || Number(row.sets) < 1 || Number(row.sets) > 100)) { setMessage("Each exercise needs between 1 and 100 sets."); return; }
    if (!accountUserId) { setMessage("Sign in to save templates to your account."); return; }
    setBusy(true);
    const id = editingId ?? `workout-plan:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const saved = await saveWorkspaceSetting(id, JSON.stringify({ title: title.trim(), notes: description.trim(), rows: rows.map(row => ({ ...row, reps: "", weight: "", restSeconds: "", setValues: undefined })) }), accountUserId, Date.now());
    setBusy(false); setMessage(saved ? "Template saved." : "Could not save this template.");
    if (saved) setStep("list");
  }
  async function remove(id: string) {
    if (!accountUserId) { setMessage("Sign in to delete templates from your account."); return; }
    setBusy(true);
    const deleted = await saveWorkspaceSetting(id, "", accountUserId, Date.now());
    setBusy(false);
    if (!deleted) { setMessage("Could not delete this template."); return; }
    setConfirmDeleteId(null);
    setEditingId(null);
    setMessage("Template deleted.");
    setStep("list");
  }
  function deleteConfirmation(id: string, title: string) {
    return confirmDeleteId === id ? <Card padding={14} radius={16} gap={10} style={{ borderColor: theme.colors.danger }}>
      <AppText weight="bold">Delete “{title}”?</AppText>
      <AppText size={12} muted>This permanently removes the workout template. This action cannot be undone.</AppText>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <SecondaryButton style={{ flex: 1 }} disabled={busy} onPress={() => setConfirmDeleteId(null)}>Cancel</SecondaryButton>
        <SecondaryButton style={{ flex: 1 }} textColor={theme.colors.danger} disabled={busy} onPress={() => void remove(id)}>{busy ? "Deleting…" : "Delete permanently"}</SecondaryButton>
      </View>
    </Card> : null;
  }
  const options = exerciseOptions(names, search).filter(option => option !== "Choose exercise");

  if (step === "list") return <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
    <TitleBar title="Workout templates" onBack={onClose} right={<Pressable accessibilityRole="button" accessibilityLabel="Create template" onPress={startNew} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" }}><AppText size={22} weight="black" color={theme.colors.primaryText}>+</AppText></Pressable>} />
    <ScrollBody contentContainerStyle={{ gap: 12, paddingHorizontal: 18, paddingBottom: 28 }}>
      <SectionLabel>My templates</SectionLabel>
      {routines.map(routine => <View key={routine.id} style={{ gap: 8 }}>
        <Card padding={14} radius={16} gap={5} style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${routine.title}`} onPress={() => edit(routine.id)} style={{ flex: 1, gap: 4 }}>
            <AppText size={16} weight="bold">{routine.title}</AppText><AppText size={11} muted>{routine.rows.length} exercises{routine.notes ? ` · ${routine.notes}` : ""}</AppText>
          </Pressable>
          <SecondaryButton height={34} textColor={theme.colors.danger} disabled={busy} onPress={() => setConfirmDeleteId(routine.id)}>Delete</SecondaryButton>
        </Card>
        {deleteConfirmation(routine.id, routine.title)}
      </View>)}
      {message ? <AppText color={message.includes("deleted") ? theme.colors.success : theme.colors.danger}>{message}</AppText> : null}
      {!routines.length ? <Card padding={18} radius={18} gap={6}><AppText weight="bold">No templates yet</AppText><AppText muted>Build a reusable workout with default sets, reps, and rest times.</AppText></Card> : null}
      <PrimaryButton onPress={startNew}>+ Create template</PrimaryButton>
    </ScrollBody>
  </View>;

  return <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
    <TitleBar title={step === "details" ? (editingId ? "Edit template" : "Create template") : step === "exercises" ? "Add exercises" : "Review template"} onBack={() => step === "details" ? setStep("list") : setStep(step === "review" ? "exercises" : "details")} />
    <ScrollBody contentContainerStyle={{ gap: 14, paddingHorizontal: 18, paddingBottom: 28 }}>
      <View style={{ flexDirection: "row", gap: 6 }}>{["Details", "Exercises", "Review"].map((label, index) => { const active = ["details", "exercises", "review"].indexOf(step) >= index; return <View key={label} style={{ flex: 1, gap: 5 }}><View style={{ height: 4, borderRadius: 2, backgroundColor: active ? theme.colors.primary : theme.colors.border }} /><AppText size={10} muted={!active} primary={active}>{label}</AppText></View>; })}</View>
      {step === "details" ? <Card padding={16} radius={18} gap={14}>
        <Field label="Template name"><Input bordered value={title} onChangeText={setTitle} placeholder="e.g. Push Day" maxLength={100} /></Field>
        <Field label="Description (optional)"><Input bordered multiline value={description} onChangeText={setDescription} placeholder="Chest, shoulders, and triceps" maxLength={300} /></Field>
        <PrimaryButton disabled={!title.trim()} onPress={() => setStep("exercises")}>Next: Add exercises</PrimaryButton>
      </Card> : null}
      {step === "exercises" ? <>
        <Input bordered placeholder="Search exercises" value={search} onChangeText={setSearch} />
        <Card padding={8} radius={16} gap={0}><ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">{options.slice(0, 30).map(exercise => {
          const customName = exercise === "Other" ? search.trim().slice(0, 100) : "";
          return <Pressable key={exercise} onPress={() => { setRows(current => [...current, blankRow(exercise, customName)]); setSearch(""); }} style={{ padding: 12, borderBottomWidth: 1, borderColor: theme.colors.border, flexDirection: "row", alignItems: "center" }}><AppText style={{ flex: 1 }} weight="bold">{exercise === "Other" ? customName ? `Add “${customName}” as a custom exercise` : "Custom exercise" : exercise}</AppText><View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" }}><AppText weight="black" color={theme.colors.primaryText}>+</AppText></View></Pressable>;
        })}</ScrollView></Card>
        <AppText size={15} weight="bold">Added exercises ({rows.length})</AppText>
        {rows.map((row, index) => <Card key={row.id} padding={12} radius={14} gap={4} style={{ flexDirection: "row", alignItems: "center" }}><AppText size={12} primary weight="bold">{index + 1}</AppText><AppText style={{ flex: 1 }} weight="bold">{row.exercise === "Other" ? row.customName || "Custom exercise" : row.exercise}</AppText><SecondaryButton height={30} onPress={() => setRows(current => current.filter(item => item.id !== row.id))}>Remove</SecondaryButton></Card>)}
        <PrimaryButton disabled={!rows.length} onPress={() => setStep("review")}>Review template</PrimaryButton>
      </> : null}
      {step === "review" ? <>
        <Card padding={15} radius={18} gap={4}><AppText size={19} weight="black">{title}</AppText><AppText muted>{description || `${rows.length} exercise template`}</AppText></Card>
        {rows.map((row, index) => <Card key={row.id} padding={14} radius={16} gap={10}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><View style={{ flex: 1 }}><AppText weight="bold">{index + 1}. {row.exercise === "Other" ? row.customName || "Custom exercise" : row.exercise}</AppText></View><SecondaryButton height={30} disabled={index === 0} onPress={() => move(index, -1)}>↑</SecondaryButton><SecondaryButton height={30} disabled={index === rows.length - 1} onPress={() => move(index, 1)}>↓</SecondaryButton></View>
          {row.exercise === "Other" ? <Input bordered placeholder="Exercise name" value={row.customName} onChangeText={customName => updateRow(row.id, { customName })} /> : null}
          <View style={{ gap: 7 }}>
            <AppText size={14} weight="bold" muted>Number of sets</AppText>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 10, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}>
              <RepeatStepButton label={`Decrease sets for ${row.exercise === "Other" ? row.customName || "custom exercise" : row.exercise}`} value={setCount(row)} min={1} max={100} direction={-1} onChange={value => updateRow(row.id, { sets: String(value) })} style={{ width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surfaceRaised }}><AppText size={14} weight="bold">−</AppText></RepeatStepButton>
              <View style={{ alignItems: "center" }}><AppText size={28} weight="black">{setCount(row)}</AppText><AppText size={10} muted>{setCount(row) === 1 ? "set" : "sets"}</AppText></View>
              <RepeatStepButton label={`Increase sets for ${row.exercise === "Other" ? row.customName || "custom exercise" : row.exercise}`} value={setCount(row)} min={1} max={100} direction={1} onChange={value => updateRow(row.id, { sets: String(value) })} style={{ width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surfaceRaised }}><AppText size={14} weight="bold">+</AppText></RepeatStepButton>
            </View>
          </View>
        </Card>)}
        {message ? <AppText color={message.includes("saved") ? theme.colors.success : theme.colors.danger}>{message}</AppText> : null}
        <PrimaryButton disabled={busy} onPress={() => void save()}>{busy ? "Saving…" : "Save template"}</PrimaryButton>
        {editingId ? <>
          <SecondaryButton textColor={theme.colors.danger} disabled={busy} onPress={() => setConfirmDeleteId(editingId)}>Delete template</SecondaryButton>
          {deleteConfirmation(editingId, title)}
        </> : null}
      </> : null}
    </ScrollBody>
  </View>;
}
