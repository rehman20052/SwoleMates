import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText, BackButton, PrimaryButton, Screen, SecondaryButton } from "@/components/ui";
import { isAccountId } from "@/lib/discover";
import { cancelMatchRequest, loadPublicMatchProfile, matchConnection, matchProfile, respondToMatch, sendMatchRequest } from "@/lib/matches";
import { authorIsPublic } from "@/lib/social";
import { useNavigation } from "@/navigation";
import type { UserProfile } from "@/lib/profile";
import { ProfilePreview } from "@/screens/profile";
import { useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";

export function RequestProfileScreen({ userId }: { userId: string }) {
  const theme = useAppTheme();
  const nav = useNavigation();
  const { clearReview } = useAppData();
  const person = matchConnection(userId);
  const [profile, setProfile] = useState<UserProfile | null>(() => matchProfile(userId));
  const [profileReady, setProfileReady] = useState(() => matchProfile(userId) != null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = person?.status === "pending";
  const incoming = pending && person?.direction === "incoming";
  const outgoing = pending && person?.direction === "outgoing";
  const accepted = person?.status === "accepted";
  const [canSeePosts, setCanSeePosts] = useState(false);

  useEffect(() => {
    const cached = matchProfile(userId);
    if (cached) {
      setProfile(cached);
      setProfileReady(true);
      return;
    }
    let alive = true;
    setProfileReady(false);
    void loadPublicMatchProfile(userId).then((loaded) => {
      if (!alive) return;
      setProfile(loaded);
      setProfileReady(true);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!isAccountId(userId)) return;
    if (accepted) {
      setCanSeePosts(true);
      return;
    }
    let alive = true;
    void authorIsPublic(userId).then((open) => {
      if (alive) setCanSeePosts(open);
    });
    return () => {
      alive = false;
    };
  }, [accepted, userId]);

  const canSend = !!profile && !incoming && !outgoing && !accepted;

  async function sendRequest() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await sendMatchRequest(userId);
      nav.back();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Could not send that request.");
    }
  }

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
        <BackButton onPress={nav.back} />
        <AppText size={16} weight="extrabold" style={{ flex: 1 }}>
          Profile
        </AppText>
        {canSeePosts ? (
          <Pressable accessibilityRole="button" onPress={() => nav.push({ name: "social-profile", userId })} hitSlop={8}>
            <AppText size={14} weight="bold" primary>
              Posts
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {profile ? (
        <ProfilePreview profile={profile} chrome={false} />
      ) : (
        <AppText muted style={styles.missing}>
          {profileReady ? "This profile is not available." : "Loading profile..."}
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
      {canSend ? (
        <View style={[styles.actions, { borderTopColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
          {error ? (
            <AppText size={12} color={theme.colors.danger}>
              {error}
            </AppText>
          ) : null}
          <PrimaryButton height={48} fontSize={14} disabled={busy} onPress={() => void sendRequest()}>
            {busy ? "Sending..." : "Send request"}
          </PrimaryButton>
          <SecondaryButton height={48} fontSize={14} disabled={busy} onPress={nav.back}>
            Exit profile
          </SecondaryButton>
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
