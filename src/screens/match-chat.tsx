import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Keyboard, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type KeyboardEvent } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { icons } from "@/assets";
import { AppText, Avatar, Icon, IconButton, Screen } from "@/components/ui";
import { deleteMatchMessage, editMatchMessage, listConnections, listMessages, markChatRead, messageEditable, sendMatchMessage, unmatch, type MatchConnection, type MatchMessage } from "@/lib/matches";
import { supabase } from "@/lib/supabase";
import { useNavigation } from "@/navigation";
import { useAppTheme } from "@/theme";

type BubbleAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
  stageWidth: number;
  stageHeight: number;
};

function menuHeight(canEdit: boolean, confirmingDelete: boolean) {
  if (confirmingDelete) return 148;
  return canEdit ? 92 : 48;
}

export function MatchChat({ userId }: { userId: string }) {
  const theme = useAppTheme();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const keyboardLift = useRef(new Animated.Value(0)).current;
  const [person, setPerson] = useState<MatchConnection | null>(null);
  const [me, setMe] = useState("");
  const [messages, setMessages] = useState<MatchMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmingUnmatch, setConfirmingUnmatch] = useState(false);
  const [unmatching, setUnmatching] = useState(false);
  const [held, setHeld] = useState<MatchMessage | null>(null);
  const [anchor, setAnchor] = useState<BubbleAnchor | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const stageRef = useRef<View>(null);
  const bubbleNodes = useRef(new Map<string, View>());
  const [editing, setEditing] = useState<MatchMessage | null>(null);
  const inputRef = useRef<TextInput>(null);
  const draftBeforeEdit = useRef("");
  const [caret, setCaret] = useState<{ start: number; end: number } | undefined>(undefined);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setMe(data.session?.user.id ?? "");
    });
    listConnections()
      .then((connections) => {
        if (!active) return;
        setPerson(connections.find((item) => item.userId === userId && item.status === "accepted") ?? null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Could not open this chat.");
      });
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!person) return;
    void markChatRead(person.requestId);
  }, [person]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const move = (event: KeyboardEvent, open: boolean) => {
      const covered = open ? Dimensions.get("window").height - event.endCoordinates.screenY : 0;
      const inset = Platform.OS === "ios" ? insets.bottom : 0;
      const rawDuration = event.duration ?? 0;
      const duration = rawDuration > 10 ? rawDuration : rawDuration > 0 ? rawDuration * 1000 : 250;
      Animated.timing(keyboardLift, {
        toValue: Math.max(0, covered - inset),
        duration,
        useNativeDriver: false,
      }).start(() => {
        if (open) scrollRef.current?.scrollToEnd({ animated: true });
      });
    };
    const showSub = Keyboard.addListener(showEvent, (event) => move(event, true));
    const hideSub = Keyboard.addListener(hideEvent, (event) => move(event, false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom, keyboardLift]);

  useEffect(() => {
    if (!editing) return;
    const end = editing.body.length;
    const timer = setTimeout(() => placeCaret(end), 60);
    const release = setTimeout(() => setCaret(undefined), 160);
    return () => {
      clearTimeout(timer);
      clearTimeout(release);
    };
  }, [editing]);

  useEffect(() => {
    if (!person || !me) return;
    let active = true;
    listMessages(person.requestId, me)
      .then((items) => {
        if (active) setMessages(items);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load messages.");
      });
    return () => {
      active = false;
    };
  }, [person, me]);

  function closeMenu() {
    setHeld(null);
    setAnchor(null);
    setConfirmingDelete(false);
  }

  function holdMessage(message: MatchMessage) {
    const bubble = bubbleNodes.current.get(message.id);
    const stage = stageRef.current;
    if (!bubble || !stage) return;
    bubble.measureInWindow((x, y, width, height) => {
      stage.measureInWindow((stageX, stageY, stageWidth, stageHeight) => {
        setConfirmingDelete(false);
        setAnchor({ x: x - stageX, y: y - stageY, width, height, stageWidth, stageHeight });
        setHeld(message);
      });
    });
  }

  function beginEdit(message: MatchMessage) {
    if (!messageEditable(message.createdAt)) {
      closeMenu();
      return;
    }
    if (!editing) draftBeforeEdit.current = draft;
    setEditing(message);
    setDraft(message.body);
    setCaret({ start: message.body.length, end: message.body.length });
    closeMenu();
  }

  function placeCaret(end: number) {
    const input = inputRef.current as TextInput & { setSelectionRange?: (start: number, end: number) => void };
    input?.focus();
    input?.setNativeProps?.({ selection: { start: end, end } });
    input?.setSelectionRange?.(end, end);
    setCaret({ start: end, end });
  }

  function cancelEdit() {
    setDraft(draftBeforeEdit.current);
    draftBeforeEdit.current = "";
    setEditing(null);
  }

  async function refreshMessages() {
    if (!person) return;
    setMessages(await listMessages(person.requestId, me));
  }

  async function send() {
    if (!person || !draft.trim()) return;
    const text = draft;
    if (editing) {
      if (text.trim() === editing.body) {
        cancelEdit();
        return;
      }
      if (!messageEditable(editing.createdAt)) {
        setEditing(null);
        setDraft("");
        return;
      }
      setDraft("");
      try {
        await editMatchMessage(editing.id, text);
        setEditing(null);
        draftBeforeEdit.current = "";
        await refreshMessages();
        setError(null);
      } catch (err) {
        setDraft(text);
        setError(err instanceof Error ? err.message : "Could not edit that message.");
      }
      return;
    }
    setDraft("");
    try {
      await sendMatchMessage(person.requestId, text);
      await refreshMessages();
      setError(null);
    } catch (err) {
      setDraft(text);
      setError(err instanceof Error ? err.message : "Could not send that message.");
    }
  }

  async function confirmUnmatch() {
    if (!person) return;
    setUnmatching(true);
    try {
      await unmatch(person.requestId);
      nav.back();
    } catch (err) {
      setUnmatching(false);
      setConfirmingUnmatch(false);
      setError(err instanceof Error ? err.message : "Could not unmatch. Try again.");
    }
  }

  async function removeHeld() {
    if (!person || !held) return;
    const message = held;
    try {
      await deleteMatchMessage(message.id);
      if (editing?.id === message.id) cancelEdit();
      closeMenu();
      await refreshMessages();
      setError(null);
    } catch (err) {
      closeMenu();
      setError(err instanceof Error ? err.message : "Could not delete that message.");
    }
  }

  const menuTop = anchor
    ? anchor.y + anchor.height + 8 + menuHeight(Boolean(held && messageEditable(held.createdAt)), confirmingDelete) < anchor.stageHeight - 12
      ? anchor.y + anchor.height + 8
      : Math.max(12, anchor.y - 8 - menuHeight(Boolean(held && messageEditable(held.createdAt)), confirmingDelete))
    : 0;
  const menuLeft = anchor ? Math.max(12, Math.min(anchor.x + anchor.width - 188, anchor.stageWidth - 188 - 12)) : 0;

  return (
    <Screen style={styles.screen}>
      <View ref={stageRef} collapsable={false} style={styles.stage}>
      <View style={[styles.headerBlock, { borderBottomColor: theme.colors.border }]}>
        <View style={styles.header}>
          <IconButton source={icons.arrowLeft} label="Back" onPress={nav.back} />
          {person?.photo ? <Avatar source={{ uri: person.photo }} size={40} /> : null}
          <View style={styles.identity}>
            <AppText size={16} weight="extrabold" numberOfLines={1}>
              {person?.name ?? "Chat"}
            </AppText>
            {person?.gym ? (
              <AppText size={12} muted numberOfLines={1}>
                {person.gym}
              </AppText>
            ) : null}
          </View>
        </View>
        {person ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View ${person.name}'s profile`}
            onPress={() => nav.push({ name: "request-profile", userId: person.userId })}
            style={[styles.profileLink, { backgroundColor: theme.colors.surfaceRaised }]}
          >
            <AppText size={13} weight="medium">
              View profile
            </AppText>
            <AppText size={16} muted>
              ›
            </AppText>
          </Pressable>
        ) : null}
        {person && !confirmingUnmatch ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Unmatch ${person.name}`}
            onPress={() => setConfirmingUnmatch(true)}
            style={styles.unmatchLink}
          >
            <AppText size={13} weight="medium" color={theme.colors.danger}>
              Unmatch
            </AppText>
          </Pressable>
        ) : null}
        {person && confirmingUnmatch ? (
          <View style={[styles.confirm, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border }]}>
            <AppText size={13} weight="bold">
              Unmatch {person.name}?
            </AppText>
            <AppText size={12} muted>
              Your chat is hidden for both of you. Either of you can send a new request later, and the chat comes back if it's accepted.
            </AppText>
            <View style={styles.confirmButtons}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setConfirmingUnmatch(false)}
                disabled={unmatching}
                style={[styles.confirmButton, { backgroundColor: theme.colors.surface }]}
              >
                <AppText size={13} weight="bold">
                  Cancel
                </AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => void confirmUnmatch()}
                disabled={unmatching}
                style={[styles.confirmButton, { backgroundColor: theme.colors.danger, opacity: unmatching ? 0.6 : 1 }]}
              >
                <AppText size={13} weight="bold" color="#FFFFFF">
                  {unmatching ? "Unmatching…" : "Unmatch"}
                </AppText>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      <Animated.View style={[styles.thread, { paddingBottom: keyboardLift }]}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.messages}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 ? (
            <View style={styles.empty}>
              <AppText muted style={{ textAlign: "center", lineHeight: 20 }}>
                You're training partners. Say hello.
              </AppText>
            </View>
          ) : (
            messages.map((message) => (
              <Bubble
                key={message.id}
                message={message}
                hidden={held?.id === message.id}
                onHold={message.mine ? () => holdMessage(message) : undefined}
                onBind={message.mine ? (node) => {
                  if (node) bubbleNodes.current.set(message.id, node);
                  else bubbleNodes.current.delete(message.id);
                } : undefined}
              />
            ))
          )}
          {error ? (
            <AppText size={12} color={theme.colors.danger}>
              {error}
            </AppText>
          ) : null}
        </ScrollView>

        {editing ? (
          <View style={[styles.editingBar, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }]}>
            <AppText size={12} weight="semibold">
              Editing message
            </AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel edit" onPress={cancelEdit}>
              <AppText size={12} weight="semibold" muted>
                Cancel
              </AppText>
            </Pressable>
          </View>
        ) : null}
        <View style={[styles.composer, { backgroundColor: theme.colors.surface, borderTopColor: editing ? "transparent" : theme.colors.border }]}>
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            selection={caret}
            onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
            onSubmitEditing={() => void send()}
            placeholder={editing ? "Edit message" : "Message"}
            placeholderTextColor={theme.colors.muted}
            selectionColor={theme.colors.primary}
            style={[styles.input, { backgroundColor: theme.colors.surfaceRaised, color: theme.colors.text, fontFamily: theme.fonts.regular }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={editing ? "Save edit" : "Send message"}
            onPress={() => void send()}
            disabled={!draft.trim() || !person}
            style={[styles.send, { backgroundColor: theme.colors.primary, opacity: draft.trim() && person ? 1 : 0.45 }]}
          >
            <Icon source={icons.arrowUp} size={16} />
          </Pressable>
        </View>
      </Animated.View>

      {held && anchor ? (
        <View style={styles.focusLayer}>
          <BlurView intensity={42} tint="dark" style={StyleSheet.absoluteFill}>
            <Pressable accessibilityLabel="Close message actions" style={StyleSheet.absoluteFill} onPress={closeMenu} />
          </BlurView>
          <View pointerEvents="none" style={[styles.focusBubble, { top: anchor.y - 6, left: anchor.x, width: anchor.width }]}>
            <MessageBody message={held} lifted />
          </View>
          <View style={[styles.menu, { top: menuTop, left: menuLeft, backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border }]}>
            {confirmingDelete ? (
              <>
                <View style={styles.menuNote}>
                  <AppText size={13} weight="semibold">
                    Delete this message?
                  </AppText>
                  <AppText size={12} muted>
                    Removed for both of you.
                  </AppText>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Delete message" onPress={() => void removeHeld()} style={[styles.menuAction, styles.menuDivider, { borderTopColor: theme.colors.border }]}>
                  <AppText size={15} weight="semibold" color={theme.colors.danger}>
                    Delete
                  </AppText>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Keep message" onPress={closeMenu} style={[styles.menuAction, styles.menuDivider, { borderTopColor: theme.colors.border }]}>
                  <AppText size={15} weight="semibold">
                    Keep
                  </AppText>
                </Pressable>
              </>
            ) : (
              <>
                {messageEditable(held.createdAt) ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Edit message" onPress={() => beginEdit(held)} style={styles.menuAction}>
                    <AppText size={15} weight="semibold">
                      Edit message
                    </AppText>
                  </Pressable>
                ) : null}
                <Pressable accessibilityRole="button" accessibilityLabel="Delete message" onPress={() => setConfirmingDelete(true)} style={[styles.menuAction, messageEditable(held.createdAt) && styles.menuDivider, messageEditable(held.createdAt) && { borderTopColor: theme.colors.border }]}>
                  <AppText size={15} weight="semibold" color={theme.colors.danger}>
                    Delete message
                  </AppText>
                </Pressable>
              </>
            )}
          </View>
        </View>
      ) : null}
      </View>
    </Screen>
  );
}

function MessageBody({ message, lifted }: { message: MatchMessage; lifted?: boolean }) {
  const theme = useAppTheme();
  const time = new Date(message.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return (
    <View
      style={[
        styles.bubble,
        lifted && styles.liftedBubble,
        message.mine ? styles.mine : styles.theirs,
        message.mine
          ? { backgroundColor: theme.colors.primaryDeep, borderColor: theme.colors.primary }
          : { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <AppText selectable={false} style={{ lineHeight: 20 }}>{message.body}</AppText>
      <AppText selectable={false} size={11} muted>
        {time}
        {message.editedAt ? " · Edited" : ""}
      </AppText>
    </View>
  );
}

function Bubble({ message, onHold, onBind, hidden }: { message: MatchMessage; onHold?: () => void; onBind?: (node: View | null) => void; hidden?: boolean }) {
  const row = (
    <View ref={onBind} collapsable={false} style={[styles.bubbleSlot, message.mine ? styles.mineSlot : styles.theirSlot]}>
      <MessageBody message={message} />
    </View>
  );
  if (!onHold) {
    return <View style={[styles.bubbleRow, hidden && styles.hiddenBubble]}>{row}</View>;
  }
  return (
    <Pressable
      accessibilityLabel={`Your message, ${message.body}`}
      accessibilityHint="Hold to edit or delete"
      delayLongPress={400}
      onLongPress={onHold}
      style={[styles.bubbleRow, hidden && styles.hiddenBubble]}
    >
      {row}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 8,
  },
  stage: {
    flex: 1,
  },
  headerBlock: {
    borderBottomWidth: 1,
    gap: 12,
    paddingBottom: 14,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  identity: {
    flex: 1,
    gap: 2,
  },
  profileLink: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    marginLeft: 32,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  unmatchLink: {
    alignSelf: "flex-start",
    marginLeft: 32,
    paddingVertical: 2,
  },
  confirm: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    marginLeft: 32,
    padding: 14,
  },
  confirmButtons: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
  },
  confirmButton: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  thread: {
    flex: 1,
  },
  messages: {
    flexGrow: 1,
    gap: 8,
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  empty: {
    paddingBottom: 12,
    paddingHorizontal: 28,
  },
  bubbleRow: {
    flexDirection: "row",
    width: "100%",
  },
  bubbleSlot: {
    flexShrink: 1,
    maxWidth: "78%",
  },
  mineSlot: {
    marginLeft: "auto",
  },
  theirSlot: {
    marginRight: "auto",
  },
  bubble: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  liftedBubble: {
    maxWidth: "100%",
    width: "100%",
  },
  hiddenBubble: {
    opacity: 0,
  },
  mine: {
    borderBottomRightRadius: 6,
  },
  theirs: {
    borderBottomLeftRadius: 6,
  },
  editingBar: {
    alignItems: "center",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  focusLayer: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 20,
  },
  focusBubble: {
    position: "absolute",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 12,
  },
  menu: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    position: "absolute",
    width: 188,
  },
  menuNote: {
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  menuAction: {
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  menuDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  composer: {
    alignItems: "center",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  input: {
    borderRadius: 22,
    flex: 1,
    fontSize: 15,
    height: 44,
    paddingHorizontal: 16,
  },
  send: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
});
