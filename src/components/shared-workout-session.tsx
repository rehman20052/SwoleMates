import { useEffect, useState } from "react";
import { View } from "react-native";
import { AppText, PrimaryButton, SecondaryButton } from "./ui";
import { QuickWorkoutLog } from "./quick-workout-log";
import { type PlannedWorkout } from "@/lib/workouts";
import { supabase } from "@/lib/supabase";
import { useAppData } from "@/state/app-data";
import { parseWorkoutDraft } from "@/lib/workout-drafts";
export type SharedExercise = { name: string; sets: number; reps: number };
type Session = { plan: SharedExercise[]; locked: boolean; states: Record<string,string> };
export function SharedWorkoutSession({ plan, me }: { plan: PlannedWorkout; me: string }) {
  const { logs, workspaceSettings } = useAppData();
  const [session,setSession] = useState<Session | null>(null); const [available,setAvailable] = useState(false);
  const [error,setError] = useState<string | null>(null); const [busy,setBusy] = useState(false); const [logging,setLogging] = useState(false);
  async function action(action: string, exercisePlan?: SharedExercise[]) {
    const {data,error} = await supabase.rpc("workout_session_action",{workout_id:plan.id,action,exercise_plan:exercisePlan ?? null});
    if (error) throw new Error(error.message);
    setSession(data as Session); return data as Session;
  }
  useEffect(() => {
    let active=true;
    void supabase.rpc("shared_session_available").then(async ({data,error}) => {
      if (!active || error || !data) return;
      setAvailable(true); try { await action("read"); } catch (error) { if (active) setError(error instanceof Error ? error.message : "Session unavailable."); }
    });
    return () => {active=false;};
  },[plan.id,plan.status]);
  useEffect(() => {
    if (!available) return;
    let active = true;
    const refresh = async () => {
      const { data, error } = await supabase.rpc("workout_session_action", { workout_id: plan.id, action: "read", exercise_plan: null });
      if (!active) return;
      if (error) setError("Reconnect to refresh the shared session.");
      else { setSession(data as Session); setError(null); }
    };
    const wake = () => { void refresh().catch(() => { if (active) setError("Reconnect to refresh the shared session."); }); };
    const timer = setInterval(wake, 60000);
    if (typeof window !== "undefined") { window.addEventListener("focus", wake); window.addEventListener("online", wake); }
    return () => {
      active = false; clearInterval(timer);
      if (typeof window !== "undefined") { window.removeEventListener("focus", wake); window.removeEventListener("online", wake); }
    };
  }, [available, plan.id]);
  const templates = workspaceSettings.flatMap(item => { if (!item.id.startsWith("workout-plan:") || typeof item.value!=="object") return []; const draft=parseWorkoutDraft(item.value.content); return draft ? [{id:item.id,draft}] : []; });
  async function run(operation: () => Promise<void>) { if (busy) return; setBusy(true);setError(null); try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : "Reconnect to update the shared session."); } finally { setBusy(false); } }
  if (!available) return null;
  const existing = logs.find(log => log.plannedWorkoutId===plan.id);
  return <View style={{gap:10}}><AppText weight="bold">Shared training plan</AppText><AppText size={12} muted>{session?.locked ? "Plan locked when training started." : "The proposer can edit until anyone starts."} Personal weights, reps, notes and drafts stay private.</AppText>
    {session?.plan.map((exercise,index) => <AppText key={index} size={12}>{exercise.name} · {exercise.sets} sets · {exercise.reps} target reps</AppText>)}
    {session && !session.plan.length ? <AppText size={12} muted>No shared exercises yet. You can log your own workout.</AppText> : null}
    {me===plan.createdBy && !session?.locked ? templates.map(({id,draft}) => <SecondaryButton key={id} disabled={busy} onPress={() => void run(async () => { await action("edit",draft.rows.map(row => ({name:row.exercise==="Other" ? row.customName : row.exercise,sets:Number(row.sets),reps:Number(row.reps)}))); })}>Share {draft.title} exercises</SecondaryButton>) : null}
    {session ? <AppText size={12} muted>{Object.entries(session.states).map(([id,state]) => `${id===me ? "You" : "Partner"}: ${state}`).join(" · ") || "No participants ready yet."}</AppText> : null}
    {plan.status==="scheduled" ? <><SecondaryButton disabled={busy} onPress={() => void run(async () => { await action("ready"); })}>Join · Ready</SecondaryButton><PrimaryButton disabled={busy || session?.states[me]==="finished"} onPress={() => void run(async () => { await action("training");setLogging(true); })}>Start training with this plan</PrimaryButton></> : null}
    {logging && session ? <QuickWorkoutLog date={plan.date} existing={existing} plannedWorkoutId={plan.id} initialPlan={session.plan} initialTitle={plan.title} onSaved={() => {setLogging(false);void run(async () => {await action("finished");});}} /> : null}
    {existing && session?.states[me]!=="finished" ? <SecondaryButton disabled={busy} onPress={() => void run(async () => { await action("finished"); })}>Share finished status</SecondaryButton> : null}
    {error ? <AppText size={12}>{error}</AppText> : null}
  </View>;
}
