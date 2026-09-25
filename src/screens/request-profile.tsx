import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { icons } from "@/assets";
import { AppText, IconButton, PrimaryButton, Screen, SecondaryButton } from "@/components/ui";
import { cancelMatchRequest, matchConnection, matchProfile, respondToMatch } from "@/lib/matches";
import { useNavigation } from "@/navigation";
import { ProfilePreview } from "@/screens/profile";
import { useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";

export function RequestProfileScreen({ userId }: { userId: string }) {
  const theme = useAppTheme();
  const nav = useNavigation();
  const { clearReview } = useAppData();
  const profile = matchProfile(userId);
  const person = matchConnection(userId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = person?.status === "pending";
  const incoming = pending && person?.direction === "incoming";
  const outgoing = pending && person?.direction === "outgoing";

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      nav.back();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Could not update that request.");
    }
  }

  return (
    <Screen>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <IconButton source={icons.arrowLeft} label="Back" onPress={nav.back} />
        <AppText size={16} weight="extrabold">
          Profile
        </AppText>
      </View>
      {profile ? (
        <ProfilePreview profile={profile} chrome={false} />
      ) : (
        <AppText muted style={styles.missing}>
          This profile is not available.
        </AppText>
      )}
      {incoming || outgoing ? (
        <View style={[styles.actions, { borderTopColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
          {error ? (
            <AppText size={12} color={theme.colors.danger}>
              {error}
            </AppText>
          ) : null}
          {incoming ? (
            <View style={styles.row}>
              <SecondaryButton style={styles.choice} height={48} fontSize={14} disabled={busy} onPress={() => void run(() => respondToMatch(person.requestId, false))}>
                Decline
              </SecondaryButton>
              <PrimaryButton style={styles.choice} height={48} fontSize={14} disabled={busy} onPress={() => void run(() => respondToMatch(person.requestId, true))}>
                Accept
              </PrimaryButton>
            </View>
          ) : (
            <SecondaryButton
              height={48}
              fontSize={14}
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  await cancelMatchRequest(person!.requestId);
                  clearReview(userId);
                })
              }
            >
              Cancel request
            </SecondaryButton>
          )}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingBottom: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  missing: {
    padding: 24,
  },
  actions: {
    borderTopWidth: 1,
    gap: 8,
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  choice: {
    flex: 1,
  },
});
