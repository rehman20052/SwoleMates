import { deleteMatchMessage, listConnections, notifyChatAlerts, sendMatchMessage } from "@/lib/matches";
import { supabase } from "@/lib/supabase";

export const workoutPlanMarker = "workout-plan:";

function buildTimeSlots() {
  const slots: string[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (const minute of [0, 30]) {
      const suffix = hour >= 12 ? "PM" : "AM";
      const shown = hour % 12 || 12;
      slots.push(`${shown}:${minute === 0 ? "00" : "30"} ${suffix}`);
    }
  }
  return slots;
}

export const workoutTimeSlots = buildTimeSlots();

function localIsoDate(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function upcomingTimeSlots(date: string, now = new Date()) {
  if (date !== localIsoDate(now)) return workoutTimeSlots;
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  return workoutTimeSlots.filter((slot) => toSqlTime(slot) > nowTime);
}

export type PlannedWorkout = {
  id: string;
  matchId: string;
  createdBy: string;
  title: string;
  focus: string;
  date: string;
  time: string;
  location: string;
  status: "proposed" | "scheduled" | "cancelled" | "completed";
  acceptedBy: string[];
  attendedBy: string[];
  cancelledBy: string | null;
};

type PlanRow = {
  planned_workout_id: string;
  match_id: string;
  created_by: string;
  title: string | null;
  focus: string | null;
  workout_date: string;
  start_time: string | null;
  location: string | null;
  status: string | null;
  notes: string | null;
};

export function workoutPlanId(body: string) {
  const line = body
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item.startsWith(workoutPlanMarker));
  return line ? line.slice(workoutPlanMarker.length).trim() : null;
}

export function displayTime(value: string) {
  const [hourText, minuteText] = value.split(":");
  let hour = Number(hourText);
  if (!Number.isFinite(hour)) return value;
  const minute = (minuteText ?? "00").slice(0, 2);
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${suffix}`;
}

export function toSqlTime(label: string) {
  const match = label.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return "18:30:00";
  let hour = Number(match[1]);
  const minute = match[2];
  const suffix = match[3].toUpperCase();
  if (suffix === "PM" && hour < 12) hour += 12;
  if (suffix === "AM" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}:00`;
}

const settledMeetups = new Set<string>();

export function workoutStartsAt(plan: PlannedWorkout) {
  if (!plan.date || !plan.time) return null;
  const start = new Date(`${plan.date}T${toSqlTime(plan.time)}`);
  return Number.isNaN(start.getTime()) ? null : start;
}

export function showUpPromptReady(plan: PlannedWorkout, now = new Date()) {
  if (plan.status !== "scheduled") return false;
  const start = workoutStartsAt(plan);
  if (!start) return false;
  return now.getTime() >= start.getTime();
}

export function meetupMissed(plan: PlannedWorkout, now = new Date()) {
  if (plan.status !== "scheduled" || plan.attendedBy.length >= 2) return false;
  const end = new Date(`${plan.date}T23:59:59`);
  return !Number.isNaN(end.getTime()) && end.getTime() <= now.getTime();
}

export function scheduledWorkoutFinished(plan: PlannedWorkout, now = new Date()) {
  if (plan.status === "completed" || plan.status === "cancelled") return true;
  if (plan.status !== "scheduled") return true;
  const end = new Date(`${plan.date}T23:59:59`);
  return !Number.isNaN(end.getTime()) && end.getTime() <= now.getTime();
}

export function openScheduledWorkout(plans: PlannedWorkout[]) {
  return plans.find((plan) => plan.status === "scheduled" && !scheduledWorkoutFinished(plan)) ?? null;
}

function stillPlanned(plan: PlannedWorkout) {
  if (plan.status === "proposed") return true;
  return plan.status === "scheduled" && !scheduledWorkoutFinished(plan);
}

export function occupiedTimeLabels(plans: PlannedWorkout[], date: string) {
  return plans.filter((plan) => stillPlanned(plan) && plan.date === date).map((plan) => plan.time);
}

function focusName(value: string) {
  const text = value.trim().replace(/\s+/g, " ").slice(0, 40);
  return text && text.toLowerCase() !== "other" ? text : "";
}

function cancelledById(notes: string | null) {
  try {
    const parsed = JSON.parse(notes ?? "") as { cancelledBy?: unknown };
    return typeof parsed.cancelledBy === "string" ? parsed.cancelledBy : null;
  } catch {
    return null;
  }
}

function acceptedIds(notes: string | null, createdBy: string) {
  try {
    const parsed = JSON.parse(notes ?? "") as { acceptedBy?: unknown };
    if (!Array.isArray(parsed.acceptedBy)) return [createdBy];
    const ids = parsed.acceptedBy.filter((id): id is string => typeof id === "string" && id.length > 0);
    return ids.length > 0 ? ids : [createdBy];
  } catch {
    return [createdBy];
  }
}

