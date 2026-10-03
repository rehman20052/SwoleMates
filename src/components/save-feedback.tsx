import { useState } from "react";
import { View } from "react-native";
import { AppText, SecondaryButton } from "./ui";
import { type SaveArea, useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";

export function SaveFeedback({ area, onRetried }: { area: SaveArea; onRetried?: () => void }) {
  const theme = useAppTheme();
  const { saveFeedback, retrySave } = useAppData();
  const [retrying, setRetrying] = useState(false);
  const feedback = saveFeedback[area];
  if (!feedback) return null;
  return <View accessibilityLiveRegion="polite" style={{ gap: 6 }}>
    <AppText size={12} weight="semibold" color={feedback.phase === "error" ? theme.colors.danger : feedback.phase === "saved" ? theme.colors.primary : theme.colors.muted}>
      {feedback.phase === "saving" ? "Saving to your account…" : feedback.phase === "saved" ? "✓ Last change saved to your account" : `Save failed. ${feedback.message ?? "Please try again."}`}
    </AppText>
    {feedback.phase === "error" ? <SecondaryButton height={34} fontSize={12} disabled={retrying} onPress={async () => { if (retrying) return; setRetrying(true); const saved = await retrySave(area); setRetrying(false); if (saved) onRetried?.(); }}>{retrying ? "Retrying…" : "Try again"}</SecondaryButton> : null}
  </View>;
}
