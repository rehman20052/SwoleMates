import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { AppText, Avatar, Screen, TitleBar } from "@/components/ui";
import { listBlockedPeople, unblockPerson, type BlockedPerson } from "@/lib/safety";
import { notifyChatAlerts } from "@/lib/matches";
import { useAppTheme } from "@/theme";

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const theme = useAppTheme();
  const [people, setPeople] = useState<BlockedPerson[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listBlockedPeople()
      .then((blocked) => {
        if (!active) return;
        setPeople(blocked);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Could not load blocked people.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function unblock(userId: string) {
    setBusyId(userId);
    setMessage(null);
    try {
      await unblockPerson(userId);
      setPeople((current) => current.filter((person) => person.userId !== userId));
      notifyChatAlerts();
      setStatus("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not unblock that person.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen>
      <TitleBar title="Settings" onBack={onClose} />
      <ScrollView contentContainerStyle={styles.list}>
        <AppText size={13} weight="bold" primary upper>
          Blocked users
        </AppText>
        {status === "loading" ? <AppText muted>Loading blocked people...</AppText> : null}
        {status === "error" ? <AppText color={theme.colors.danger}>{message}</AppText> : null}
        {status === "ready" && people.length === 0 ? (
          <AppText muted style={{ lineHeight: 20 }}>
            You haven't blocked anyone. People you block disappear from Discover, chat, and matching until you unblock them here.
          </AppText>
        ) : null}
        {people.map((person) => (
          <View key={person.userId} style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            {person.photo ? <Avatar source={{ uri: person.photo }} size={44} /> : <View style={[styles.face, { backgroundColor: theme.colors.surfaceRaised }]} />}
            <AppText weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
              {person.name}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Unblock ${person.name}`}
              disabled={busyId === person.userId}
              onPress={() => void unblock(person.userId)}
              style={[styles.unblock, { borderColor: theme.colors.border, opacity: busyId === person.userId ? 0.6 : 1 }]}
            >
              <AppText size={13} weight="semibold">
                {busyId === person.userId ? "Unblocking…" : "Unblock"}
              </AppText>
            </Pressable>
          </View>
        ))}
        {message && status === "ready" ? <AppText color={theme.colors.danger}>{message}</AppText> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 12,
    padding: 20,
  },
  row: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  face: {
    borderRadius: 22,
    height: 44,
    width: 44,
  },
  unblock: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
