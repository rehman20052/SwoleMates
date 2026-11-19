import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { AppText, Field, Input, PrimaryButton, Screen, ScrollBody, SecondaryButton, TitleBar } from "@/components/ui";
import { deleteAccount } from "@/lib/account-controls";
import { supabase } from "@/lib/supabase";
import { useNavigation } from "@/navigation";
import { useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";

const reasons = ["I’m taking a break", "I couldn’t find a gym partner", "I had a technical problem", "I have privacy or safety concerns", "I no longer need the app", "Another reason", "Prefer not to say"];

export function DeleteAccountScreen() {
  const nav = useNavigation();
  const theme = useAppTheme();
  const { accountUserId } = useAppData();
  const [reason, setReason] = useState<string | null>(null);
  const [step, setStep] = useState<"questionnaire" | "password" | "confirm">("questionnaire");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let active = true;
    setReason(null); setPassword(""); setStep("questionnaire"); setReady(false);
    const check = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("delete-account", { body: { action: "capabilities" } });
        if (active) { setReady(!error && data?.available === true); setChecking(false); }
      } catch { if (active) { setReady(false); setChecking(false); } }
    };
    const wake = () => { void check(); };
    wake();
    if (typeof window !== "undefined") { window.addEventListener("online", wake); window.addEventListener("focus", wake); }
    return () => {
      active = false;
      if (typeof window !== "undefined") { window.removeEventListener("online", wake); window.removeEventListener("focus", wake); }
    };
  }, [accountUserId]);
  const back = () => {
    if (busy) return;
    if (step === "confirm") setStep("password");
    else if (step === "password") { setPassword(""); setStep("questionnaire"); }
    else nav.back();
    setMessage(null);
  };
  return <Screen>
    <TitleBar title="Delete account" onBack={back} />
    <ScrollBody contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 32 }}>
      {step === "questionnaire" ? <>
        <AppText size={24} weight="bold">Before you go</AppText>
        <AppText muted>What’s the main reason you’re deleting your account?</AppText>
        {reasons.map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: reason === value }} onPress={() => setReason(value)} style={{ padding: 16, borderRadius: 14, borderWidth: 1, borderColor: reason === value ? theme.colors.primary : theme.colors.border, backgroundColor: reason === value ? theme.colors.primaryTint : theme.colors.surface }}>
          <AppText weight={reason === value ? "bold" : "regular"}>{value}</AppText>
        </Pressable>)}
        {reason === reasons[0] ? <AppText muted>You can also hide your profile from Discover in Settings and keep your account for later.</AppText> : null}
        <PrimaryButton disabled={!reason} onPress={() => setStep("password")}>Continue</PrimaryButton>
      </> : step === "password" ? <>
        <AppText size={24} weight="bold">Confirm it’s you</AppText>
        <AppText muted>Enter your password to continue. You’ll review one final confirmation before your account is deleted.</AppText>
        <Field label="Current password"><Input secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} /></Field>
        <PrimaryButton disabled={!password || !ready || checking} onPress={() => setStep("confirm")}>Review deletion</PrimaryButton>
      </> : <>
        <AppText size={24} weight="bold">Permanently delete your account?</AppText>
        <AppText>Your profile, personal records and uploaded media will be removed. This cannot be undone.</AppText>
        <PrimaryButton disabled={busy || !ready} onPress={async () => {
          setBusy(true); setMessage(null);
          try { await deleteAccount(password); setPassword(""); nav.signOut(); }
          catch (error) { setMessage(error instanceof Error ? error.message : "Could not delete your account. Please try again."); }
          finally { setBusy(false); }
        }}>{busy ? "Deleting account…" : "Permanently delete my account"}</PrimaryButton>
      </>}
      {step !== "questionnaire" && !ready ? <AppText color={theme.colors.danger}>{checking ? "Checking account deletion availability…" : "Account deletion is temporarily unavailable. Reconnect and try again."}</AppText> : null}
      {message ? <AppText color={theme.colors.danger}>{message}</AppText> : null}
      <SecondaryButton disabled={busy} onPress={() => nav.back()}>Keep my account</SecondaryButton>
    </ScrollBody>
  </Screen>;
}
