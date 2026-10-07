import { profilePortrait, normalizeProfile, type UserProfile } from "@/lib/profile";
import { blockedUserIds } from "@/lib/safety";
import { supabase } from "@/lib/supabase";
import { markAccountRead, readAccountMarkers } from "@/lib/account-markers";

const PHOTO_BUCKET = "profile-photos";

function photoUrl(photo: string) {
  if (photo.startsWith("http://") || photo.startsWith("https://")) return photo;
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(photo).data.publicUrl;
}

export type MatchConnection = {
  requestId: string;
  userId: string;
  direction: "incoming" | "outgoing";
  status: "pending" | "accepted" | "declined";
  name: string;
  age: string;
  gym: string;
  photo: string | null;
  lastMessage: string;
  lastMessageMine: boolean;
  lastMessageAt: string;
  profile: UserProfile | null;
};

export type MatchMessage = {
  id: string;
  mine: boolean;
  body: string;
  createdAt: string;
  editedAt: string | null;
  heartCount: number;
  heartedByMe: boolean;
};

const EDIT_WINDOW_MS = 5 * 60 * 1000;

export function messageEditable(createdAt: string, now = Date.now()) {
  return now - new Date(createdAt).getTime() < EDIT_WINDOW_MS;
}

export function isDiscoverTester(id: string) {
  return id.startsWith("00000000-0000-4000-a000-");
}

function setupError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  if (
    message.includes("match_requests") ||
    message.includes("my_connections") ||
    message.includes("send_match_request") ||
    message.includes("collapse_mutual_requests") ||
    message.includes("schema cache")
  ) {
    return new Error("Run the latest matches script in Supabase, then try again.");
  }
  return new Error(message || "Could not update that match request.");
}

function missingFunction(error: { message?: string } | null, name: string) {
  const message = error?.message ?? "";
  return message.includes(name) || message.includes("schema cache");
}

const matchProfiles = new Map<string, UserProfile>();
const matchPeople = new Map<string, MatchConnection>();

export function matchProfile(userId: string) {
  return matchProfiles.get(userId) ?? null;
}

// Match card for someone who is not a friend, when they made their account public.
export async function loadPublicMatchProfile(userId: string) {
  const cached = matchProfiles.get(userId);
  if (cached) return cached;
  const { data, error } = await supabase.rpc("public_match_profile", { person: userId });
  if (error || data == null) return null;
  const normalized = normalizeProfile(data);
  if (!normalized) return null;
  const shown = normalized.photos.flatMap((photo, index) => {
    const url = photoUrl(photo);
    return url ? [{ url, kind: normalized.photoMedia[index] ?? "image" }] : [];
  });
  const profile: UserProfile = {
    ...normalized,
    avatar: normalized.avatar ? photoUrl(normalized.avatar) : undefined,
    photos: shown.map((item) => item.url),
    photoMedia: shown.map((item) => item.kind),
    birthDate: "",
    zipCode: "",
    latitude: null,
    longitude: null,
    gymLatitude: null,
    gymLongitude: null,
  };
  matchProfiles.set(userId, profile);
  return profile;
}

export function matchConnection(userId: string) {
  return matchPeople.get(userId) ?? null;
}

function personFrom(row: {
  id?: string;
  other_user_id?: string;
  direction?: string;
  status?: string;
  profile?: unknown;
  last_message?: string | null;
  created_at?: string;
}): MatchConnection | null {
  if (!row.id || !row.other_user_id) return null;
  if (row.direction !== "incoming" && row.direction !== "outgoing") return null;
  if (row.status !== "pending" && row.status !== "accepted" && row.status !== "declined") return null;
  const normalized = normalizeProfile(row.profile);
  const shown = (normalized?.photos ?? []).flatMap((photo, index) => {
    const url = photoUrl(photo);
    return url ? [{ url, kind: normalized?.photoMedia[index] ?? "image" }] : [];
  });
  const photos = shown.map((item) => item.url);
  const profile = normalized ? { ...normalized, avatar: normalized.avatar ? photoUrl(normalized.avatar) : undefined, photos, photoMedia: shown.map((item) => item.kind) } : null;
  if (profile) matchProfiles.set(row.other_user_id, profile);
  const person: MatchConnection = {
    requestId: row.id,
    userId: row.other_user_id,
    direction: row.direction,
    status: row.status,
    name: profile?.fullName?.trim() || "SwoleMate",
    age: profile?.age?.trim() || "",
    gym: profile?.primaryGym?.trim() || "",
    photo: profile ? profilePortrait(profile) : null,
    lastMessage: row.last_message?.trim() || "",
    lastMessageMine: false,
    lastMessageAt: "",
    profile,
  };
  matchPeople.set(person.userId, person);
  return person;
}

