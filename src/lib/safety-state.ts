export type SafetyFailure = "auth" | "timeout" | "setup" | "permission" | "connection";
export type SafetyStatus = { phase: "idle" | "checking" | "ready" | "error"; reason?: SafetyFailure; code?: string; message?: string };
export class SafetyCheckError extends Error {
  readonly stage = "blocked_contact_ids";
  constructor(readonly reason: SafetyFailure, readonly code: string | undefined, message: string) { super(message); this.name = "SafetyCheckError"; }
}
export function safetyCheckError(error: unknown): SafetyCheckError {
  if (error instanceof SafetyCheckError) return error;
  const value = error as { code?: string; name?: string; message?: string };
  const code = value?.code;
  if (["PGRST202", "42883", "42P01"].includes(code ?? "")) return new SafetyCheckError("setup", code, "Contact protection is not configured yet. Please try again later.");
  if (["42501", "403"].includes(code ?? "")) return new SafetyCheckError("permission", code, "Contact protection could not be verified for this account. Retry or sign in again.");
  if (["401", "PGRST301", "PGRST303"].includes(code ?? "") || /sign in|session missing|refresh token/i.test(value?.message ?? "")) return new SafetyCheckError("auth", code, "Sign in again to verify contact protection.");
  if (code === "REQUEST_TIMEOUT" || /timeout|timed out|abort/i.test((value?.name ?? "") + " " + (value?.message ?? ""))) return new SafetyCheckError("timeout", code, "Checking blocked contacts timed out. Check your connection and retry.");
  return new SafetyCheckError("connection", code, "Could not check blocked contacts. Check your connection and retry.");
}
let status: SafetyStatus = { phase: "idle" };
const listeners = new Set<() => void>();
export function getSafetyStatus() { return status; }
export function subscribeSafetyStatus(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function setSafetyStatus(next: SafetyStatus) { status = next; for (const listener of listeners) listener(); }