function planStatus(value: string | null): PlannedWorkout["status"] {
  if (value === "proposed" || value === "scheduled" || value === "cancelled" || value === "completed") return value;
  return "scheduled";
}

function fromRow(row: PlanRow): PlannedWorkout {
  const createdBy = row.created_by;
  return {
    id: row.planned_workout_id,
    matchId: row.match_id,
    createdBy,
    title: row.title?.trim() || "Workout",
    focus: row.focus?.trim() || "Workout",
    date: row.workout_date,
    time: row.start_time ? displayTime(row.start_time) : "",
    location: row.location?.trim() || "Gym",
    status: planStatus(row.status),
    acceptedBy: acceptedIds(row.notes, createdBy),
    attendedBy: [],
    cancelledBy: cancelledById(row.notes),
  };
}

async function withAttendance(plans: PlannedWorkout[]) {
  if (plans.length === 0) return plans;
  const { data, error } = await supabase
    .from("attendance")
    .select("planned_workout_id, user_id")
    .in("planned_workout_id", plans.map((plan) => plan.id));
  if (error || !data) return plans;
  const attended = new Map<string, string[]>();
  for (const row of data as { planned_workout_id: string; user_id: string }[]) {
    const ids = attended.get(row.planned_workout_id) ?? [];
    ids.push(row.user_id);
    attended.set(row.planned_workout_id, ids);
  }
  return plans.map((plan) => ({ ...plan, attendedBy: attended.get(plan.id) ?? [] }));
}

async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Sign in again before planning a workout.");
  return userId;
}

function planError(error: { message?: string } | null, fallback: string) {
  const message = error?.message ?? "";
  if (message.includes("planned_workout_place_check")) {
    return new Error("A workout needs a place. Add a gym on your profile, then try again.");
  }
  if (message.includes("schema cache") || message.includes("planned_workout")) {
    return new Error("Workout planning is not available on this project yet.");
  }
  if (message.includes("row-level security")) {
    return new Error("Only the two people in this match can change the workout.");
  }
  return new Error(message || fallback);
}

export async function answeredIncomingWorkoutIds(matchIds: string[]) {
  const me = await currentUserId().catch(() => null);
  const ids = [...new Set(matchIds)];
  if (!me || ids.length === 0) return new Set<string>();
  const { data, error } = await supabase
    .from("planned_workout")
    .select("planned_workout_id, created_by, notes")
    .in("match_id", ids);
  if (error || !data) return new Set<string>();
  const answered = new Set<string>();
  for (const row of data as { planned_workout_id: string; created_by: string; notes: string | null }[]) {
    const declinedByMe = cancelledById(row.notes) === me;
    const acceptedTheirs = row.created_by !== me && acceptedIds(row.notes, row.created_by).includes(me);
    if (declinedByMe || acceptedTheirs) answered.add(row.planned_workout_id);
  }
  return answered;
}

export async function listMatchWorkouts(matchId: string) {
  const { data, error } = await supabase
    .from("planned_workout")
    .select("planned_workout_id, match_id, created_by, title, focus, workout_date, start_time, location, status, notes")
    .eq("match_id", matchId)
    .order("created_at", { ascending: true });
  if (error) throw planError(error, "Could not load workouts for this chat.");
  return settleShownUp(await withAttendance(((data ?? []) as PlanRow[]).map(fromRow)));
}

export type CheckInWorkout = {
  plan: PlannedWorkout;
  partnerName: string;
  partnerPhoto: string | null;
  checkedIn: boolean;
  partnerCheckedIn: boolean;
};

export async function listCheckInWorkouts() {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [connections, listed] = await Promise.all([
    listConnections(),
    supabase
      .from("planned_workout")
      .select("planned_workout_id, match_id, created_by, title, focus, workout_date, start_time, location, status, notes")
      .in("status", ["scheduled", "completed"])
      .gte("workout_date", iso)
      .order("workout_date", { ascending: true })
      .order("start_time", { ascending: true }),
  ]);
  if (listed.error) throw planError(listed.error, "Could not load workouts to check in.");
  const partners = new Map(
    connections
      .filter((person) => person.status === "accepted")
      .map((person) => [person.requestId, { name: person.name.trim() || "your partner", photo: person.photo }]),
  );
  const me = await currentUserId();
  const plans = await settleShownUp(await withAttendance(((listed.data ?? []) as PlanRow[]).map(fromRow)));
  return plans
    .filter((plan) => partners.has(plan.matchId))
    .map((plan) => {
      const partner = partners.get(plan.matchId);
      return {
        plan,
        partnerName: partner?.name || "your partner",
        partnerPhoto: partner?.photo ?? null,
        checkedIn: plan.attendedBy.includes(me),
        partnerCheckedIn: plan.attendedBy.some((id) => id !== me),
      };
    });
}

