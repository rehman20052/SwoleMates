import { useEffect, useState, useSyncExternalStore } from "react";
import { View } from "react-native";
import { AppText, SecondaryButton } from "./ui";
import { blockedUserIds } from "@/lib/safety";
import { getSafetyStatus, subscribeSafetyStatus } from "@/lib/safety-state";
import { useAppTheme } from "@/theme";

export function SafetyStatus({ always = false, onRecovered }: { always?: boolean; onRecovered?: () => void }) {
  const status = useSyncExternalStore(subscribeSafetyStatus, getSafetyStatus, getSafetyStatus);
  const [retrying, setRetrying] = useState(false);
  const c = useAppTheme().colors;
  useEffect(() => { if (always) void blockedUserIds().catch(() => undefined); }, [always]);
  if (!always && status.phase !== "error") return null;
  return <View style={{ padding: 12, gap: 8 }} accessibilityLiveRegion="polite">
    {always ? <AppText size={13} weight="bold">Contact protection</AppText> : null}
    <AppText size={12} color={status.phase === "error" ? c.danger : c.muted}>{status.phase === "error" ? status.message : status.phase === "ready" ? "Blocked-contact checks are working." : status.phase === "checking" ? "Checking blocked contacts…" : "Check contact protection."}</AppText>
    {status.phase === "error" ? <AppText size={11} muted>Contact actions stay unavailable until this check succeeds. Your private tracking data is unaffected.</AppText> : null}
    {status.phase !== "ready" ? <SecondaryButton height={40} fontSize={12} disabled={retrying || status.phase === "checking"} onPress={async () => { setRetrying(true); try { await blockedUserIds(true); onRecovered?.(); } catch { /* The service exposes an actionable failure. */ } finally { setRetrying(false); } }}>{retrying ? "Checking…" : "Retry safety check"}</SecondaryButton> : null}
  </View>;
}
