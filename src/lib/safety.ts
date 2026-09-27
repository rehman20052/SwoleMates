import { normalizeProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";

const PHOTO_BUCKET = "profile-photos";

export const reportReasons = [
  "Inappropriate messages",
  "Harassment",
  "Fake profile",
  "Spam",
  "Safety concern",
  "Something else",
] as const;

export type BlockedPerson = {
  userId: string;
  name: string;
  photo: string | null;
};

function photoUrl(photo: string) {
  if (photo.startsWith("http://") || photo.startsWith("https://")) return photo;
  if (!photo || photo.startsWith("data:") || photo.startsWith("file:") || photo.startsWith("blob:")) return "";
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(photo).data.publicUrl;
}

async function signedInUserId() {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Sign in again before changing this.");
  return userId;
}

function safetyError(error: { message?: string; code?: string } | null, fallback: string) {
  const message = error?.message ?? "";
  if (error?.code === "23505") return null;
  if (message.includes("schema cache") || message.includes("report") || message.includes("block") || message.includes("row-level security")) {
    return new Error("That safety action isn't available yet. Run the reports script in Supabase if this was a report.");
  }
  return new Error(message || fallback);
}

export async function blockedUserIds() {
  const me = await signedInUserId().catch(() => null);
  if (!me) return new Set<string>();
  const { data, error } = await supabase.from("block").select("blocked_id").eq("user_id", me);
  if (error) return new Set<string>();
  return new Set((data ?? []).map((row) => row.blocked_id).filter((id): id is string => Boolean(id)));
}

export async function listBlockedPeople(): Promise<BlockedPerson[]> {
  const me = await signedInUserId();
  const { data, error } = await supabase.from("block").select("blocked_id").eq("user_id", me);
  if (error) throw safetyError(error, "Could not load blocked people.") ?? new Error("Could not load blocked people.");
  const ids = (data ?? []).map((row) => row.blocked_id).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];

  const connections = await supabase.rpc("my_connections");
  const names = new Map<string, { name: string; photo: string | null }>();
  for (const row of (connections.data ?? []) as { other_user_id?: string; profile?: unknown }[]) {
    if (!row.other_user_id) continue;
    const profile = normalizeProfile(row.profile);
    const photo = profile?.photos.map(photoUrl).find(Boolean) ?? null;
    names.set(row.other_user_id, { name: profile?.fullName?.trim() || "Blocked user", photo });
  }

  return ids.map((userId) => ({
    userId,
    name: names.get(userId)?.name ?? "Blocked user",
    photo: names.get(userId)?.photo ?? null,
  }));
}

async function hideMatch(userId: string, me: string) {
  const { data } = await supabase.rpc("my_connections");
  for (const row of (data ?? []) as { id?: string; other_user_id?: string; status?: string; direction?: string }[]) {
    if (!row.id || row.other_user_id !== userId) continue;
    if (row.status === "accepted") {
      await supabase
        .from("match_requests")
        .update({ status: "unmatched", ended_at: new Date().toISOString(), ended_by: me })
        .eq("id", row.id)
        .eq("status", "accepted");
    } else if (row.status === "pending" && row.direction === "outgoing") {
      await supabase.from("match_requests").delete().eq("id", row.id);
    } else if (row.status === "pending") {
      await supabase.from("match_requests").update({ status: "declined" }).eq("id", row.id);
    }
  }
}

export async function blockPerson(userId: string) {
  const me = await signedInUserId();
  if (me === userId) throw new Error("You can't block yourself.");
  const { error } = await supabase.from("block").insert({ user_id: me, blocked_id: userId });
  if (error) {
    const mapped = safetyError(error, "Could not block that person.");
    if (mapped) throw mapped;
  }
  await hideMatch(userId, me);
}

export async function unblockPerson(userId: string) {
  const me = await signedInUserId();
  const { error } = await supabase.from("block").delete().eq("user_id", me).eq("blocked_id", userId);
  if (error) throw safetyError(error, "Could not unblock that person.");
}

export async function reportPerson(userId: string, reason: string, details: string) {
  const me = await signedInUserId();
  if (me === userId) throw new Error("You can't report yourself.");
  const text = details.trim().slice(0, 500);
  const { error } = await supabase.from("report").insert({
    user_id: me,
    reported_id: userId,
    reason: reason.trim().slice(0, 80),
    details: text,
  });
  if (error) throw safetyError(error, "Could not send that report.");
}