export async function listScheduledWorkouts() {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const { data, error } = await supabase
    .from("planned_workout")
    .select("planned_workout_id, match_id, created_by, title, focus, workout_date, start_time, location, status, notes")
    .eq("status", "scheduled")
    .gte("workout_date", iso)
    .order("workout_date", { ascending: true });
  if (error) throw planError(error, "Could not load scheduled workouts.");
  return ((data ?? []) as PlanRow[]).map(fromRow);
}

export async function proposeWorkout(input: {
  matchId: string;
  partnerName: string;
  focus: string;
  date: string;
  timeLabel: string;
  location: string;
}) {
  const me = await currentUserId();
  const focus = focusName(input.focus);
  if (!focus) throw new Error("Enter the workout you want to do.");
  const existing = await listMatchWorkouts(input.matchId);
  if (occupiedTimeLabels(existing, input.date).includes(input.timeLabel)) {
    throw new Error("You already have a workout with them at that time.");
  }
  const place = input.location.trim().slice(0, 120) || "Gym";
  const { data, error } = await supabase
    .from("planned_workout")
    .insert({
      match_id: input.matchId,
      created_by: me,
      location: place,
      title: `${focus} with ${input.partnerName}`.slice(0, 80),
      workout_date: input.date,
      start_time: toSqlTime(input.timeLabel),
      focus,
      notes: JSON.stringify({ acceptedBy: [me] }),
      status: "proposed",
    })
    .select("planned_workout_id")
    .single();
  if (error || !data?.planned_workout_id) throw planError(error, "Could not send that workout request.");
  const when = new Date(`${input.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  await sendMatchMessage(
    input.matchId,
    `Proposed a ${focus} workout for ${when} at ${input.timeLabel}.\n${workoutPlanMarker}${data.planned_workout_id}`,
  );
  return data.planned_workout_id as string;
}

function otherPersonDeclined(plan: PlannedWorkout) {
  return plan.status === "cancelled" && !!plan.cancelledBy && plan.cancelledBy !== plan.createdBy;
}

export async function clearCanceledWorkoutPreviews(matchIds: string[]) {
  const me = await currentUserId().catch(() => null);
  const ids = [...new Set(matchIds)];
  if (!me || ids.length === 0) return;
  const listed = await supabase.from("match_messages").select("id, body").in("match_id", ids).eq("sender_id", me);
  const markers = (listed.data ?? []).flatMap((message) => {
    const planId = workoutPlanId(message.body ?? "");
    return planId ? [{ messageId: message.id as string, planId }] : [];
  });
  if (!markers.length) return;
  const found = await supabase
    .from("planned_workout")
    .select("planned_workout_id, status, created_by, notes")
    .in("planned_workout_id", markers.map((marker) => marker.planId));
  const plansById = new Map((found.data ?? []).map((row) => [row.planned_workout_id as string, fromRow(row as PlanRow)]));
  for (const marker of markers) {
    const plan = plansById.get(marker.planId);
    if (plan && plan.status !== "cancelled") continue;
    if (plan && otherPersonDeclined(plan)) continue;
    const removed = await supabase.from("match_messages").delete().eq("id", marker.messageId).eq("sender_id", me).select("id");
    if (removed.error || !removed.data?.length) continue;
    if (plan?.createdBy === me) {
      await supabase.from("planned_workout").delete().eq("planned_workout_id", plan.id).eq("created_by", me);
    }
  }
}

export async function clearCanceledWorkoutMessages(matchId: string, plans: PlannedWorkout[]) {
  const me = await currentUserId().catch(() => null);
  if (!me) return { plans, changed: false };
  const listed = await supabase.from("match_messages").select("id, body, sender_id").eq("match_id", matchId);
  const plansById = new Map(plans.map((plan) => [plan.id, plan]));
  let changed = false;
  for (const message of listed.data ?? []) {
    if (message.sender_id !== me) continue;
    const planId = workoutPlanId(message.body ?? "");
    if (!planId) continue;
    const plan = plansById.get(planId);
    if (plan && plan.status !== "cancelled") continue;
    if (plan && otherPersonDeclined(plan)) continue;
    const removed = await supabase.from("match_messages").delete().eq("id", message.id).eq("sender_id", me).select("id");
    if (removed.error || !removed.data?.length) continue;
    changed = true;
    if (plan?.createdBy === me) {
      await supabase.from("planned_workout").delete().eq("planned_workout_id", plan.id).eq("created_by", me);
      plansById.delete(plan.id);
    }
  }
  return { plans: changed ? [...plansById.values()] : plans, changed };
}

export async function cancelWorkoutRequest(plan: PlannedWorkout) {
  const me = await currentUserId();
  const removed = await supabase
    .from("planned_workout")
    .delete()
    .eq("planned_workout_id", plan.id)
    .eq("created_by", me)
    .eq("status", "proposed")
    .select("planned_workout_id");
  if (removed.error) throw planError(removed.error, "Could not cancel that workout.");
  if (!removed.data?.length) throw new Error("Could not cancel that workout.");
  const listed = await supabase.from("match_messages").select("id, body, sender_id").eq("match_id", plan.matchId);
  for (const message of listed.data ?? []) {
    if (message.sender_id !== me || workoutPlanId(message.body ?? "") !== plan.id) continue;
    await deleteMatchMessage(message.id).catch(() => undefined);
  }
}

export async function respondToWorkout(plan: PlannedWorkout, accept: boolean) {
  const me = await currentUserId();
  if (!accept) {
    const notes = JSON.stringify({ acceptedBy: plan.acceptedBy, cancelledBy: me });
    const { error } = await supabase
      .from("planned_workout")
      .update({ status: "cancelled", notes })
      .eq("planned_workout_id", plan.id)
      .eq("status", "proposed");
    if (error) throw planError(error, "Could not decline that workout.");
    notifyChatAlerts();
    return;
  }
  const acceptedBy = plan.acceptedBy.includes(me) ? plan.acceptedBy : [...plan.acceptedBy, me];
  const { error } = await supabase
    .from("planned_workout")
    .update({
      notes: JSON.stringify({ acceptedBy }),
      status: acceptedBy.length >= 2 ? "scheduled" : "proposed",
    })
    .eq("planned_workout_id", plan.id)
    .eq("status", "proposed");
  if (error) throw planError(error, "Could not accept that workout.");
  notifyChatAlerts();
}

async function saveWorkoutLog(plan: PlannedWorkout, me: string, verified: boolean) {
  const logged = await supabase.from("workout_logs").upsert(
    {
      user_id: me,
      planned_workout_id: plan.id,
      workout_date: plan.date,
      title: plan.title.slice(0, 80),
      verified,
    },
    { onConflict: "user_id,planned_workout_id" },
  );
  if (logged.error) throw planError(logged.error, "Could not save that workout.");
  if (verified) settledMeetups.add(`${me}:${plan.id}`);
}

async function settleShownUp(plans: PlannedWorkout[]) {
  const me = await currentUserId().catch(() => null);
  if (!me) return plans;
  const next: PlannedWorkout[] = [];
  for (const plan of plans) {
    const both = plan.attendedBy.length >= 2 && plan.attendedBy.includes(me);
    if (!both) {
      next.push(plan);
      continue;
    }
    if (plan.status === "scheduled") {
      const updated = await supabase
        .from("planned_workout")
        .update({ status: "completed" })
        .eq("planned_workout_id", plan.id)
        .eq("status", "scheduled");
      if (!updated.error) plan.status = "completed";
    }
    if (plan.status === "completed" && !settledMeetups.has(`${me}:${plan.id}`)) {
      await saveWorkoutLog(plan, me, true).catch(() => undefined);
    }
    next.push(plan);
  }
  return next;
}

export async function completeWorkout(plan: PlannedWorkout) {
  const me = await currentUserId();
  if (plan.attendedBy.includes(me)) return;
  if (plan.status !== "scheduled") throw new Error("This workout is not scheduled.");
  if (!showUpPromptReady(plan)) throw new Error("You can check in when the workout starts.");
  const checkedIn = await supabase.from("attendance").upsert(
    {
      planned_workout_id: plan.id,
      user_id: me,
      attended: true,
      checked_in_at: new Date().toISOString(),
    },
    { onConflict: "planned_workout_id,user_id" },
  );
  if (checkedIn.error) throw planError(checkedIn.error, "Could not record that you were there.");
  const attendance = await supabase.from("attendance").select("user_id, attended").eq("planned_workout_id", plan.id);
  if (attendance.error) throw planError(attendance.error, "Could not check who showed up.");
  const showedUp = (attendance.data ?? []).filter((row) => row.attended).length >= 2;
  if (!showedUp) return;
  const updated = await supabase
    .from("planned_workout")
    .update({ status: "completed" })
    .eq("planned_workout_id", plan.id)
    .eq("status", "scheduled");
  if (updated.error) throw planError(updated.error, "Could not complete that workout.");
  await saveWorkoutLog(plan, me, true);
}
