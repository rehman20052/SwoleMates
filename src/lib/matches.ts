import { normalizeProfile } from "@/lib/profile";
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

function personFrom(row: {
  id?: string;
  other_user_id?: string;
  direction?: string;
  status?: string;
  profile?: unknown;
  last_message?: string | null;
}): MatchConnection | null {
  if (!row.id || !row.other_user_id) return null;
  if (row.direction !== "incoming" && row.direction !== "outgoing") return null;
  if (row.status !== "pending" && row.status !== "accepted" && row.status !== "declined") return null;
  const profile = normalizeProfile(row.profile);
  return {
    requestId: row.id,
    userId: row.other_user_id,
    direction: row.direction,
    status: row.status,
    name: profile?.fullName?.trim() || "SwoleMate",
    age: profile?.age?.trim() || "",
    gym: profile?.primaryGym?.trim() || "",
    photo: profile?.photos?.[0] ? photoUrl(profile.photos[0]) : null,
    lastMessage: row.last_message?.trim() || "",
  };
}

export async function listConnections() {
  const collapsed = await supabase.rpc("collapse_mutual_requests");
  if (collapsed.error && !missingFunction(collapsed.error, "collapse_mutual_requests")) throw setupError(collapsed.error);

  const { data, error } = await supabase.rpc("my_connections");
  if (error) throw setupError(error);
  return ((data ?? []) as Parameters<typeof personFrom>[0][])
    .map(personFrom)
    .filter((person): person is MatchConnection => person !== null && person.status !== "declined");
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
  if (error) throw setupError(error);
}

export async function respondToMatch(requestId: string, accept: boolean) {
  const { error } = await supabase
    .from("match_requests")
    .update({ status: accept ? "accepted" : "declined" })
    .eq("id", requestId);
  if (error) throw setupError(error);
  if (!accept) return;

  const collapsed = await supabase.rpc("collapse_mutual_requests");
  if (collapsed.error && !missingFunction(collapsed.error, "collapse_mutual_requests")) throw setupError(collapsed.error);
}

export async function cancelMatchRequest(requestId: string) {
  const { error } = await supabase.from("match_requests").delete().eq("id", requestId);
  if (error) throw setupError(error);
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
}
