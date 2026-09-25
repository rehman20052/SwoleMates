import { ReactNode, useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { AppText, Avatar, Screen, TitleBar } from "@/components/ui";
import { cancelMatchRequest, listConnections, respondToMatch, type MatchConnection } from "@/lib/matches";
import { useNavigation } from "@/navigation";
import { useAppTheme } from "@/theme";

export function InboxScreen({ empty }: { empty: ReactNode }) {
  const nav = useNavigation();
  const [connections, setConnections] = useState<MatchConnection[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    let active = true;
    setStatus("loading");
    listConnections()
      .then((people) => {
        if (!active) return;
        setConnections(people);
        setStatus("ready");
        setMessage(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Could not load chats.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => load(), [load]);

  const requests = connections.filter((person) => person.status === "pending");
  const chats = connections.filter((person) => person.status === "accepted");
  const incoming = requests.filter((person) => person.direction === "incoming").length;

  async function change(action: () => Promise<void>) {
    try {
      await action();
      load();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not update that request.");
    }
  }

  return (
    <Screen>
      <TitleBar title="Chat" />
      {status === "loading" ? (
        <AppText muted style={styles.note}>
          Loading chats...
        </AppText>
      ) : status === "error" ? (
        <AppText muted style={styles.note}>
          {message}
        </AppText>
      ) : requests.length === 0 && chats.length === 0 ? (
        empty
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list}>
          {requests.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionTitle}>
                <AppText size={13} weight="bold" muted upper>
                  Requests
                </AppText>
                {incoming > 0 ? <Count value={incoming} /> : null}
              </View>
              {requests.map((person) => (
                <RequestCard
                  key={person.requestId}
                  person={person}
                  onAccept={() => void change(() => respondToMatch(person.requestId, true))}
                  onDecline={() => void change(() => respondToMatch(person.requestId, false))}
                  onCancel={() => void change(() => cancelMatchRequest(person.requestId))}
                />
              ))}
            </View>
          ) : null}

          <View style={styles.section}>
            <AppText size={13} weight="bold" muted upper>
              Messages
            </AppText>
            {chats.length > 0 ? (
              chats.map((person) => (
                <Pressable
                  key={person.requestId}
                  accessibilityRole="button"
                  accessibilityLabel={`Chat with ${person.name}`}
                  onPress={() => nav.push({ name: "chat", id: person.userId })}
                  style={({ pressed }) => [styles.chat, { opacity: pressed ? 0.75 : 1 }]}
                >
                  <PersonFace person={person} size={52} />
                  <View style={styles.chatText}>
                    <AppText size={16} weight="extrabold" numberOfLines={1}>
                      {person.name}
                    </AppText>
                    <AppText size={13} muted numberOfLines={1}>
                      {person.lastMessage || "Say hello"}
                    </AppText>
                  </View>
                </Pressable>
              ))
            ) : (
              <AppText size={13} muted>
                When a request is accepted, the chat shows up here.
              </AppText>
            )}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

function RequestCard({
  person,
  onAccept,
  onDecline,
  onCancel,
}: {
  person: MatchConnection;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
}) {
  const theme = useAppTheme();
  const incoming = person.direction === "incoming";
  const detail = [person.age, person.gym].filter(Boolean).join(" · ");

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <View style={styles.person}>
        <PersonFace person={person} size={48} />
        <View style={styles.chatText}>
          <AppText size={16} weight="extrabold" numberOfLines={1}>
            {person.name}
          </AppText>
          <AppText size={13} muted numberOfLines={1}>
            {incoming ? "Wants to train with you" : "Waiting for them to accept"}
            {detail ? ` · ${detail}` : ""}
          </AppText>
        </View>
      </View>
      {incoming ? (
        <View style={styles.actions}>
          <Action label="Decline" onPress={onDecline} />
          <Action label="Accept" primary onPress={onAccept} />
        </View>
      ) : (
        <Action label="Cancel" onPress={onCancel} />
      )}
    </View>
  );
}

function PersonFace({ person, size }: { person: MatchConnection; size: number }) {
  const theme = useAppTheme();
  if (person.photo) return <Avatar source={{ uri: person.photo }} size={size} />;
  return (
    <View style={[styles.letter, { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.primaryTint }]}>
      <AppText size={size * 0.38} weight="black" primary>
        {person.name.slice(0, 1).toUpperCase()}
      </AppText>
    </View>
  );
}

function Count({ value }: { value: number }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.count, { backgroundColor: theme.colors.primary }]}>
      <AppText size={11} weight="extrabold" color={theme.colors.primaryText}>
        {value}
      </AppText>
    </View>
  );
}

function Action({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: primary ? theme.colors.primary : theme.colors.surfaceRaised,
          borderColor: primary ? theme.colors.primary : theme.colors.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <AppText size={13} weight="extrabold" color={primary ? theme.colors.primaryText : theme.colors.text}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  note: {
    padding: 24,
  },
  list: {
    gap: 28,
    paddingBottom: 32,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
    padding: 14,
  },
  person: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  chat: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingVertical: 6,
  },
  chatText: {
    flex: 1,
    gap: 3,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  action: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  count: {
    borderRadius: 8,
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  letter: {
    alignItems: "center",
    justifyContent: "center",
  },
});
