import { normalizeProfile, type UserProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";

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
};

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
  const photos = normalized?.photos.map(photoUrl).filter(Boolean) ?? [];
  const profile = normalized ? { ...normalized, photos } : null;
  if (profile) matchProfiles.set(row.other_user_id, profile);
  const person: MatchConnection = {
    requestId: row.id,
    userId: row.other_user_id,
    direction: row.direction,
    status: row.status,
    name: profile?.fullName?.trim() || "SwoleMate",
    age: profile?.age?.trim() || "",
    gym: profile?.primaryGym?.trim() || "",
    photo: photos[0] ?? null,
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

export async function chatReadTimes() {
  const me = await signedInUserId();
  if (!me) return {};
  return readMap(me);
}

export async function openedChatIds() {
  const me = await signedInUserId();
  if (!me) return new Set<string>();
  return new Set(Object.keys(readMap(me)));
}

export async function markChatRead(requestId: string) {
  const me = await signedInUserId();
  if (!me) return;
  const reads = readMap(me);
  reads[requestId] = new Date().toISOString();
  saveReadMap(me, reads);
  notifyChatAlerts();
}

export async function chatAlertCount() {
  const me = await signedInUserId();
  if (!me) return 0;

  let connections: MatchConnection[] = [];
  try {
    connections = await listConnections();
  } catch {
    return 0;
  }

  const reads = readMap(me);
  const incoming = connections.filter((person) => person.status === "pending" && person.direction === "incoming").length;
  const accepted = connections.filter((person) => person.status === "accepted");
  const latest = new Map<string, { sender: string; at: string }>();
  const chatted = new Set<string>();

  if (accepted.length > 0) {
    const { data } = await supabase
      .from("match_messages")
      .select("match_id, sender_id, created_at")
      .in("match_id", accepted.map((person) => person.requestId))
      .order("created_at", { ascending: false });
    for (const row of (data ?? []) as { match_id?: string; sender_id?: string; created_at?: string }[]) {
      if (!row.match_id || !row.sender_id || !row.created_at) continue;
      if (row.sender_id === me) chatted.add(row.match_id);
      if (!latest.has(row.match_id)) latest.set(row.match_id, { sender: row.sender_id, at: row.created_at });
    }
  }

  const unreadChats = accepted.filter((person) => {
    const last = latest.get(person.requestId);
    if (!last) return true;
    if (last.sender === me) return false;
    if (!chatted.has(person.requestId)) return true;
    const readAt = reads[person.requestId];
    if (!readAt) return true;
    return new Date(last.at).getTime() > new Date(readAt).getTime();
  }).length;

  return incoming + unreadChats;
}

export async function listConnections() {
  const collapsed = await supabase.rpc("collapse_mutual_requests");
  if (collapsed.error && !missingFunction(collapsed.error, "collapse_mutual_requests")) throw setupError(collapsed.error);

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

  const { error } = await supabase.rpc("send_match_request", { to_user_id: toUserId });
  if (error) {
    if (!missingFunction(error, "send_match_request")) throw setupError(error);
    await sendMatchRequestDirect(me, toUserId);
  }
  notifyChatAlerts();
}

async function sendMatchRequestDirect(me: string, toUserId: string) {
  const { data, error } = await supabase
    .from("match_requests")
    .select("id, from_user_id, to_user_id, status")
    .or(`and(from_user_id.eq.${me},to_user_id.eq.${toUserId}),and(from_user_id.eq.${toUserId},to_user_id.eq.${me})`);
  if (error) throw setupError(error);

  const rows = (data ?? []) as { id: string; from_user_id: string; to_user_id: string; status: string }[];
  const reverse = rows.find((row) => row.from_user_id === toUserId && row.to_user_id === me);
  const mine = rows.find((row) => row.from_user_id === me && row.to_user_id === toUserId);

  if (reverse && reverse.status !== "accepted") {
    const { error: acceptError } = await supabase.from("match_requests").update({ status: "accepted" }).eq("id", reverse.id);
    if (acceptError) throw setupError(acceptError);
  }
  if (reverse && mine && mine.status !== "accepted") {
    const { error: deleteError } = await supabase.from("match_requests").delete().eq("id", mine.id);
    if (deleteError) throw setupError(deleteError);
    return;
  }
  if (reverse) return;

  if (mine) {
    if (mine.status === "pending" || mine.status === "accepted") return;
    const { error: reopenError } = await supabase.from("match_requests").update({ status: "pending" }).eq("id", mine.id);
    if (reopenError) throw setupError(reopenError);
    return;
  }

  const { error: insertError } = await supabase.from("match_requests").insert({
    from_user_id: me,
    to_user_id: toUserId,
    status: "pending",
  });
  if (insertError) throw setupError(insertError);
}

export async function respondToMatch(requestId: string, accept: boolean) {
  const { error } = await supabase
    .from("match_requests")
    .update({ status: accept ? "accepted" : "declined" })
    .eq("id", requestId);
  if (error) throw setupError(error);
  if (accept) {
    const collapsed = await supabase.rpc("collapse_mutual_requests");
    if (collapsed.error && !missingFunction(collapsed.error, "collapse_mutual_requests")) throw setupError(collapsed.error);
  }
  notifyChatAlerts();
}

export async function cancelMatchRequest(requestId: string) {
  const { error } = await supabase.from("match_requests").delete().eq("id", requestId);
  if (error) throw setupError(error);
  notifyChatAlerts();
}

export async function listMessages(matchId: string, me: string): Promise<MatchMessage[]> {
  const { data, error } = await supabase
    .from("match_messages")
    .select("id, sender_id, body, created_at")
    .eq("match_id", matchId)
    .order("created_at", { ascending: true });
  if (error) throw setupError(error);
  return ((data ?? []) as { id: string; sender_id: string; body: string; created_at: string }[]).map((message) => ({
    id: message.id,
    mine: message.sender_id === me,
    body: message.body,
    createdAt: message.created_at,
  }));
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
