import { supabase } from "@/lib/supabase";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function signedInEmail() {
  const { data, error } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (error || !email) throw new Error("Sign in again before changing your account.");
  return email;
}

async function confirmCurrentPassword(password: string) {
  const email = await signedInEmail();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error("Current password is incorrect.");
}

export async function currentEmail() {
  return signedInEmail();
}

export async function changePassword(currentPassword: string, nextPassword: string) {
  if (nextPassword.length < 6) throw new Error("Password must be at least 6 characters.");
  if (nextPassword === currentPassword) throw new Error("Choose a different password.");
  await confirmCurrentPassword(currentPassword);
  const { error } = await supabase.auth.updateUser({ password: nextPassword });
  if (error) throw new Error(error.message);
}

export async function changeEmail(nextEmail: string, currentPassword: string) {
  const email = nextEmail.trim();
  if (!EMAIL_PATTERN.test(email)) throw new Error("Enter a valid email address.");
  const current = await signedInEmail();
  if (email.toLowerCase() === current.toLowerCase()) throw new Error("That is already your email.");
  await confirmCurrentPassword(currentPassword);
  const { error } = await supabase.auth.updateUser({ email });
  if (error) throw new Error(error.message);
}

export async function discoverPaused() {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return false;
  const { data, error } = await supabase.from("discover_profiles").select("paused").eq("id", userId).maybeSingle();
  if (error) {
    if ((error.message ?? "").includes("paused") || (error.message ?? "").includes("schema cache")) return false;
    throw pauseError(error);
  }
  return Boolean(data?.paused);
}

export async function setDiscoverPaused(paused: boolean) {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error("Sign in again before changing this.");
  const { data, error } = await supabase.from("discover_profiles").update({ paused }).eq("id", userId).select("id");
  if (error) throw pauseError(error);
  if (!data?.length) throw new Error("Save your profile first. Discover uses that saved card.");
}

function pauseError(error: { message?: string }) {
  const message = error.message ?? "";
  if (message.includes("paused") || message.includes("schema cache")) {
    return new Error("Run the discover pause script in Supabase, then try again.");
  }
  return new Error(message || "Could not update Discover.");
}
