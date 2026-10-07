import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

export async function requestPasswordRecovery(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error("Enter your email address first.");
  const base = process.env.EXPO_PUBLIC_BASE_PATH ?? "/SwoleMates";
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}${base.replace(/\/$/, "")}/?recovery=1` : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  if (error) throw error;
}
export async function exportAccountData() {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error("Sign in to export your account.");
  const owner = auth.user.id;
  const { data, error } = await supabase.rpc("export_my_account");
  if (error) throw new Error(error.message);
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(`swolemates.account-cache.${owner}.`) || key.startsWith(`swolemates.draft.${owner}.`));
  const local = await AsyncStorage.multiGet(keys);
  const { data: current } = await supabase.auth.getSession();
  if (current.session?.user.id !== owner) throw new Error("Your account changed. Export cancelled.");
  return { format: "swolemates-account-v1", exportedAt: new Date().toISOString(), owner,
    server: data, localDeviceData: local.map(([key,value]) => ({ key, data: value ? JSON.parse(value) : null })),
    note: "Local caches include pending and conflicting operations; these are not necessarily saved on the server." };
}
export async function deleteAccount(password: string) {
  if (!password) throw new Error("Enter your password to confirm ownership.");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sign in again before deleting your account.");
  const owner = data.user.id;
  const result = await supabase.functions.invoke("delete-account", { body: { password, confirm: "DELETE" } });
  if (result.error || !result.data?.deleted) throw new Error("Account deletion did not complete. Please try again.");
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key.includes(`.${owner}.`) || key.endsWith(`.${owner}`));
  await AsyncStorage.multiRemove(keys);
  await supabase.auth.signOut({ scope: "local" });
}
