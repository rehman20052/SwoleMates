import { normalizeProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { withDeadline } from "./network-deadline";
import { safetyCheckError, setSafetyStatus } from "./safety-state";

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
  const { data } = await withDeadline(supabase.auth.getSession());
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

let safetyGeneration = 0;
let safetyFlight: { owner: string; result: Promise<Set<string>> } | null = null;
let confirmed: { owner: string; at: number; ids: Set<string> } | null = null;
export function resetSafetyCheck() { safetyGeneration++; safetyFlight = null; confirmed = null; setSafetyStatus({ phase: "idle" }); }
export async function blockedUserIds(force = false) {
  const generation = safetyGeneration;
  try {
    const owner = await signedInUserId();
    if (generation !== safetyGeneration) throw new Error("Your account changed. Retry the contact check.");
    if (!force && confirmed?.owner === owner && Date.now() - confirmed.at < 3000) return new Set(confirmed.ids);
    if (safetyFlight?.owner === owner) return safetyFlight.result;
    setSafetyStatus({ phase: "checking" });
    const result = (async () => {
      try {
        const { data, error } = await withDeadline(supabase.rpc("blocked_contact_ids"));
        if (error) throw error;
        if (generation !== safetyGeneration) throw new Error("Your account changed. Retry the contact check.");
        if (data !== null && !Array.isArray(data)) throw new Error("Invalid contact-protection response.");
        const ids = new Set<string>((data ?? []).map((row: { person: string }) => row.person));
        confirmed = { owner, at: Date.now(), ids }; setSafetyStatus({ phase: "ready" });
        return new Set(ids);
      } catch (error) {
        const failure = safetyCheckError(error);
        if (generation === safetyGeneration) { confirmed = null; setSafetyStatus({ phase: "error", reason: failure.reason, code: failure.code, message: failure.message }); }
        throw failure;
      } finally { if (generation === safetyGeneration && safetyFlight?.owner === owner) safetyFlight = null; }
    })();
    safetyFlight = { owner, result };
    return await result;
  } catch (error) {
    const failure = safetyCheckError(error);
    if (generation === safetyGeneration) setSafetyStatus({ phase: "error", reason: failure.reason, code: failure.code, message: failure.message });
    throw failure;
  }
}

export async function listBlockedPeople(): Promise<BlockedPerson[]> {
  await signedInUserId();
  const { data, error } = await withDeadline(supabase.rpc("my_blocked_people"));
  if (error) throw new Error(error.code === "PGRST202" || error.code === "42883"
    ? "Blocked-user details are temporarily unavailable. Please try again later."
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