const memoryReads = new Map<string, Record<string, string>>();
const alertListeners = new Set<() => void>();

function readKey(userId: string) {
  return `swolemates.chat-read.${userId}`;
}

function readMap(userId: string) {
  try {
    if (typeof localStorage === "undefined") return { ...(memoryReads.get(userId) ?? {}) };
    const saved = JSON.parse(localStorage.getItem(readKey(userId)) ?? "{}") as unknown;
    if (!saved || typeof saved !== "object") return {};
    return saved as Record<string, string>;
  } catch {
    return {};
  }
}

function saveReadMap(userId: string, reads: Record<string, string>) {
  try {
    if (typeof localStorage === "undefined") memoryReads.set(userId, reads);
    else localStorage.setItem(readKey(userId), JSON.stringify(reads));
  } catch {
    memoryReads.set(userId, reads);
  }
}

export function subscribeChatAlerts(listener: () => void) {
  alertListeners.add(listener);
  return () => {
    alertListeners.delete(listener);
  };
}

export function notifyChatAlerts() {
  alertListeners.forEach((listener) => listener());
}

export function subscribeIncomingMessages() {
  const channel = supabase
    .channel("match-message-alerts")
    .on("postgres_changes", { event: "*", schema: "public", table: "match_messages" }, () => notifyChatAlerts())
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

async function signedInUserId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function chattedMatchIds(matchIds: string[]) {
  const me = await signedInUserId();
  const ids = [...new Set(matchIds)];
  if (!me || ids.length === 0) return new Set<string>();
  const { data, error } = await supabase.from("match_messages").select("match_id").in("match_id", ids).eq("sender_id", me);
  if (error) return new Set<string>();
  return new Set(((data ?? []) as { match_id?: string }[]).map((row) => row.match_id).filter((id): id is string => Boolean(id)));
}

export async function latestMessageBodies(matchIds: string[]) {
  const me = await signedInUserId();
  const ids = [...new Set(matchIds)];
  if (!me || ids.length === 0) return new Map<string, { body: string; mine: boolean; at: string }>();
  const { data, error } = await supabase
    .from("match_messages")
    .select("match_id, sender_id, body, created_at")
    .in("match_id", ids)
    .order("created_at", { ascending: false });
  if (error) return new Map<string, { body: string; mine: boolean; at: string }>();
  const latest = new Map<string, { body: string; mine: boolean; at: string }>();
  for (const row of (data ?? []) as { match_id?: string; sender_id?: string; body?: string; created_at?: string }[]) {
    if (!row.match_id || latest.has(row.match_id)) continue;
    const body = row.body?.trim();
    if (body) latest.set(row.match_id, { body, mine: row.sender_id === me, at: row.created_at ?? "" });
  }
  return latest;
}

export async function clearUnopenedMatchReads(matchIds: string[]) {
  const me = await signedInUserId();
  if (!me || matchIds.length === 0) return;
  const repairedKey = `swolemates.chat-read-repaired.${me}`;
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem(repairedKey)) return;
  } catch {
    return;
  }
  const reads = readMap(me);
  let changed = false;
  for (const id of matchIds) {
    if (!reads[id]) continue;
    delete reads[id];
    changed = true;
  }
  if (changed) saveReadMap(me, reads);
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(repairedKey, "1");
  } catch {
    // The cleared reads are already stored for this session.
  }
  if (changed) notifyChatAlerts();
}

