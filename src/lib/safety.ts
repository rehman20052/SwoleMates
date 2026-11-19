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
  await signedInUserId();
  const { data, error } = await supabase.rpc("my_blocked_people");
  if (error) throw new Error(error.code === "PGRST202" || error.code === "42883"
    ? "Blocked-user details need the supabase/blocked-people.sql update."
    : "Could not load blocked people. Reconnect and try again.");
  return ((data ?? []) as { user_id: string; profile: unknown }[]).map(row => {
    const profile = normalizeProfile(row.profile);
    const photo =
      profile?.photos.map(photoUrl).find((url, index) => url && profile.photoMedia[index] !== "video") ?? null;
    return { userId: row.user_id, name: profile?.fullName?.trim() || `Account ${row.user_id.slice(-8)}`, photo };
  });
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
