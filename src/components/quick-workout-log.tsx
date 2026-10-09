import { BRAND_LIME } from "@/theme";
import { TrainTelemetry, TrainNumber, TrainSetInput, TrainIconBadge, trainingSummary, TrainText as AppText, TrainInput as Input, useTrainPalette } from "./train-ui";
import { TrainLabel as SectionLabel, TrainSection as Card, TrainPrimary as PrimaryButton, TrainSecondary as SecondaryButton, TrainSaveFeedback as SaveFeedback } from "./train-ui";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useSavedDraft } from "@/lib/use-saved-draft";
import { exerciseOptions, loadExerciseCatalog } from "@/lib/exercise-catalog";
import { uniqueWorkoutTemplates, parseWorkoutDraft, type DraftExercise, type DraftSet, type WorkoutDraft } from "@/lib/workout-drafts";
import { completedExercises, draftSets, exerciseName, exerciseToDraft, lastPerformance, performanceHistory, prefillExercise, validDraftSet, volumeLabel, workoutRecords, workoutStats } from "@/lib/workout-logging";
import { validWorkoutExercises } from "@/lib/workout-session";
import { daysFromToday, type SessionLog, useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";
import { createPost } from "@/lib/social";

const newId = () => `exercise-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
type Props = { date?: string; existing?: SessionLog; onSaved: () => void; onManageRoutines?: () => void; plannedWorkoutId?: string; initialPlan?: { name: string; sets: number; reps: number }[]; initialTitle?: string; collapsed?: boolean; onStarted?: () => void; repeatRequest?: SessionLog | null; onRepeatHandled?: () => void };

export function QuickWorkoutLog(props: Props) {
  const { accountUserId } = useAppData();
  // Do not carry edits across accounts, calendar entries, or partner sessions.
  return <WorkoutLogContent key={`${accountUserId}:${props.existing?.id ?? props.plannedWorkoutId ?? props.date ?? "active"}`} {...props} />;
}

function WorkoutLogContent({ date, existing, onSaved, onManageRoutines, plannedWorkoutId, initialPlan, initialTitle, collapsed = false, onStarted, repeatRequest, onRepeatHandled }: Props) {
  const theme = useAppTheme();
  const trainPalette = useTrainPalette();
  const { logWorkout, updateWorkoutLog, foodJournalReady, logs, workspaceSettings, saveWorkspaceSetting, accountUserId } = useAppData();
  const [workoutDate, setWorkoutDate] = useState(existing?.date ?? date ?? daysFromToday(0));
  const [title, setTitle] = useState(existing?.title ?? initialTitle ?? "Workout");
  const [sourceTemplateId, setSourceTemplateId] = useState<string | undefined>(existing?.sourceTemplateId);
  const [workoutOrigin, setWorkoutOrigin] = useState<"manual" | "template">(existing?.workoutOrigin ?? (initialPlan ? "template" : "manual"));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [rows, setRows] = useState<DraftExercise[]>(() => existing?.exercises?.map(row => exerciseToDraft(row, row.id, true)) ?? initialPlan?.map(row => {
    const previous = lastPerformance(performanceHistory(logs, date ?? daysFromToday(0)), row.name);
    return prefillExercise(exerciseToDraft({ ...row, id: newId(), weight: 0, unit: "lb" }, newId()), previous);
  }) ?? []);
  const [started, setStarted] = useState(!!(existing || plannedWorkoutId || initialPlan));
  const [reviewing, setReviewing] = useState(false);
  const [showDetails, setShowDetails] = useState(!!existing);
  const [picking, setPicking] = useState<string | null>(null);
  const [exerciseMenu, setExerciseMenu] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const attemptedFinish = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareText, setShareText] = useState("");
  const [shared, setShared] = useState(false);
  const changed = useRef(false);
  const recordId = useRef(plannedWorkoutId ? `session-${plannedWorkoutId}` : `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const draftId = `draft:workout:${plannedWorkoutId ?? existing?.id ?? date ?? "active"}`;
  const draft = useSavedDraft(draftId, content => {
    const saved = parseWorkoutDraft(content);
    if (!saved) return;
    // A completed record wins if the app closed before its draft was cleared.
    if (!existing && logs.some(log => log.id === saved.recordId)) return;
    setSourceTemplateId(saved.sourceTemplateId); setWorkoutOrigin(saved.workoutOrigin ?? "manual"); setTitle(saved.title || "Workout"); setNotes(saved.notes); setRows(saved.rows);
    setWorkoutDate(saved.workoutDate ?? date ?? daysFromToday(0));
    setStarted(saved.started ?? !!(saved.rows.length || saved.title || saved.notes));
    if (saved.recordId) recordId.current = saved.recordId;
  }, !date && !existing && !plannedWorkoutId ? `draft:workout:${daysFromToday(0)}` : undefined);
  useEffect(() => {
    let active = true;
    void loadExerciseCatalog(AsyncStorage).then(catalog => { if (active) setNames(catalog.names); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (draft.ready && changed.current) void draft.save(JSON.stringify({ title, notes, rows, workoutOrigin, sourceTemplateId, recordId: recordId.current, workoutDate, started }));
  }, [title, notes, rows, workoutOrigin, sourceTemplateId, workoutDate, started, draft.ready]);
  const history = performanceHistory(logs, workoutDate, existing?.id);
  const lastWorkout = history[0];
  const plans = uniqueWorkoutTemplates(workspaceSettings.flatMap(item => {
    if (!item.id.startsWith("workout-plan:") || typeof item.value !== "object" || !item.value.content) return [];
    const plan = parseWorkoutDraft(item.value.content);
    return plan ? [{ id: item.id, ...plan }] : [];
  }));
  const stats = workoutStats(rows);
  const records = workoutRecords(stats.exercises, history);
  const legacyEdit = !!existing && !rows.length;
  const locked = busy || !draft.ready || !foodJournalReady;
  function editRows(update: React.SetStateAction<DraftExercise[]>) { changed.current = true; setRows(update); setError(null); }
  function updateRow(id: string, changes: Partial<DraftExercise>) { editRows(current => current.map(row => row.id === id ? { ...row, ...changes } : row)); }
  function updateSet(row: DraftExercise, index: number, changes: Partial<DraftSet>) {
    updateRow(row.id, { setValues: draftSets(row).map((set, i) => i === index ? { ...set, ...changes, completed: changes.completed ?? false } : set) });
  }
  function begin(plan?: WorkoutDraft & { id?: string }, repeat?: SessionLog) {
    if (locked) return;
    changed.current = true;
    setSourceTemplateId(plan?.id ?? repeat?.sourceTemplateId); setWorkoutOrigin(plan ? "template" : repeat?.workoutOrigin ?? "manual"); setTitle(repeat?.title ?? plan?.title ?? "Workout"); setNotes(plan?.notes ?? "");
    setRows(repeat?.exercises?.map(row => exerciseToDraft(row, newId())) ?? plan?.rows.map(row => prefillExercise({ ...row, id: newId() }, lastPerformance(history, exerciseName(row)))) ?? []);
    setStarted(true); setError(null); onStarted?.();
  }
  useEffect(() => {
    if (!repeatRequest || locked) return;
    if (started) setError("Finish or discard your current workout before repeating another.");
    else begin(undefined, repeatRequest);
    onRepeatHandled?.();
  }, [repeatRequest, locked]);
  function selectExercise(name: string) {
    const customName = name === "Other" ? search.trim().slice(0, 100) : name;
    const previous = lastPerformance(history, customName);
    const row: DraftExercise = { id: picking === "new" ? newId() : picking!, exercise: name, customName, sets: String(previous?.sets ?? 3), reps: "8", weight: "0", unit: "lb" };
    const filled = prefillExercise(row, previous);
    if (picking === "new") editRows(current => [...current, filled]); else updateRow(row.id, filled);
    setPicking(null); setSearch("");
  }
  function moveExercise(index: number, direction: number) {
    editRows(current => { const next = [...current]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; return next; });
  }
  function review() {
    if (!stats.sets && !legacyEdit) { setError("Complete at least one set using its checkmark."); return; }
    if (rows.some(row => draftSets(row).some(set => set.completed && !validDraftSet(set))) || !validWorkoutExercises(stats.exercises)) {
      setError("Completed sets need an exercise name, 1–100 reps, and a valid weight (0 for bodyweight)."); return;
    }
    setPicking(null); setError(null); setReviewing(true);
  }
  function finish() {
    setSourceTemplateId(undefined); setWorkoutOrigin("manual"); setStarted(false); setRows([]); setTitle("Workout"); setNotes(""); setReviewing(false); setSharing(false); setShared(false); setShowDetails(false); setTemplateMessage(null);
    setWorkoutDate(date ?? daysFromToday(0)); recordId.current = `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    onSaved();
  }
  async function save(offerShare = false) {
    if (busyRef.current || locked) return;
    const exercises = completedExercises(rows);
    if ((!exercises.length && !legacyEdit) || !validWorkoutExercises(exercises)) { setError("Review your completed sets before saving."); return; }
    busyRef.current = true; setBusy(true); setError(null);
    attemptedFinish.current = true;
    try {
      const saved = existing ? await updateWorkoutLog(existing.id, { title: title.trim() || "Workout", notes: notes.trim() || undefined, exercises })
        : await logWorkout(title.trim() || "Workout", notes.trim() || undefined, workoutDate, { exercises, plannedWorkoutId, workoutOrigin, sourceTemplateId }, recordId.current);
      if (!saved) { setError("Could not save this workout. Your draft is preserved; try again."); return; }
      attemptedFinish.current = false; changed.current = false; await draft.clear();
      if (offerShare) {
        setShareText(`${title.trim() || "Workout"}\n${exercises.length} exercises · ${stats.sets} completed sets · ${volumeLabel(stats.volume)} volume\n${exercises.map(row => `${row.name}: ${row.setDetails?.map(set => `${set.weight} ${row.unit} × ${set.reps}`).join(", ")}`).join("\n")}${records.length ? `\n${records.join("\n")}` : ""}`.slice(0, 2000));
        setSharing(true);
      } else finish();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save your workout. Please try again."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function saveTemplate() {
    if (busyRef.current || locked || !accountUserId) return;
    if (!rows.length || rows.some(row => !exerciseName(row))) { setError("Name each exercise before saving a template."); return; }
    busyRef.current = true; setBusy(true);
    try {
      const saved = await saveWorkspaceSetting(`workout-plan:${recordId.current}`, JSON.stringify({ title: title.trim() || "Workout", notes, rows: rows.map(row => ({ ...row, sets: String(draftSets(row).length), setValues: draftSets(row).map(set => ({ ...set, completed: false })) })) }), accountUserId, Date.now());
      setTemplateMessage(saved ? "Template saved." : "Could not save template. Try again.");
    } catch { setTemplateMessage("Could not save template. Try again."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function discard() {
    changed.current = false; void draft.clear(); setRows([]); setTitle("Workout"); setNotes(""); setStarted(false);
    setReviewing(false); setDiscarding(false); setPicking(null); setError(null); setTemplateMessage(null); recordId.current = `log-${newId()}`;
  }
  if (!draft.ready) return collapsed ? null : <Card padding={16} radius={20}><AppText muted>Loading your workout…</AppText></Card>;
  if (collapsed) {
    if (started) return <Card padding={16} gap={16} style={{ borderTopWidth: 0, borderLeftWidth: 2, borderLeftColor: BRAND_LIME, paddingLeft: 14, backgroundColor: "transparent" }}><TrainTelemetry>[ WORKOUT // IN PROGRESS ]</TrainTelemetry><AppText size={22} weight="bold">{title.trim() || "Workout"}</AppText><AppText size={12} muted>{rows.length} exercises / {stats.sets} completed sets</AppText><PrimaryButton onPress={onStarted}>Resume workout</PrimaryButton></Card>;
    return <Card padding={16} gap={16} style={{ borderTopWidth: 0, borderLeftWidth: 2, borderLeftColor: BRAND_LIME, paddingLeft: 14, backgroundColor: "transparent" }}>
      <TrainTelemetry>[ SESSION // READY ]</TrainTelemetry>
      {lastWorkout ? <><View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><TrainIconBadge /><View style={{ flex: 1, gap: 8 }}><AppText size={22} weight="extrabold">{lastWorkout.title}</AppText><AppText size={12} muted>{trainingSummary(lastWorkout)} · {lastWorkout.date}</AppText></View></View><PrimaryButton accessibilityLabel="Repeat Last Workout" disabled={locked} onPress={() => begin(undefined, lastWorkout)}>Repeat Last Workout</PrimaryButton></> : <PrimaryButton disabled={locked} onPress={() => begin()}>Start Empty Workout</PrimaryButton>}
      {lastWorkout ? <SecondaryButton disabled={locked} onPress={() => begin()}>Start Empty Workout</SecondaryButton> : null}
    </Card>;
  }
  if (!started) return <Card padding={16} radius={20} gap={16}>
    <SectionLabel>Log workout</SectionLabel>
    {lastWorkout ? <><View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><TrainIconBadge /><View style={{ flex: 1, gap: 8 }}><AppText size={20} weight="extrabold">{lastWorkout.title}</AppText><AppText size={12} muted>{trainingSummary(lastWorkout)} · Previous weights prefilled</AppText></View></View><PrimaryButton disabled={locked} onPress={() => begin(undefined, lastWorkout)}>Repeat Last Workout</PrimaryButton></> : <AppText muted>Your first workout starts here.</AppText>}
    <SecondaryButton disabled={locked} onPress={() => begin()}>Start Empty Workout</SecondaryButton>
    <SectionLabel>Saved routines</SectionLabel>
    {plans.map(plan => <Pressable key={plan.id} accessibilityRole="button" accessibilityLabel={plan.title} disabled={locked} onPress={() => begin(plan)} style={{ minHeight: 60, flexDirection: "row", alignItems: "center", gap: 8, padding: 16, borderRadius: 10, borderWidth: 1, borderColor: trainPalette.border, backgroundColor: trainPalette.field }}><TrainIconBadge /><View style={{ flex: 1, gap: 8 }}><AppText weight="bold">{plan.title}</AppText><AppText size={12} muted>{plan.rows.length} exercises</AppText></View><AppText muted>{"›"}</AppText></Pressable>)}
    {!plans.length ? <AppText size={12} muted>No routines yet. Save any workout as a template.</AppText> : null}
    {onManageRoutines ? <SecondaryButton onPress={onManageRoutines}>Manage templates</SecondaryButton> : null}
  </Card>;
  if (sharing) return <Card padding={16} radius={20} gap={16}>
    <SectionLabel>Workout saved</SectionLabel>
    <AppText muted>Your workout is saved. Sharing is optional and uses your existing Social post visibility.</AppText>
    <Input bordered multiline maxLength={2000} value={shareText} onChangeText={setShareText} editable={!busy && !shared} accessibilityLabel="Workout post" />
    {error ? <AppText color={theme.colors.danger}>{error}</AppText> : null}
    {shared ? <AppText color={theme.colors.success}>Shared to Social.</AppText> : <PrimaryButton disabled={busy || !shareText.trim()} onPress={async () => {
      if (busyRef.current) return;
      busyRef.current = true; setBusy(true); setError(null);
      try { await createPost(shareText); setShared(true); }
      catch (err) { setError(err instanceof Error ? err.message : "Could not share. Your workout is still saved."); }
      finally { busyRef.current = false; setBusy(false); }
    }}>{busy ? "Sharing…" : "Share to Social"}</PrimaryButton>}
    <SecondaryButton disabled={busy} onPress={finish}>{shared ? "Done" : "Skip sharing"}</SecondaryButton>
  </Card>;
  const progress = <View accessibilityLiveRegion="polite" style={{ gap: 8, paddingBottom: 8 }}>
    <AppText size={13} weight="bold">{rows.length} {rows.length === 1 ? "exercise" : "exercises"} · {stats.sets}/{stats.plannedSets} sets completed</AppText>
    <AppText size={12} muted>Volume: {volumeLabel(stats.volume)}</AppText>
    <View accessibilityRole="progressbar" accessibilityLabel="Workout set progress" accessibilityValue={{ min: 0, max: stats.plannedSets, now: stats.sets }} style={{ height: 6, borderRadius: 3, backgroundColor: trainPalette.border, overflow: "hidden" }}><View style={{ height: 6, backgroundColor: theme.colors.primary, width: `${stats.plannedSets ? stats.sets / stats.plannedSets * 100 : 0}%` }} /></View>
  </View>;
  if (reviewing) return <Card padding={16} radius={20} gap={16}>
    <SectionLabel>Workout summary</SectionLabel><AppText size={21} weight="black">{title.trim() || "Workout"}</AppText>
    <AppText size={12} muted>{workoutDate}</AppText>{progress}
    {stats.plannedSets > stats.sets ? <AppText size={12} muted>{stats.plannedSets - stats.sets} unchecked sets will be left out.</AppText> : null}
    {stats.exercises.map(row => <View key={row.id} style={{ gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderColor: theme.colors.border }}>
      <AppText weight="bold">{row.name}</AppText><AppText size={12} muted>{row.setDetails?.map(set => `${set.weight} ${row.unit} × ${set.reps}`).join(" · ")}</AppText>
    </View>)}
    {records.map(record => <AppText key={record} size={13} weight="bold" color={theme.colors.success}>{record}</AppText>)}
    {error ? <AppText color={theme.colors.danger}>{error}</AppText> : null}<SaveFeedback area="workouts" onRetried={() => {
      if (!attemptedFinish.current) return;
      attemptedFinish.current = false; changed.current = false; void draft.clear()?.then(finish);
    }} />
    <PrimaryButton disabled={locked} onPress={() => void save()}>{busy ? "Saving…" : existing ? "Save corrections" : "Finish & save"}</PrimaryButton>
    <SecondaryButton disabled={locked} onPress={() => setReviewing(false)}>Review & correct sets</SecondaryButton>
    <SecondaryButton disabled={locked} onPress={() => void save(true)}>Save & prepare a post</SecondaryButton>
  </Card>;
  return <View style={{ gap: 16 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderLeftWidth: 2, borderLeftColor: BRAND_LIME, paddingLeft: 14 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 8 }}><TrainTelemetry>[ WORKOUT_LOG // ACTIVE ]</TrainTelemetry><AppText size={23} weight="black">{title.trim() || "Workout"}</AppText><AppText size={11} muted>{workoutDate}</AppText></View>
      <PrimaryButton height={46} fontSize={13} disabled={locked || (!stats.sets && !legacyEdit)} onPress={review}>Finish Workout</PrimaryButton>
    </View>
    {progress}{/pending|unavailable|could not/i.test(draft.status) ? <AppText size={11} muted>{draft.status}</AppText> : null}
    {records.length ? <AppText accessibilityLiveRegion="polite" size={12} color={theme.colors.success}>{records.length} personal record{records.length === 1 ? "" : "s"} so far</AppText> : null}
    {rows.map((row, index) => {
      const name = exerciseName(row), previous = lastPerformance(history, name), sets = draftSets(row);
      return <View key={row.id} style={{ gap: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: trainPalette.separator }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Change exercise ${index + 1}`} disabled={locked} onPress={() => { setPicking(row.id); setSearch(""); }} style={{ flex: 1, minHeight: 44, justifyContent: "center" }}><AppText size={15} weight="bold">{index + 1}. {name || "Name exercise"}</AppText></Pressable>
          <SecondaryButton height={44} style={{ width: 44 }} accessibilityLabel={`Options for ${name}`} accessibilityState={{ expanded: exerciseMenu === row.id }} onPress={() => setExerciseMenu(exerciseMenu === row.id ? null : row.id)}>{"⋯"}</SecondaryButton>
        </View>
        {row.exercise === "Other" ? <Input bordered placeholder="Exercise name" value={row.customName} onChangeText={customName => updateRow(row.id, { customName })} editable={!locked} maxLength={100} /> : null}
        {previous ? <AppText size={11} muted>Last: {(previous.setDetails ?? [{ reps: previous.reps, weight: previous.weight }]).map(set => `${set.weight} ${previous.unit} × ${set.reps}`).join(" · ")}</AppText> : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <AppText size={11} muted style={{ width: 24 }}>Set</AppText><AppText size={11} muted style={{ flex: 1 }}>Weight ({row.unit})</AppText><AppText size={11} muted style={{ flex: 1 }}>Reps</AppText><AppText size={11} muted style={{ width: 44, textAlign: "center" }}>✓</AppText>{exerciseMenu === row.id ? <View style={{ width: 44 }} /> : null}
        </View>
        {sets.map((set, setIndex) => <View key={setIndex} style={{ flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: "transparent" }}>
          <TrainNumber size={12} style={{ width: 24, textAlign: "center" }}>{setIndex + 1}</TrainNumber>
          <TrainSetInput style={{ flex: 1, minWidth: 0 }} value={set.weight} onChangeText={weight => updateSet(row, setIndex, { weight })} keyboardType="decimal-pad" editable={!locked} accessibilityLabel={`${name} set ${setIndex + 1} weight`} />
          <TrainSetInput style={{ flex: 1, minWidth: 0 }} value={set.reps} onChangeText={reps => updateSet(row, setIndex, { reps })} keyboardType="number-pad" editable={!locked} accessibilityLabel={`${name} set ${setIndex + 1} reps`} />
          <Pressable accessibilityRole="checkbox" aria-checked={!!set.completed} accessibilityState={{ checked: !!set.completed, disabled: locked }} accessibilityLabel={`${set.completed ? "Undo" : "Complete"} ${name} set ${setIndex + 1}`} disabled={locked} onPress={() => {
            if (!set.completed && (!name || !validDraftSet(set))) { setError("Enter an exercise name, 1–100 reps, and a valid weight (0 for bodyweight)."); return; }
            updateSet(row, setIndex, { completed: !set.completed });
          }} style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: set.completed ? theme.colors.primary : trainPalette.border, backgroundColor: set.completed ? theme.colors.primary : trainPalette.field }}><AppText weight="black" color={set.completed ? "#172000" : trainPalette.muted}>✓</AppText></Pressable>
          {exerciseMenu === row.id ? <SecondaryButton height={44} style={{ width: 44 }} accessibilityLabel={`Remove ${name} set ${setIndex + 1}`} disabled={locked || sets.length <= 1} onPress={() => { const next = sets.filter((_, i) => i !== setIndex); updateRow(row.id, { setValues: next, sets: String(next.length) }); }}>−</SecondaryButton> : null}
        </View>)}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <SecondaryButton height={44} fontSize={12} style={{ flex: 1 }} disabled={locked || sets.length >= 100} onPress={() => { const next = [...sets, { ...sets[sets.length - 1], completed: false }]; updateRow(row.id, { setValues: next, sets: String(next.length) }); }}>+ Add Set</SecondaryButton>
          {exerciseMenu === row.id ? <>
          <SecondaryButton height={44} style={{ width: 44 }} accessibilityLabel={`Move ${name} up`} disabled={locked || index === 0} onPress={() => moveExercise(index, -1)}>↑</SecondaryButton>
          <SecondaryButton height={44} style={{ width: 44 }} accessibilityLabel={`Move ${name} down`} disabled={locked || index === rows.length - 1} onPress={() => moveExercise(index, 1)}>↓</SecondaryButton>
          <SecondaryButton height={44} fontSize={12} disabled={locked} onPress={() => {
            const unit = row.unit === "lb" ? "kg" : "lb";
            const convert = (value: string) => value.trim() && Number.isFinite(Number(value)) ? String(Math.round(Number(value) * (unit === "kg" ? 1 / 2.2046226218 : 2.2046226218) * 100) / 100) : value;
            updateRow(row.id, { unit, weight: convert(row.weight), setValues: sets.map(set => ({ ...set, weight: convert(set.weight) })) });
          }}>{row.unit} → {row.unit === "lb" ? "kg" : "lb"}</SecondaryButton>
          <SecondaryButton height={44} fontSize={12} textColor={theme.colors.danger} disabled={locked} onPress={() => editRows(current => current.filter(item => item.id !== row.id))}>Remove exercise</SecondaryButton>
          </> : null}
        </View>
      </View>;
    })}
    {picking ? <Card padding={16} radius={14} gap={8}>
      <Input bordered autoFocus placeholder="Search exercises" accessibilityLabel="Search exercises" value={search} onChangeText={setSearch} editable={!locked} />
      <ScrollView style={{ maxHeight: 240 }} keyboardShouldPersistTaps="handled">
        {[...exerciseOptions([...history.flatMap(log => log.exercises?.map(row => row.name) ?? []), ...names], search).filter(name => name !== "Other").slice(0, 30), "Other"].map(name => <Pressable key={name} accessibilityRole="button" accessibilityLabel={`Select ${name}`} disabled={locked} onPress={() => selectExercise(name)} style={{ minHeight: 44, padding: 16, borderBottomWidth: 1, borderColor: theme.colors.border }}><AppText>{name === "Other" ? search.trim() ? `Add “${search.trim()}”` : "Custom exercise" : name}</AppText></Pressable>)}
      </ScrollView><SecondaryButton height={44} onPress={() => setPicking(null)}>Cancel search</SecondaryButton>
    </Card> : null}
    {!rows.length ? <AppText muted>Add an exercise to start logging sets.</AppText> : null}
    <SecondaryButton height={48} disabled={locked || rows.length >= 30} onPress={() => { setPicking("new"); setSearch(""); }}>+ Add exercise</SecondaryButton>
    <SecondaryButton height={44} fontSize={12} onPress={() => setShowDetails(!showDetails)}>{showDetails ? "Hide workout details" : "Name, notes & template"}</SecondaryButton>
    {showDetails ? <View style={{ gap: 8 }}>
      <Input bordered placeholder="Workout name (optional)" value={title} onChangeText={value => { changed.current = true; setTitle(value); }} editable={!locked} maxLength={100} />
      <Input bordered multiline maxLength={10000} placeholder="Workout notes (optional)" value={notes} onChangeText={value => { changed.current = true; setNotes(value); }} editable={!locked} />
      {workoutOrigin === "manual" ? <SecondaryButton disabled={locked || !rows.length} onPress={() => void saveTemplate()}>Save as template</SecondaryButton> : null}
      {templateMessage ? <AppText size={12} muted>{templateMessage}</AppText> : null}
      {!existing ? <SecondaryButton textColor={theme.colors.danger} disabled={locked} onPress={() => setDiscarding(true)}>Discard workout</SecondaryButton> : null}
      {discarding ? <View style={{ gap: 8 }}><AppText size={12}>Discard this unfinished workout?</AppText><SecondaryButton disabled={locked} onPress={discard}>Discard draft</SecondaryButton><SecondaryButton onPress={() => setDiscarding(false)}>Keep workout</SecondaryButton></View> : null}
    </View> : null}
    {error ? <AppText accessibilityLiveRegion="polite" color={theme.colors.danger}>{error}</AppText> : null}<SaveFeedback area="drafts" />
    <PrimaryButton disabled={locked || (!stats.sets && !legacyEdit)} onPress={review}>Finish Workout</PrimaryButton>
  </View>;
}
