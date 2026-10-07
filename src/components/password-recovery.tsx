import { type ReactNode, useEffect, useState } from "react";
import { AppText, Field, Input, PrimaryButton, Screen, ScrollBody, SecondaryButton } from "./ui";
import { supabase } from "@/lib/supabase";

export function PasswordRecovery({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(() => typeof window !== "undefined" && (new URLSearchParams(window.location.search).get("recovery") === "1" || /type=recovery/.test(window.location.hash)));
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event,session) => {
      if (event === "PASSWORD_RECOVERY") { setActive(true); setReady(Boolean(session)); }
      if (event === "SIGNED_OUT") setReady(false);
    });
    // A cached login does not prove that a recovery link was accepted.
    // Only the Auth recovery event enables password changes.
    const timer = active ? setTimeout(() => {
      setMessage("If this recovery link has expired or is invalid, return to login and request a new link.");
    }, 10000) : undefined;
    return () => { clearTimeout(timer); data.subscription.unsubscribe(); };
  }, [active]);
  if (!active) return children;
  return <Screen><ScrollBody contentContainerStyle={{ padding:24,gap:16 }}><AppText size={24} weight="bold">Reset password</AppText>
    <Field label="New password"><Input secureTextEntry autoComplete="new-password" value={password} onChangeText={setPassword} /></Field>
    <Field label="Confirm new password"><Input secureTextEntry value={confirm} onChangeText={setConfirm} /></Field>
    {message ? <AppText>{message}</AppText> : null}
    <PrimaryButton disabled={!ready || busy} onPress={async () => {
      if (password.length < 6 || password !== confirm) { setMessage("Use at least 6 characters and matching passwords."); return; }
      setBusy(true);
      try { const {error} = await supabase.auth.updateUser({password}); if (error) throw error; setPassword(""); setConfirm(""); setMessage("Password updated. Return to login."); await supabase.auth.signOut({scope:"local"}); }
      catch { setMessage("Password reset failed. Request a fresh recovery link."); } finally { setBusy(false); }
    }}>Update password</PrimaryButton><SecondaryButton onPress={() => { if (typeof window !== "undefined") window.history.replaceState(null,"",window.location.pathname); setActive(false); }}>Return to login</SecondaryButton>
  </ScrollBody></Screen>;
}
