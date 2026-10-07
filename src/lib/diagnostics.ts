import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { supabase } from "./supabase";
let enabled = false;
let generation = 0;
export async function diagnosticsPreference(owner: string) {
  const current = ++generation;
  const preference = (await AsyncStorage.getItem(`swolemates.diagnostics.${owner}`)) === "1";
  if (current === generation) enabled = preference;
  return enabled;
}
export async function setDiagnosticsPreference(owner: string, value: boolean) {
  const current = ++generation;
  await AsyncStorage.setItem(`swolemates.diagnostics.${owner}`, value ? "1" : "0");
  if (current === generation) enabled = value;
}
export function clearDiagnosticsPreference() { generation++; enabled = false; }
export async function reportDiagnostic(operation: "render" | "sync", screen: "app" | "account", error: unknown) {
  if (!enabled) return;
  const code = (error as { code?: string })?.code;
  const errorCode = code && /^[A-Z0-9]{3,12}$/.test(code) ? code : "UNKNOWN";
  let hash = 2166136261;
  for (const char of `${operation}:${screen}:${errorCode}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  await supabase.from("app_diagnostics").insert({ release: process.env.EXPO_PUBLIC_RELEASE ?? "development", platform: Platform.OS,
    screen_identifier: screen, operation, error_code: errorCode, fingerprint: (hash >>> 0).toString(16) });
}