export async function syncIncomingReadCursors(matchIds: string[]) {
  const me = await signedInUserId();
  const ids = [...new Set(matchIds)];
  if (!me || ids.length === 0) return;
  const { data } = await supabase.from("match_messages").select("match_id, sender_id, created_at").in("match_id", ids);
  reconcileChatReads(me, (data ?? []) as MessageStamp[]);
}

export async function chatReadTimes() {
  const me = await signedInUserId();
  if (!me) return {};
  try {
    const reads = await readAccountMarkers(me, "chat_reads", readMap(me));
    saveReadMap(me, reads); return reads;
  } catch { return readMap(me); }
}

export async function openedChatIds() {
  const me = await signedInUserId();
  if (!me) return new Set<string>();
  return new Set(Object.keys(await chatReadTimes()));
}

export async function markChatRead(requestId: string, at?: string) {
  const me = await signedInUserId();
  if (!me) return;
  const parsed = new Date(at ?? Date.now());
  if (Number.isNaN(parsed.getTime())) return;
  const stamp = parsed.toISOString();
  const reads = readMap(me);
  const previous = reads[requestId];
  if (previous && new Date(previous).getTime() >= new Date(stamp).getTime()) return;
  try {
    const synced = await markAccountRead(me, "chat_reads", requestId, stamp, reads);
    saveReadMap(me, synced);
  } catch {
    // Read receipts are non-blocking, but retain a local cursor for this device.
    reads[requestId] = stamp; saveReadMap(me, reads);
  }
  notifyChatAlerts();
}

type MessageStamp = { match_id?: string; sender_id?: string; created_at?: string; body?: string };

const workoutPlanMarker = "workout-plan:";

function requestExpired(status: string | null | undefined, date: string | null | undefined, start: string | null | undefined, now = new Date()) {
  if (status !== "proposed" || !date || !start) return false;
  const match = start.match(/^(\d{2}):(\d{2})/);
  if (!match) return false;
  const when = new Date(`${date}T${match[1]}:${match[2]}:00`);
  return !Number.isNaN(when.getTime()) && now.getTime() >= when.getTime() - 30 * 60 * 1000;
}

function workoutPlanIdFromBody(body: string) {
  const line = body
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item.startsWith(workoutPlanMarker));
  return line ? line.slice(workoutPlanMarker.length).trim() : null;
}

async function answeredWorkoutIds(me: string, matchIds: string[]) {
  const ids = [...new Set(matchIds)];
  const answered = new Set<string>();
  if (ids.length === 0) return answered;
  const { data } = await supabase
    .from("planned_workout")
    .select("planned_workout_id, created_by, notes, status, workout_date, start_time")
    .in("match_id", ids);
  for (const row of (data ?? []) as {
    planned_workout_id?: string;
    created_by?: string;
    notes?: string | null;
    status?: string | null;
    workout_date?: string | null;
    start_time?: string | null;
  }[]) {
    if (!row.planned_workout_id || !row.created_by) continue;
    let notes: { acceptedBy?: unknown; cancelledBy?: unknown } = {};
    try {
      notes = JSON.parse(row.notes ?? "") as { acceptedBy?: unknown; cancelledBy?: unknown };
    } catch {
      notes = {};
    }
    const acceptedBy = Array.isArray(notes.acceptedBy) ? notes.acceptedBy.filter((id): id is string => typeof id === "string") : [];
    const declinedByMe = notes.cancelledBy === me;
    const acceptedTheirs = row.created_by !== me && acceptedBy.includes(me);
    const expired = requestExpired(row.status, row.workout_date, row.start_time);
    if (declinedByMe || acceptedTheirs || expired) answered.add(row.planned_workout_id);
  }
  return answered;
}

