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
  await signedInUserId();
  const { data, error } = await supabase.rpc("blocked_contact_ids");
  if (error) throw new Error(error.code === "PGRST202" || error.code === "42883"
    ? "Safety setup is pending. The project administrator must apply supabase/reliability-safety.sql before contact features can be enabled."
    : "Safety protection could not be checked. Reconnect and try again.");
  return new Set<string>((data ?? []).map((row: { person: string }) => row.person));
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
    const photo =
      profile?.photos.map(photoUrl).find((url, index) => url && profile.photoMedia[index] !== "video") ?? null;
    names.set(row.other_user_id, { name: profile?.fullName?.trim() || "Blocked user", photo });
  }

  return ids.map((userId) => ({
    userId,
    name: names.get(userId)?.name ?? "Blocked user",
    photo: names.get(userId)?.photo ?? null,
  }));
}

export async function blockPerson(userId: string) {
  await signedInUserId();
  const { error } = await supabase.rpc("block_contact", { person: userId });
  if (error) throw new Error(error.message || "Could not block that person.");
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
