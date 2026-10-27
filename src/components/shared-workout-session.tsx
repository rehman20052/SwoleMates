import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { AppText, PrimaryButton, SecondaryButton, SelectField } from "./ui";
import { QuickWorkoutLog } from "./quick-workout-log";
import { type PlannedWorkout } from "@/lib/workouts";
import { supabase } from "@/lib/supabase";
import { useAppData } from "@/state/app-data";
import { parseWorkoutDraft, uniqueWorkoutTemplates } from "@/lib/workout-drafts";
import { sharedExercises } from "@/lib/shared-workout-plan";
import { useAppTheme } from "@/theme";

export type SharedExercise = { name: string; sets: number; reps: number };
type Session = { plan: SharedExercise[]; locked: boolean; states: Record<string, string> };

export function SharedWorkoutSession({ plan, me, home = false }: { plan: PlannedWorkout; me: string; home?: boolean }) {
  const { logs, workspaceSettings } = useAppData();
  const theme = useAppTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [choosing, setChoosing] = useState(false);
  const [selected, setSelected] = useState("");
  const [logging, setLogging] = useState(false);
  const [initialPlan, setInitialPlan] = useState<SharedExercise[]>([]);
  const active = ["proposed", "scheduled", "completed"].includes(plan.status);

  async function action(action: string, exercisePlan?: SharedExercise[]) {
    const { data, error } = await supabase.rpc("workout_session_action", { workout_id: plan.id, action, exercise_plan: exercisePlan ?? null });
    if (error) throw new Error(error.message);
    setSession(data as Session);
    return data as Session;
  }
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    async function refresh() {
      try {
        const { data, error } = await supabase.rpc("workout_session_action", { workout_id: plan.id, action: "read", exercise_plan: null });
        if (!mounted) return;
        if (error || !data) { setAvailable(false); return; }
        setSession(data as Session); setAvailable(true);
      } catch { if (mounted) setAvailable(false); }
    }
    void refresh();
    const wake = () => { void refresh(); };
    const timer = setInterval(wake, 15000);
    if (typeof window !== "undefined") { window.addEventListener("focus", wake); window.addEventListener("online", wake); }
    return () => {
      mounted = false; clearInterval(timer);
      if (typeof window !== "undefined") { window.removeEventListener("focus", wake); window.removeEventListener("online", wake); }
    };
  }, [active, plan.id, plan.status]);

  const templates = uniqueWorkoutTemplates(workspaceSettings.flatMap(item => {
    if (!item.id.startsWith("workout-plan:") || typeof item.value !== "object") return [];
    const draft = parseWorkoutDraft(item.value.content);
    return draft?.rows.length ? [{ ...draft, id: item.id }] : [];
  }));
  const existing = logs.find(log => log.plannedWorkoutId === plan.id);
  const hasLog = !!existing?.exercises?.length;
  const canChoose = me === plan.createdBy && !session?.locked && plan.status !== "completed";
  async function run(operation: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null);
    try { await operation(); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not update this workout. Try again."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const chosenExercises = () => selected === "" ? [] : selected === "shared" ? session?.plan ?? []
    : sharedExercises(templates.find(template => template.id === selected)?.rows ?? []);

  if (!active) return null;
  if (home && logging) return <View style={{ gap: 12 }}>
    <QuickWorkoutLog date={plan.date} existing={existing} plannedWorkoutId={plan.id} initialPlan={initialPlan} initialTitle={plan.focus} onSaved={() => {
      setLogging(false); setChoosing(false);
      if (available && plan.status === "scheduled" && session?.states[me] === "training") void run(async () => { await action("finished"); });
    }} />
    <SecondaryButton onPress={() => setLogging(false)}>Back to check-in</SecondaryButton>
  </View>;

  return <View style={{ gap: 10 }}>
    {!home ? <>
      <AppText size={13} weight="bold">Workout plan</AppText>
      {session?.plan.length ? <AppText size={12} muted>{session.plan.map(exercise => `${exercise.name} · ${exercise.sets} × ${exercise.reps}`).join("\n")}</AppText>
        : <AppText size={12} muted>{available === null ? "Loading workout plan…" : "Choose a routine or log your own exercises on Home."}</AppText>}
      {available && canChoose ? <SecondaryButton height={40} disabled={busy} onPress={() => setChoosing(!choosing)}>{choosing ? "Close routine picker" : session?.plan.length ? "Change routine" : "Choose routine"}</SecondaryButton> : null}
      {session?.locked ? <AppText size={12} muted>Routine locked. Training has started.</AppText> : null}
    </> : <PrimaryButton height={44} disabled={busy || available === null} onPress={() => {
      if (hasLog) { setLogging(true); return; }
      setSelected(session?.plan.length ? "shared" : ""); setChoosing(!choosing);
    }}>{hasLog ? "View / edit logged sets" : "Log this workout"}</PrimaryButton>}
    {choosing ? <View style={{ gap: 10 }}>
      <SelectField value={selected} options={[...(home && session?.plan.length ? ["shared"] : []), "", ...templates.map(template => template.id)]} onChange={setSelected}
        renderLabel={id => id === "shared" ? "Shared routine" : id === "" ? home ? "Start with no exercises" : "No shared routine" : templates.find(template => template.id === id)?.title ?? "Routine"} />
      <AppText size={12} muted>{home ? "Check off your sets as you train. Your weights and notes stay private." : "Only exercise names, sets and target reps are shared. Check in and record your sets on Home."}</AppText>
      <PrimaryButton disabled={busy} onPress={() => void run(async () => {
        const exercises = chosenExercises();
        if (home) {
          if (available && plan.status === "scheduled" && session?.states[me] !== "finished") await action("training");
          setInitialPlan(exercises); setLogging(true);
        } else { await action("edit", exercises); setChoosing(false); }
      })}>{busy ? "Saving…" : home ? "Start logging sets" : "Use this routine"}</PrimaryButton>
    </View> : null}
    {error ? <AppText size={12} accessibilityRole="alert" color={theme.colors.danger}>{error}</AppText> : null}
  </View>;
}
