import { ReactNode, useCallback, useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { AppText, Avatar, Screen, TitleBar } from "@/components/ui";
import { chatReadTimes, clearUnopenedMatchReads, latestMessageBodies, listConnections, type MatchConnection } from "@/lib/matches";
import { useNavigation } from "@/navigation";
import { useAppTheme } from "@/theme";

export function InboxScreen({ empty }: { empty: ReactNode }) {
  const nav = useNavigation();
  const [connections, setConnections] = useState<MatchConnection[]>([]);
  const [openedIds, setOpenedIds] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [requestTab, setRequestTab] = useState<"received" | "sent">("received");

  const load = useCallback(() => {
    let active = true;
    setStatus("loading");
    listConnections()
      .then(async (people) => {
        const acceptedIds = people.filter((person) => person.status === "accepted").map((person) => person.requestId);
        const [reads, latest] = await Promise.all([chatReadTimes(), latestMessageBodies(acceptedIds)]);
        const withMessages = people.map((person) => {
          const message = latest.get(person.requestId);
          return message ? { ...person, lastMessage: message.body, lastMessageMine: message.mine, lastMessageAt: message.at } : person;
        });
        await clearUnopenedMatchReads(withMessages.filter((person) => person.status === "accepted" && !person.lastMessage).map((person) => person.requestId));
        return { people: withMessages, reads: await chatReadTimes() };
      })
      .then(({ people, reads }) => {
        if (!active) return;
        setConnections(people);
        setOpenedIds(new Set(Object.keys(reads)));
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

  useEffect(() => {
    if (Platform.OS !== "web" || document.getElementById("chat-scroll-style")) return;
    const style = document.createElement("style");
    style.id = "chat-scroll-style";
    style.textContent = "#chat-scroll, #chat-scroll * { scrollbar-width: none; } #chat-scroll::-webkit-scrollbar, #chat-scroll *::-webkit-scrollbar { display: none; width: 0; height: 0; }";
    document.head.appendChild(style);
  }, []);

  const requests = connections.filter((person) => person.status === "pending");
  const received = requests.filter((person) => person.direction === "incoming");
  const sent = requests.filter((person) => person.direction === "outgoing");
  const shownRequests = requestTab === "received" ? received : sent;
  const chats = connections.filter((person) => person.status === "accepted");
  const grouped = groupChats(chats);

  return (
    <Screen style={styles.screen}>
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
        <ScrollView nativeID="chat-scroll" style={styles.scroll} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {requests.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.requestTabs}>
                <RequestTab
                  label="Received"
                  count={received.length}
                  selected={requestTab === "received"}
                  onPress={() => setRequestTab("received")}
                />
                <RequestTab label="Sent" selected={requestTab === "sent"} onPress={() => setRequestTab("sent")} />
              </View>
              {shownRequests.length > 0 ? (
                <RequestBox people={shownRequests} onView={(person) => nav.push({ name: "request-profile", userId: person.userId })} />
              ) : (
                <AppText size={13} muted>
                  {requestTab === "received" ? "No requests waiting on you." : "You have not sent any requests."}
                </AppText>
              )}
            </View>
          ) : null}

          <View style={styles.groups}>
            {chats.length > 0 ? (
              <>
                <ChatGroup people={grouped.attention} openedIds={openedIds} onOpen={(person) => nav.push({ name: "chat", id: person.userId })} />
                <ChatGroup title="Waiting" people={grouped.waiting} openedIds={openedIds} onOpen={(person) => nav.push({ name: "chat", id: person.userId })} />
              </>
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

function groupChats(chats: MatchConnection[]) {
  const attention: MatchConnection[] = [];
  const waiting: MatchConnection[] = [];
  for (const person of chats) {
    if (person.lastMessageMine) waiting.push(person);
    else attention.push(person);
  }
  const byRecent = (left: MatchConnection, right: MatchConnection) => right.lastMessageAt.localeCompare(left.lastMessageAt);
  return {
    attention: [...attention].sort((left, right) => Number(Boolean(left.lastMessage)) - Number(Boolean(right.lastMessage)) || byRecent(left, right)),
    waiting: [...waiting].sort(byRecent),
  };
}

function ChatGroup({
  title,
  people,
  openedIds,
  onOpen,
}: {
  title?: string;
  people: MatchConnection[];
  openedIds: Set<string>;
  onOpen: (person: MatchConnection) => void;
}) {
  if (people.length === 0) return null;
  return (
    <View style={styles.section}>
      {title ? (
        <AppText size={12} weight="bold" muted upper style={styles.groupLabel}>
          {title}
        </AppText>
      ) : null}
      {people.map((person) => (
        <Pressable
          key={person.requestId}
          accessibilityRole="button"
          accessibilityLabel={`Chat with ${person.name}`}
          onPress={() => onOpen(person)}
          style={({ pressed }) => [styles.chat, { opacity: pressed ? 0.75 : 1 }]}
        >
          <PersonFace person={person} size={50} />
          <View style={styles.chatText}>
            <AppText size={16} weight="extrabold" numberOfLines={1}>
              {person.name}
            </AppText>
            <ChatPreview
              person={person}
              isNew={!person.lastMessage && !openedIds.has(person.requestId)}
              startChat={!person.lastMessage && openedIds.has(person.requestId)}
            />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function RequestTab({
  label,
  count = 0,
  selected,
  onPress,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.requestTab,
        {
          backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
        },
      ]}
    >
      <AppText size={13} weight="extrabold" color={selected ? theme.colors.primaryText : theme.colors.muted}>
        {label}
      </AppText>
      {count > 0 ? <Count value={count} inverted={selected} /> : null}
    </Pressable>
  );
}

function RequestBox({ people, onView }: { people: MatchConnection[]; onView: (person: MatchConnection) => void }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.requestBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <ScrollView style={styles.requestScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        {people.map((person) => (
          <Pressable
            key={person.requestId}
            accessibilityRole="button"
            accessibilityLabel={`View ${person.name}'s profile`}
            onPress={() => onView(person)}
            style={({ pressed }) => [styles.person, { opacity: pressed ? 0.75 : 1 }]}
          >
            <PersonFace person={person} size={44} />
            <View style={styles.chatText}>
              <AppText size={15} weight="extrabold" numberOfLines={1}>
                {person.name}
              </AppText>
              <AppText size={12} muted numberOfLines={1}>
                {person.gym || (person.direction === "incoming" ? "Wants to train with you" : "Waiting for them to accept")}
              </AppText>
            </View>
            <AppText size={18} muted>
              ›
            </AppText>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function ChatPreview({ person, isNew, startChat }: { person: MatchConnection; isNew: boolean; startChat: boolean }) {
  const theme = useAppTheme();
  if (startChat) {
    return (
      <AppText size={13} numberOfLines={1}>
        Start chat
      </AppText>
    );
  }
  if (!isNew) {
    const sent = !person.lastMessage || person.lastMessageMine;
    return (
      <AppText size={13} weight={sent ? "regular" : "medium"} muted={sent} numberOfLines={1}>
        {person.lastMessage || "Say hello"}
      </AppText>
    );
  }

  return (
    <View style={styles.newMatch}>
      <View style={[styles.newDot, { backgroundColor: theme.colors.primary }]} />
      <AppText size={13} weight="bold" primary numberOfLines={1}>
        New match
      </AppText>
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

function Count({ value, inverted }: { value: number; inverted?: boolean }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.count, { backgroundColor: inverted ? theme.colors.primaryText : theme.colors.primary }]}>
      <AppText size={11} weight="extrabold" color={inverted ? theme.colors.primary : theme.colors.primaryText}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 8,
  },
  note: {
    padding: 24,
  },
  scroll: {
    flex: 1,
  },
  list: {
    gap: 32,
    paddingBottom: 28,
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  groups: {
    gap: 32,
  },
  section: {
    gap: 4,
  },
  requestTabs: {
    flexDirection: "row",
    gap: 8,
  },
  requestTab: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 11,
  },
  requestBox: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  requestScroll: {
    maxHeight: 220,
  },
  person: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  chat: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    paddingVertical: 12,
  },
  chatText: {
    flex: 1,
    gap: 4,
  },
  groupLabel: {
    marginBottom: 6,
    marginTop: 8,
  },
  newMatch: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  newDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
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
