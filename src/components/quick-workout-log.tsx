import { WorkoutLogButton, WorkoutLogHeader, WorkoutSetEditor, WorkoutRecordedSets, useWorkoutLogPalette } from './workout-log-editor';
import { Card } from './ui';
import { BRAND_LIME } from "@/theme";
import { TrainIconBadge, trainingSummary, TrainText as AppText, TrainInput as Input, useTrainPalette } from "./train-ui";
import { TrainLabel as SectionLabel, TrainSecondary as SecondaryButton, TrainSaveFeedback as SaveFeedback } from "./train-ui";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { useSavedDraft } from "@/lib/use-saved-draft";
import { uniqueWorkoutTemplates, parseWorkoutDraft, hasWorkoutDraftInput, type DraftExercise, type WorkoutDraft } from "@/lib/workout-drafts";
import { completedExercises, draftSets, exerciseName, exerciseToDraft, lastPerformance, performanceHistory, prefillExercise, validDraftSet, volumeLabel, workoutRecords, workoutStats } from "@/lib/workout-logging";
import { validWorkoutExercises } from "@/lib/workout-session";
import { daysFromToday, type SessionLog, useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";
import { createPost } from "@/lib/social";

const newId = () => `exercise-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
type Props = { date?: string; existing?: SessionLog; onSaved: () => void; onDiscard?: () => void; onManageRoutines?: () => void; plannedWorkoutId?: string; initialPlan?: { name: string; sets: number; reps: number }[]; initialTitle?: string; collapsed?: boolean; onStarted?: () => void; repeatRequest?: SessionLog | null; onRepeatHandled?: () => void };

export function QuickWorkoutLog(props: Props) {
  const { accountUserId } = useAppData();
  // Do not carry edits across accounts, calendar entries, or partner sessions.
  return <WorkoutLogContent key={`${accountUserId}:${props.existing?.id ?? props.plannedWorkoutId ?? props.date ?? "active"}`} {...props} />;
}

function WorkoutLogContent({ date, existing, onSaved, onDiscard, onManageRoutines, plannedWorkoutId, initialPlan, initialTitle, collapsed = false, onStarted, repeatRequest, onRepeatHandled }: Props) {
  const theme = useAppTheme();
  const trainPalette = useTrainPalette();
  const logPalette = useWorkoutLogPalette();
  const { logWorkout, updateWorkoutLog, foodJournalReady, logs, workspaceSettings, saveWorkspaceSetting, accountUserId } = useAppData();
  const [workoutDate, setWorkoutDate] = useState(existing?.date ?? date ?? daysFromToday(0));
  const [title, setTitle] = useState(existing?.title ?? initialTitle ?? "");
  const [hasUserInput, setHasUserInput] = useState(false);
  const [sourceTemplateId, setSourceTemplateId] = useState<string | undefined>(existing?.sourceTemplateId);
  const [workoutOrigin, setWorkoutOrigin] = useState<"manual" | "template">(existing?.workoutOrigin ?? (initialPlan ? "template" : "manual"));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [minutes, setMinutes] = useState(String(existing?.durationMinutes ?? 45));
  const [durationEdited, setDurationEdited] = useState(false);
  const [rows, setRows] = useState<DraftExercise[]>(() => existing?.exercises?.map(row => exerciseToDraft(row, row.id, true)) ?? initialPlan?.map(row => {
    const previous = lastPerformance(performanceHistory(logs, date ?? daysFromToday(0)), row.name);
    return prefillExercise(exerciseToDraft({ ...row, id: newId(), weight: 0, unit: "lb" }, newId()), previous);
  }) ?? []);
  const [started, setStarted] = useState(!!(existing || plannedWorkoutId || initialPlan));
  const [reviewing, setReviewing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
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
    if (!saved || !hasWorkoutDraftInput(saved, plans)) return;
    // A completed record wins if the app closed before its draft was cleared.
    if (!existing && logs.some(log => log.id === saved.recordId)) return;
    setHasUserInput(true);
    setSourceTemplateId(saved.sourceTemplateId); setWorkoutOrigin(saved.workoutOrigin ?? "manual"); setTitle(saved.title || ""); setNotes(saved.notes); setMinutes(saved.durationInput ?? String(saved.durationMinutes ?? existing?.durationMinutes ?? 45)); setDurationEdited(!!saved.durationEdited); setRows(saved.rows);
    setWorkoutDate(saved.workoutDate ?? date ?? daysFromToday(0));
    setStarted(saved.started ?? !!(saved.rows.length || saved.title || saved.notes));
    if (saved.recordId) recordId.current = saved.recordId;
  }, !date && !existing && !plannedWorkoutId ? `draft:workout:${daysFromToday(0)}` : undefined);
  const hasInput = hasWorkoutDraftInput({ title, notes, rows, durationInput: minutes, durationEdited, hasUserInput });
  useEffect(() => {
    if (!draft.ready || !changed.current) return;
    if (hasInput) void draft.save(JSON.stringify({ title, notes, rows, durationInput: minutes, durationEdited, inputVersion: 1, hasUserInput: true, durationMinutes: Number.isInteger(Number(minutes)) && Number(minutes) >= 1 && Number(minutes) <= 1440 ? Number(minutes) : undefined, workoutOrigin, sourceTemplateId, recordId: recordId.current, workoutDate, started: true }));
    else void draft.clear();
  }, [title, notes, minutes, durationEdited, rows, workoutOrigin, sourceTemplateId, workoutDate, hasInput, draft.ready]);
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
  function editRows(update: React.SetStateAction<DraftExercise[]>) { changed.current = true; setHasUserInput(true); setRows(update); setError(null); }
  function begin(plan?: WorkoutDraft & { id?: string }, repeat?: SessionLog) {
    if (locked) return;
    changed.current = true; setHasUserInput(true);
    setSourceTemplateId(plan?.id ?? repeat?.sourceTemplateId); setWorkoutOrigin(plan ? "template" : repeat?.workoutOrigin ?? "manual"); setTitle(repeat?.title ?? plan?.title ?? ""); setNotes(plan?.notes ?? "");
    setRows(repeat?.exercises?.map(row => exerciseToDraft(row, newId())) ?? plan?.rows.map(row => prefillExercise({ ...row, id: newId() }, lastPerformance(history, exerciseName(row)))) ?? []);
    setMinutes(String(repeat?.durationMinutes ?? plan?.durationMinutes ?? 45)); setHasUserInput(!!plan || !!repeat); setDurationEdited(false); setStarted(true); setError(null); onStarted?.();
  }
  useEffect(() => {
    if (!repeatRequest || locked) return;
    if (started) setError("Finish or discard your current workout before repeating another.");
    else begin(undefined, repeatRequest);
    onRepeatHandled?.();
  }, [repeatRequest, locked]);
  function review() {
    if (!minutes.trim() || !Number.isInteger(Number(minutes)) || Number(minutes) < 1 || Number(minutes) > 1440) { setError("Enter 1–1440 minutes."); return; }
    if (!stats.sets && !legacyEdit) { setError("Complete at least one set using its checkmark."); return; }
    if (rows.some(row => draftSets(row).some(set => set.completed && !validDraftSet(set))) || !validWorkoutExercises(stats.exercises)) {
      setError("Completed sets need an exercise name, 1–100 reps, and a valid weight (0 for bodyweight)."); return;
    }
    setError(null); setReviewing(true);
  }
  function finish() {
    setSourceTemplateId(undefined); setWorkoutOrigin("manual"); setStarted(false); setRows([]); setTitle(""); setNotes(""); setReviewing(false); setSharing(false); setShared(false); setShowDetails(false); setTemplateMessage(null);
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
      const saved = existing ? await updateWorkoutLog(existing.id, { title: title.trim() || "Workout", notes: notes.trim() || undefined, exercises, durationMinutes: Number(minutes) })
        : await logWorkout(title.trim() || "Workout", notes.trim() || undefined, workoutDate, { exercises, durationMinutes: Number(minutes), plannedWorkoutId, workoutOrigin, sourceTemplateId }, recordId.current);
      if (!saved) { setError("Could not save this workout. Your draft is preserved; try again."); return; }
      attemptedFinish.current = false; changed.current = false; setHasUserInput(false); setDurationEdited(false); await draft.clear();
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
      const saved = await saveWorkspaceSetting(`workout-plan:${recordId.current}`, JSON.stringify({ title: title.trim() || "Workout", notes, durationMinutes: Number(minutes), rows: rows.map(row => ({ ...row, sets: String(draftSets(row).length), setValues: draftSets(row).map(set => ({ ...set, completed: false })) })) }), accountUserId, Date.now());
      setTemplateMessage(saved ? "Template saved." : "Could not save template. Try again.");
    } catch { setTemplateMessage("Could not save template. Try again."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function discard() {
    if (busyRef.current || locked) return;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      await draft.clear(); changed.current = false; setHasUserInput(false); setDurationEdited(false);
      setRows(existing?.exercises?.map(row => exerciseToDraft(row, row.id, true)) ?? []);
      setTitle(existing?.title ?? ''); setNotes(existing?.notes ?? ''); setStarted(!!existing);
      setReviewing(false); setDiscarding(false); setError(null); setTemplateMessage(null);
      recordId.current = `log-${newId()}`; onDiscard?.();
    } catch { setError('Could not discard this draft. Please try again.'); }
    finally { busyRef.current = false; setBusy(false); }
  }

  if (!draft.ready) return collapsed ? null : <Card padding={16} radius={12}><AppText muted>Loading your workout…</AppText></Card>;
  if (collapsed) {
    if (started && hasInput) return <Card padding={16} gap={16} style={{ borderTopWidth: 0, borderLeftWidth: 2, borderLeftColor: BRAND_LIME, paddingLeft: 14, backgroundColor: "transparent" }}><AppText size={12} muted>Workout in progress</AppText><AppText size={22} weight="bold">{title.trim() || "Workout"}</AppText><AppText size={12} muted>{rows.length} exercises / {stats.sets} completed sets</AppText><WorkoutLogButton primary onPress={() => onStarted?.()}>Resume workout</WorkoutLogButton></Card>;
    return <Card padding={16} gap={16} style={{ borderTopWidth: 0, borderLeftWidth: 2, borderLeftColor: BRAND_LIME, paddingLeft: 14, backgroundColor: "transparent" }}>
      <AppText size={12} muted>Ready to train</AppText>
      {lastWorkout ? <><View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><TrainIconBadge /><View style={{ flex: 1, gap: 8 }}><AppText size={22} weight="extrabold">{lastWorkout.title}</AppText><AppText size={12} muted>{trainingSummary(lastWorkout)} · {lastWorkout.date}</AppText></View></View><WorkoutLogButton primary accessibilityLabel="Repeat Last Workout" disabled={locked} onPress={() => begin(undefined, lastWorkout)}>Repeat Last Workout</WorkoutLogButton></> : <WorkoutLogButton primary disabled={locked} onPress={() => begin()}>Start Empty Workout</WorkoutLogButton>}
      {lastWorkout ? <SecondaryButton disabled={locked} onPress={() => begin()}>Start Empty Workout</SecondaryButton> : null}
    </Card>;
  }
  if (!started) return <Card padding={16} radius={12} gap={16}>
    <SectionLabel>Log workout</SectionLabel>
    {lastWorkout ? <><View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><TrainIconBadge /><View style={{ flex: 1, gap: 8 }}><AppText size={20} weight="extrabold">{lastWorkout.title}</AppText><AppText size={12} muted>{trainingSummary(lastWorkout)} · Previous weights prefilled</AppText></View></View><WorkoutLogButton primary disabled={locked} onPress={() => begin(undefined, lastWorkout)}>Repeat Last Workout</WorkoutLogButton></> : <AppText muted>Your first workout starts here.</AppText>}
    <SecondaryButton disabled={locked} onPress={() => begin()}>Start Empty Workout</SecondaryButton>
    <SectionLabel>Saved routines</SectionLabel>
    {plans.map(plan => <Pressable key={plan.id} accessibilityRole="button" accessibilityLabel={plan.title} disabled={locked} onPress={() => begin(plan)} style={{ minHeight: 60, flexDirection: "row", alignItems: "center", gap: 8, padding: 16, borderRadius: 10, borderWidth: 1, borderColor: trainPalette.border, backgroundColor: trainPalette.field }}><TrainIconBadge /><View style={{ flex: 1, gap: 8 }}><AppText weight="bold">{plan.title}</AppText><AppText size={12} muted>{plan.rows.length} exercises</AppText></View><AppText muted>{"›"}</AppText></Pressable>)}
    {!plans.length ? <AppText size={12} muted>No routines yet. Save any workout as a template.</AppText> : null}
    {onManageRoutines ? <SecondaryButton onPress={onManageRoutines}>Manage templates</SecondaryButton> : null}
  </Card>;
  if (sharing) return <Card padding={16} radius={12} gap={16}>
    <SectionLabel>Workout saved</SectionLabel>
    <AppText muted>Your workout is saved. Sharing is optional and uses your existing Social post visibility.</AppText>
    <Input bordered multiline maxLength={2000} value={shareText} onChangeText={setShareText} editable={!busy && !shared} accessibilityLabel="Workout post" />
    {error ? <AppText color={theme.colors.danger}>{error}</AppText> : null}
    {shared ? <AppText color={theme.colors.success}>Shared to Social.</AppText> : <WorkoutLogButton primary disabled={busy || !shareText.trim()} onPress={async () => {
      if (busyRef.current) return;
      busyRef.current = true; setBusy(true); setError(null);
      try { await createPost(shareText); setShared(true); }
      catch (err) { setError(err instanceof Error ? err.message : "Could not share. Your workout is still saved."); }
      finally { busyRef.current = false; setBusy(false); }
    }}>{busy ? "Sharing…" : "Share to Social"}</WorkoutLogButton>}
    <SecondaryButton disabled={busy} onPress={finish}>{shared ? "Done" : "Skip sharing"}</SecondaryButton>
  </Card>;
  const progress = <View accessibilityLiveRegion="polite" style={{ gap: 8, paddingBottom: 8 }}>
    <AppText size={13} weight="bold">{rows.length} {rows.length === 1 ? "exercise" : "exercises"} · {stats.sets}/{stats.plannedSets} sets completed</AppText>
    <AppText size={12} muted>Volume: {volumeLabel(stats.volume)}</AppText>
    <View accessibilityRole="progressbar" accessibilityLabel="Workout set progress" accessibilityValue={{ min: 0, max: stats.plannedSets, now: stats.sets }} style={{ height: 6, borderRadius: 3, backgroundColor: trainPalette.border, overflow: "hidden" }}><View style={{ height: 6, backgroundColor: logPalette.accent, width: `${stats.plannedSets ? stats.sets / stats.plannedSets * 100 : 0}%` }} /></View>
  </View>;
  if (reviewing) return <Card padding={16} radius={12} gap={16}>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><SectionLabel>Workout summary</SectionLabel><Pressable accessibilityRole="button" accessibilityLabel={existing ? "Discard workout changes" : "Discard workout draft"} disabled={locked} onPress={() => { setReviewing(false); setDiscarding(true); }} style={{ minHeight: 44, justifyContent: "center" }}><AppText display={false} size={13} color={logPalette.danger}>Discard</AppText></Pressable></View><AppText display={false} size={23} weight="semibold">{title.trim() || "Workout"}</AppText>
    <AppText size={12} muted>{workoutDate}</AppText>{progress}
    {stats.plannedSets > stats.sets ? <AppText size={12} muted>{stats.plannedSets - stats.sets} unchecked sets will be left out.</AppText> : null}
    <WorkoutRecordedSets exercises={stats.exercises} />
    {records.map(record => <AppText key={record} size={13} weight="bold" color={theme.colors.success}>{record}</AppText>)}
    {error ? <AppText color={theme.colors.danger}>{error}</AppText> : null}<SaveFeedback area="workouts" onRetried={() => {
      if (!attemptedFinish.current) return;
      attemptedFinish.current = false; changed.current = false; setHasUserInput(false); setDurationEdited(false); void draft.clear()?.then(finish);
    }} />
    <WorkoutLogButton primary disabled={locked} onPress={() => void save()}>{busy ? "Saving…" : existing ? "Save corrections" : "Finish & save"}</WorkoutLogButton>
    <SecondaryButton disabled={locked} onPress={() => setReviewing(false)}>Review & correct sets</SecondaryButton>
    <SecondaryButton disabled={locked} onPress={() => void save(true)}>Save & prepare a post</SecondaryButton>
  </Card>;
  return <View style={{ gap: 20 }}>
    <WorkoutLogHeader onDiscard={() => setDiscarding(true)} discardLabel={existing ? "Discard workout changes" : "Discard workout draft"} title={title} date={workoutDate} onTitleChange={value => { changed.current = true; setHasUserInput(true); setTitle(value); }} minutes={minutes} onMinutesChange={value => { changed.current = true; setHasUserInput(true); setDurationEdited(true); setMinutes(value); }} disabled={locked} partnerName={existing?.partnerName} partnerPhoto={existing?.partnerPhoto} />
    {discarding ? <View style={{ gap: 10, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border }}><AppText size={14}>{existing ? 'Discard your unsaved changes?' : 'Discard this unfinished workout?'}</AppText><AppText size={12} muted>{existing ? 'The saved workout will stay unchanged.' : 'This removes the draft, including its sets.'}</AppText><WorkoutLogButton disabled={locked} onPress={() => void discard()}>{existing ? 'Discard changes' : 'Discard workout'}</WorkoutLogButton><WorkoutLogButton disabled={locked} onPress={() => setDiscarding(false)}>Keep workout</WorkoutLogButton></View> : null}
    {/pending|unavailable|could not/i.test(draft.status) ? <AppText size={12} muted>{draft.status}</AppText> : null}
    <WorkoutSetEditor rows={rows} setRows={editRows} disabled={locked} preserveCompletionOnEdit={!!existing} history={history} />
    {records.length ? <AppText size={12} color={theme.colors.success}>{records.length} personal record{records.length === 1 ? '' : 's'} so far</AppText> : null}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: showDetails }} onPress={() => setShowDetails(!showDetails)} style={{ minHeight: 44, justifyContent: 'center' }}><AppText size={13} muted>{showDetails ? 'Hide workout details' : 'Notes & more'}</AppText></Pressable>
    {showDetails ? <View style={{ gap: 12 }}>
      <Input bordered multiline maxLength={10000} accessibilityLabel="Workout notes" placeholder="Workout notes (optional)" value={notes} onChangeText={value => { changed.current = true; setHasUserInput(true); setNotes(value); }} editable={!locked} />
      {workoutOrigin === 'manual' ? <WorkoutLogButton disabled={locked || !rows.length} onPress={() => void saveTemplate()}>Save as template</WorkoutLogButton> : null}
      {templateMessage ? <AppText size={12} muted>{templateMessage}</AppText> : null}

    </View> : null}
    {error ? <AppText accessibilityRole="alert" color={theme.colors.danger}>{error}</AppText> : null}<SaveFeedback area="drafts" />
    <WorkoutLogButton primary disabled={locked || (!stats.sets && !legacyEdit)} onPress={review}>Finish Workout</WorkoutLogButton>
  </View>;
}