function reconcileChatReads(me: string, rows: MessageStamp[]) {
  const reads = readMap(me);
  const byMatch = new Map<string, { at: string; mine: boolean }[]>();
  for (const row of rows) {
    if (!row.match_id || !row.sender_id || !row.created_at) continue;
    const items = byMatch.get(row.match_id) ?? [];
    items.push({ at: row.created_at, mine: row.sender_id === me });
    byMatch.set(row.match_id, items);
  }
  let changed = false;
  for (const [matchId, items] of byMatch) {
    const readAt = reads[matchId];
    if (!readAt) continue;
    const readMs = new Date(readAt).getTime();
    if (Number.isNaN(readMs)) continue;
    const newest = items.reduce((left, right) => (new Date(left.at).getTime() >= new Date(right.at).getTime() ? left : right));
    if (newest.mine || readMs <= new Date(newest.at).getTime()) continue;
    const stampedOnMessage = items.some((item) => Math.abs(new Date(item.at).getTime() - readMs) < 1500);
    if (stampedOnMessage) continue;
    const outgoing = items.filter((item) => item.mine).sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())[0];
    if (outgoing) reads[matchId] = new Date(outgoing.at).toISOString();
    else delete reads[matchId];
    changed = true;
  }
  if (changed) saveReadMap(me, reads);
}

export async function chatAlertCount() {
  const me = await signedInUserId();
  if (!me) return 0;

  const connections = await listConnections();

  let reads = await chatReadTimes();
  const blocked = await blockedUserIds();
  const visible = connections.filter((person) => !blocked.has(person.userId));
  const incoming = visible.filter((person) => person.status === "pending" && person.direction === "incoming").length;
  const accepted = visible.filter((person) => person.status === "accepted");
  const latest = new Map<string, { sender: string; at: string; body: string }>();
  const chatted = new Set<string>();

  if (accepted.length > 0) {
    const { data } = await supabase
      .from("match_messages")
      .select("match_id, sender_id, created_at, body")
      .in("match_id", accepted.map((person) => person.requestId))
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as MessageStamp[];
    reconcileChatReads(me, rows);
    reads = readMap(me);
    for (const row of rows) {
      if (!row.match_id || !row.sender_id || !row.created_at) continue;
      if (row.sender_id === me) chatted.add(row.match_id);
      if (!latest.has(row.match_id)) latest.set(row.match_id, { sender: row.sender_id, at: row.created_at, body: row.body ?? "" });
    }
  }

  const answeredPlans = await answeredWorkoutIds(me, accepted.map((person) => person.requestId));

  const unreadChats = accepted.filter((person) => {
    const last = latest.get(person.requestId);
    if (!last) return true;
    if (last.sender === me) return false;
    const planId = workoutPlanIdFromBody(last.body ?? "");
    if (planId && answeredPlans.has(planId)) return false;
    if (!chatted.has(person.requestId)) return true;
    const readAt = reads[person.requestId];
    if (!readAt) return true;
    return new Date(last.at).getTime() > new Date(readAt).getTime();
  }).length;

  return incoming + unreadChats;
}

// The Chat badge, Chat tab and Discover often ask at the same moment. They share one
// request instead of each calling the database. Nothing is kept once it finishes.
let connectionsInFlight: Promise<MatchConnection[]> | null = null;

// collapse_mutual_requests runs after a request is accepted (respondToMatch), and
// send_match_request merges mutual requests itself, so loading the list doesn't need it.
export function listConnections() {
  connectionsInFlight ??= loadConnections().finally(() => {
    connectionsInFlight = null;
  });
  return connectionsInFlight;
}

async function loadConnections() {
  await blockedUserIds();
  const { data, error } = await supabase.rpc("my_connections");
  if (error) throw setupError(error);
  return ((data ?? []) as Parameters<typeof personFrom>[0][])
    .map((row) => ({ person: personFrom(row), createdAt: row.created_at ?? "" }))
    .filter((item): item is { person: MatchConnection; createdAt: string } => item.person !== null && item.person.status !== "declined")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((item) => item.person);
}

async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Sign in again before sending a request.");
  return userId;
}

export async function sendMatchRequest(toUserId: string) {
  const me = await currentUserId();
  if (me === toUserId) throw new Error("You can't send a request to yourself.");
  if ((await blockedUserIds()).has(toUserId)) throw new Error("Unblock this person in Home settings before matching again.");

  // This database names the argument to_user_id. A newer script renames it to
  // target_user so it does not clash with the column. Calling the missing name
  // never returns, so try the live name first.
  let { error } = await supabase.rpc("send_match_request", { to_user_id: toUserId });
  if (error && `${error.message} ${error.hint ?? ""}`.includes("target_user")) {
    const retry = await supabase.rpc("send_match_request", { target_user: toUserId });
    error = retry.error;
  }
  if (error) throw setupError(error);
  notifyChatAlerts();
}

