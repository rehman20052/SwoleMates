import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { AppText, Avatar, PrimaryButton, SecondaryButton, Screen, TitleBar } from "@/components/ui";
import { SwipeChatRow, type ChatAction } from "@/components/swipe-chat-row";
import { chatReadTimes, clearUnopenedMatchReads, latestMessageBodies, listConnections, notifyChatAlerts, subscribeChatAlerts, syncIncomingReadCursors, unmatch, type MatchConnection } from "@/lib/matches";
import { blockPerson, blockedUserIds } from "@/lib/safety";
import { loadAccountHiddenChats, setAccountChatHidden } from "@/lib/account-markers";
import { supabase } from "@/lib/supabase";
import { answeredIncomingWorkoutIds, clearCanceledWorkoutPreviews, workoutPlanId } from "@/lib/workouts";
import { useNavigation } from "@/navigation";
import { useAppTheme } from "@/theme";

type RequestTab = "received" | "sent";

// The inbox unmounts while a request profile is open, so this keeps Sent selected
// when that screen closes.
let savedRequestTab: RequestTab = "received";

export function InboxScreen({ empty }: { empty: ReactNode }) {
  const nav = useNavigation();
  const theme = useAppTheme();
  const [hiddenIds, setHiddenIds] = useState(new Set<string>());
  const [hiddenExpanded, setHiddenExpanded] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ person: MatchConnection; action: ChatAction } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [connections, setConnections] = useState<MatchConnection[]>([]);
  const [openedIds, setOpenedIds] = useState<Set<string>>(new Set());
  const [readTimes, setReadTimes] = useState<Record<string, string>>({});
  const [answeredWorkouts, setAnsweredWorkouts] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [requestTab, setRequestTab] = useState<RequestTab>(savedRequestTab);
  const hiddenVersion = useRef(0);

  const selectRequestTab = (tab: RequestTab) => {
    savedRequestTab = tab;
    setRequestTab(tab);
  };

  const load = useCallback((background = false) => {
    let active = true;
    const version = hiddenVersion.current;
    if (!background) setStatus("loading");
    listConnections()
      .then(async (people) => {
        const { data: session, error } = await supabase.auth.getSession();
        if (error) throw error;
        const viewer = session.session?.user.id;
        if (!viewer) throw new Error("Sign in to view your chats.");
        const hidden = await loadAccountHiddenChats(viewer);
        const acceptedIds = people.filter((person) => person.status === "accepted").map((person) => person.requestId);
        await clearCanceledWorkoutPreviews(acceptedIds);
        await syncIncomingReadCursors(acceptedIds);
        const [reads, latest, answered] = await Promise.all([
          chatReadTimes(),
          latestMessageBodies(acceptedIds),
          answeredIncomingWorkoutIds(acceptedIds),
        ]);
        const withMessages = people.map((person) => {
          const message = latest.get(person.requestId);
          return message ? { ...person, lastMessage: message.body, lastMessageMine: message.mine, lastMessageAt: message.at } : person;
        });
        await clearUnopenedMatchReads(withMessages.filter((person) => person.status === "accepted" && !person.lastMessage).map((person) => person.requestId));
        const blocked = await blockedUserIds();
        return { people: withMessages.filter((person) => !blocked.has(person.userId)), reads: await chatReadTimes(), answered, hidden, viewer };
      })
      .then(({ people, reads, answered, hidden, viewer }) => {
        if (!active) return;
        setConnections(people);
        if (version === hiddenVersion.current) setHiddenIds(hidden);
        setViewerId(viewer);
        setReadTimes(reads);
        setAnsweredWorkouts(answered);
        setOpenedIds(new Set(Object.keys(reads)));
        setStatus("ready");
        setMessage(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (background) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Could not load chats.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => load(), [load]);
  useEffect(() => {
    let cancel: (() => void) | undefined;
    const refresh = () => { cancel?.(); cancel = load(true); };
    const timer = setInterval(refresh, 15000);
    if (Platform.OS === "web") window.addEventListener("focus", refresh);
    return () => { cancel?.(); clearInterval(timer); if (Platform.OS === "web") window.removeEventListener("focus", refresh); };
  }, [load]);

  useEffect(() => subscribeChatAlerts(() => load(true)), [load]);

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
  const visibleChats = chats.filter((person) => !hiddenIds.has(person.requestId));
  const hiddenChats = chats.filter((person) => hiddenIds.has(person.requestId));
  const grouped = groupChats(visibleChats, answeredWorkouts);
  const askAction = (person: MatchConnection, action: ChatAction) => {
    setActionError(null);
    setConfirmation({ person, action });
  };
  const confirmAction = async () => {
    if (!confirmation || actionBusy || !viewerId) return;
    setActionBusy(true);
    setActionError(null);
    const { person, action } = confirmation;
    try {
      if (action === "hide" || action === "show") {
        hiddenVersion.current++;
        setHiddenIds(await setAccountChatHidden(viewerId, person.requestId, action === "hide"));
      } else {
        if (action === "unmatch") await unmatch(person.requestId);
        else await blockPerson(person.userId);
        setConnections((current) => current.filter((item) => item.userId !== person.userId));
        notifyChatAlerts();
      }
      setConfirmation(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not update this chat. Please try again.");
    } finally {
      setActionBusy(false);
    }
  };
  const actionLabel = confirmation?.action === "hide" ? "Hide chat" : confirmation?.action === "show" ? "Show chat" : confirmation?.action === "unmatch" ? "Unmatch" : "Block";

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
                  onPress={() => selectRequestTab("received")}
                />
                <RequestTab label="Sent" selected={requestTab === "sent"} onPress={() => selectRequestTab("sent")} />
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
            {visibleChats.length > 0 ? (
              <>
                <ChatGroup people={grouped.attention} openedIds={openedIds} readTimes={readTimes} answeredWorkouts={answeredWorkouts} onOpen={(person) => nav.push({ name: "chat", id: person.userId })} onAction={askAction} />
                <ChatGroup title="Waiting" people={grouped.waiting} openedIds={openedIds} readTimes={readTimes} answeredWorkouts={answeredWorkouts} onOpen={(person) => nav.push({ name: "chat", id: person.userId })} onAction={askAction} />
              </>
            ) : (
              <AppText size={13} muted>
                {hiddenChats.length ? "Your chats are in Hidden chats below." : "When a request is accepted, the chat shows up here."}
              </AppText>
            )}
          </View>
          {hiddenChats.length > 0 ? (
            <View style={styles.section}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: hiddenExpanded }} onPress={() => setHiddenExpanded((current) => !current)} style={styles.hiddenHeader}>
                <AppText weight="bold">Hidden chats ({hiddenChats.length})</AppText>
                <AppText muted>{hiddenExpanded ? "⌃" : "⌄"}</AppText>
              </Pressable>
              {hiddenExpanded ? <ChatGroup hidden people={hiddenChats} openedIds={openedIds} readTimes={readTimes} answeredWorkouts={answeredWorkouts} onOpen={(person) => nav.push({ name: "chat", id: person.userId })} onAction={askAction} /> : null}
            </View>
          ) : null}
        </ScrollView>
      )}
      <Modal transparent visible={confirmation != null} animationType="fade" onRequestClose={() => { if (!actionBusy) setConfirmation(null); }}>
        <View style={styles.confirmOverlay}>
          <View accessibilityViewIsModal style={[styles.confirmCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <AppText size={21} weight="extrabold">{actionLabel}?</AppText>
            <AppText style={{ lineHeight: 22 }}>
              {confirmation?.action === "hide" ? `Move your chat with ${confirmation.person.name} to Hidden chats? You will remain matched and can still open the conversation there.`
                : confirmation?.action === "show" ? `Move your chat with ${confirmation.person.name} back to the main chat list?`
                : confirmation?.action === "unmatch" ? `Unmatch ${confirmation.person.name}? This ends your match and removes the chat for both of you.`
                : `Block ${confirmation?.person.name ?? "this user"}? This ends your match and prevents them from contacting you. You can manage blocked users in Settings.`}
            </AppText>
            {actionError ? <AppText size={13} color={theme.colors.danger}>{actionError}</AppText> : null}
            <PrimaryButton disabled={actionBusy} onPress={() => void confirmAction()} style={confirmation?.action === "block" || confirmation?.action === "unmatch" ? { backgroundColor: theme.colors.danger } : undefined}>{actionBusy ? "Updating..." : actionLabel}</PrimaryButton>
            <SecondaryButton disabled={actionBusy} onPress={() => setConfirmation(null)}>Cancel</SecondaryButton>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function repliedToWorkout(person: MatchConnection, answeredWorkouts: Set<string>) {
  const planId = workoutPlanId(person.lastMessage);
  return !!planId && answeredWorkouts.has(planId);
}

function groupChats(chats: MatchConnection[], answeredWorkouts: Set<string>) {
  const attention: MatchConnection[] = [];
  const waiting: MatchConnection[] = [];
  for (const person of chats) {
    if (person.lastMessageMine || repliedToWorkout(person, answeredWorkouts)) waiting.push(person);
    else attention.push(person);
  }
  const byRecent = (left: MatchConnection, right: MatchConnection) => right.lastMessageAt.localeCompare(left.lastMessageAt);
  return {
    attention: [...attention].sort((left, right) => Number(Boolean(left.lastMessage)) - Number(Boolean(right.lastMessage)) || byRecent(left, right)),
    waiting: [...waiting].sort(byRecent),
  };
}

function hasUnreadMessage(person: MatchConnection, readTimes: Record<string, string>, answeredWorkouts: Set<string>) {
  if (!person.lastMessage || person.lastMessageMine || repliedToWorkout(person, answeredWorkouts) || !person.lastMessageAt) return false;
  const readAt = readTimes[person.requestId];
  if (!readAt) return true;
  return new Date(person.lastMessageAt).getTime() > new Date(readAt).getTime();
}

function ChatGroup({
  title,
  people,
  openedIds,
  readTimes,
  answeredWorkouts,
  onOpen,
  onAction,
  hidden,
}: {
  title?: string;
  people: MatchConnection[];
  openedIds: Set<string>;
  readTimes: Record<string, string>;
  answeredWorkouts: Set<string>;
  onOpen: (person: MatchConnection) => void;
  onAction: (person: MatchConnection, action: ChatAction) => void;
  hidden?: boolean;
}) {
  const theme = useAppTheme();
  if (people.length === 0) return null;
  return (
    <View style={styles.section}>
      {title ? (
        <AppText size={12} weight="bold" muted upper style={styles.groupLabel}>
          {title}
        </AppText>
      ) : null}
      {people.map((person) => (
        <SwipeChatRow
          key={person.requestId}
          name={person.name}
          hidden={hidden}
          onOpen={() => onOpen(person)}
          onAction={(action) => onAction(person, action)}
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
              unread={hasUnreadMessage(person, readTimes, answeredWorkouts)}
              replied={repliedToWorkout(person, answeredWorkouts)}
            />
          </View>
          {hasUnreadMessage(person, readTimes, answeredWorkouts) ? <View style={[styles.newDot, { backgroundColor: theme.colors.primary }]} /> : null}
        </SwipeChatRow>
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

function ChatPreview({ person, isNew, startChat, unread, replied }: { person: MatchConnection; isNew: boolean; startChat: boolean; unread?: boolean; replied?: boolean }) {
  const theme = useAppTheme();
  if (startChat) {
    return (
      <AppText size={13} numberOfLines={1}>
        Start chat
      </AppText>
    );
  }
  if (!isNew) {
    const sent = !unread && (!person.lastMessage || person.lastMessageMine || replied);
    return (
      <AppText size={13} weight={sent ? "regular" : "extrabold"} muted={sent} numberOfLines={1}>
        {person.lastMessage.split("\n")[0] || "Say hello"}
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
  hiddenHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  confirmOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 24 },
  confirmCard: { width: "100%", maxWidth: 380, borderRadius: 20, borderWidth: 1, padding: 20, gap: 16 },
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