export async function respondToMatch(requestId: string, accept: boolean) {
  await transitionMatch(requestId, accept ? "accept" : "decline");
}
async function transitionMatch(requestId: string, action: string) {
  const { error } = await supabase.rpc("transition_match", { request_id: requestId, action });
  if (error) throw setupError(error);
  notifyChatAlerts();
}
export async function unmatch(requestId: string) { await transitionMatch(requestId, "unmatch"); }
export async function cancelMatchRequest(requestId: string) { await transitionMatch(requestId, "cancel"); }
export async function listMessages(matchId: string, me: string): Promise<MatchMessage[]> {
  const listed = await supabase
    .from("match_messages")
    .select("id, sender_id, body, created_at, edited_at")
    .eq("match_id", matchId)
    .order("created_at", { ascending: true });
  let data = listed.data as { id: string; sender_id: string; body: string; created_at: string; edited_at?: string | null }[] | null;
  let error = listed.error;
  if (error && (error.message.includes("edited_at") || error.message.includes("schema cache"))) {
    const fallback = await supabase
      .from("match_messages")
      .select("id, sender_id, body, created_at")
      .eq("match_id", matchId)
      .order("created_at", { ascending: true });
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw setupError(error);
  const ids = (data ?? []).map(message => message.id);
  let reactions: { message_id: string; user_id: string }[] = [];
  if (ids.length) {
    const listedReactions = await supabase.from("message_reactions").select("message_id, user_id").in("message_id", ids);
    if (!listedReactions.error) reactions = listedReactions.data ?? [];
  }
  return (data ?? []).map((message) => ({
    id: message.id,
    mine: message.sender_id === me,
    body: message.body,
    createdAt: message.created_at,
    editedAt: message.edited_at ?? null,
    heartCount: reactions.filter(reaction => reaction.message_id === message.id).length,
    heartedByMe: reactions.some(reaction => reaction.message_id === message.id && reaction.user_id === me),
  }));
}

export async function toggleMessageHeart(messageId: string, hearted: boolean) {
  const me = await currentUserId();
  const query = hearted
    ? supabase.from("message_reactions").delete().eq("message_id", messageId).eq("user_id", me)
    : supabase.from("message_reactions").insert({ message_id: messageId, user_id: me, reaction: "heart" });
  const { error } = await query;
  if (error) throw new Error(error.message.includes("message_reactions") || error.message.includes("schema cache") ? "Run supabase/message-reactions.sql to enable message hearts." : error.message);
}

export async function sendMatchMessage(matchId: string, body: string) {
  const me = await currentUserId();
  const text = body.trim();
  if (!text) return;
  const { error } = await supabase.from("match_messages").insert({
    match_id: matchId,
    sender_id: me,
    body: text.slice(0, 1000),
  });
  if (error) throw setupError(error);
  await markChatRead(matchId);
}

export async function editMatchMessage(messageId: string, body: string) {
  const text = body.trim();
  if (!text) throw new Error("Message can't be empty.");
  const { data, error } = await supabase
    .from("match_messages")
    .update({ body: text.slice(0, 1000) })
    .eq("id", messageId)
    .select("id");
  if (error) throw messageActionError(error, "Could not edit that message.");
  if (!data?.length) throw new Error("Run the message actions script in Supabase, then try again.");
}

export async function deleteMatchMessage(messageId: string) {
  const { data, error } = await supabase.from("match_messages").delete().eq("id", messageId).select("id");
  if (error) throw messageActionError(error, "Could not delete that message.");
  if (!data?.length) throw new Error("Run the message actions script in Supabase, then try again.");
}

function messageActionError(error: { message?: string }, fallback: string) {
  const message = error.message ?? "";
  if (message.includes("5 minutes")) return new Error("You can only edit a message within 5 minutes of sending.");
  if (message.includes("row-level security") || message.includes("schema cache") || message.includes("edited_at")) {
    return new Error("Run the message actions script in Supabase, then try again.");
  }
  return new Error(message || fallback);
}
