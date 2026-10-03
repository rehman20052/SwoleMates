import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Keyboard, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type KeyboardEvent } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { icons } from "@/assets";
import { WorkoutPlanCard } from "@/components/workout-plan";
import { AppText, Avatar, Icon, IconButton, PrimaryButton, Screen } from "@/components/ui";
import { deleteMatchMessage, editMatchMessage, listConnections, listMessages, markChatRead, messageEditable, notifyChatAlerts, sendMatchMessage, unmatch, type MatchConnection, type MatchMessage } from "@/lib/matches";
import { clearCanceledWorkoutMessages, listMatchWorkouts, workoutPlanId, type PlannedWorkout } from "@/lib/workouts";
import { blockPerson, reportPerson, reportReasons } from "@/lib/safety";
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
  const [plans, setPlans] = useState<PlannedWorkout[]>([]);
  const [plansLoaded, setPlansLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [safety, setSafety] = useState<null | "menu" | "unmatch" | "block" | "report" | "reported">(null);
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [reasonsOpen, setReasonsOpen] = useState(false);
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
    if (!person || !plansLoaded) return;
    const newest = messages[messages.length - 1]?.createdAt;
    if (!newest) return;
    void markChatRead(person.requestId, newest);
  }, [person, messages, plansLoaded]);

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
    if (Platform.OS !== "web" || document.getElementById("thread-scroll-style")) return;
    const style = document.createElement("style");
    style.id = "thread-scroll-style";
    style.textContent = "#thread-scroll, #thread-scroll * { scrollbar-width: none; } #thread-scroll::-webkit-scrollbar, #thread-scroll *::-webkit-scrollbar { display: none; width: 0; height: 0; }";
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    if (!person || !me) return;
    let active = true;
    Promise.all([listMessages(person.requestId, me), listMatchWorkouts(person.requestId)])
      .then(async ([items, workouts]) => {
        if (!active) return;
        const cleaned = await clearCanceledWorkoutMessages(person.requestId, workouts);
        if (!active) return;
        setMessages(cleaned.changed ? await listMessages(person.requestId, me) : items);
        setPlans(cleaned.plans);
        setPlansLoaded(true);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load messages.");
      });
    return () => {
      active = false;
    };
  }, [person, me]);

  useEffect(() => {
    if (!person || !me) return;
    let active = true;
    const pull = () => {
      void Promise.all([listMessages(person.requestId, me), listMatchWorkouts(person.requestId)])
        .then(([items, workouts]) => {
          if (!active) return;
          setMessages((current) => {
            const same =
              current.length === items.length &&
              current.every((item, index) => item.id === items[index]?.id && item.body === items[index]?.body && item.editedAt === items[index]?.editedAt);
            return same ? current : items;
          });
          setPlans((current) => {
            const same =
              current.length === workouts.length &&
              current.every((plan, index) => {
                const next = workouts[index];
                return (
                  plan.id === next?.id &&
                  plan.status === next.status &&
                  plan.cancelledBy === next.cancelledBy &&
                  plan.acceptedBy.join() === next.acceptedBy.join() &&
                  plan.attendedBy.join() === next.attendedBy.join()
                );
              });
            return same ? current : workouts;
          });
        })
        .catch(() => undefined);
    };
    const timer = setInterval(pull, 2000);
    const channel = supabase
      .channel(`match-messages-${person.requestId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_messages", filter: `match_id=eq.${person.requestId}` }, pull)
      .on("postgres_changes", { event: "*", schema: "public", table: "planned_workout", filter: `match_id=eq.${person.requestId}` }, pull)
      .subscribe();
    return () => {
      active = false;
      clearInterval(timer);
      void supabase.removeChannel(channel);
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
    const [items, loadedPlans] = await Promise.all([listMessages(person.requestId, me), listMatchWorkouts(person.requestId)]);
    const cleaned = await clearCanceledWorkoutMessages(person.requestId, loadedPlans);
    setMessages(cleaned.changed ? await listMessages(person.requestId, me) : items);
    setPlans(cleaned.plans);
    setPlansLoaded(true);
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

  function closeSafety() {
    if (safetyBusy) return;
    setSafety(null);
    setReasonsOpen(false);
  }

  async function confirmUnmatch() {
    if (!person) return;
    setSafetyBusy(true);
    try {
      await unmatch(person.requestId);
      nav.back();
    } catch (err) {
      setSafetyBusy(false);
      setSafety(null);
      setError(err instanceof Error ? err.message : "Could not unmatch. Try again.");
    }
  }

  async function confirmBlock() {
    if (!person) return;
    setSafetyBusy(true);
    try {
      await blockPerson(person.userId);
      notifyChatAlerts();
      nav.back();
    } catch (err) {
      setSafetyBusy(false);
      setSafety(null);
      setError(err instanceof Error ? err.message : "Could not block that person.");
    }
  }

  async function submitReport() {
    if (!person || !reportReason) return;
    setSafetyBusy(true);
    try {
      await reportPerson(person.userId, reportReason, reportDetails);
      setSafetyBusy(false);
      setReasonsOpen(false);
      setSafety("reported");
    } catch (err) {
      setSafetyBusy(false);
      setError(err instanceof Error ? err.message : "Could not send that report.");
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
          {person ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Chat options" onPress={() => setSafety("menu")} hitSlop={8}>
              <Icon source={icons.moreHorizontal} size={22} tint={theme.colors.accent} />
            </Pressable>
          ) : null}
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
        {person ? (
          <PrimaryButton height={40} fontSize={14} onPress={() => nav.push({ name: "schedule", partnerId: person.userId })}>
            Schedule workout
          </PrimaryButton>
        ) : null}
      </View>

      <Animated.View style={[styles.thread, { paddingBottom: keyboardLift }]}>
        <ScrollView
          ref={scrollRef}
          nativeID="thread-scroll"
          style={{ flex: 1 }}
          contentContainerStyle={styles.messages}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: Platform.OS !== "web" })}
          onLayout={() => {
            if (Platform.OS === "web") scrollRef.current?.scrollToEnd({ animated: false });
          }}
        >
          {messages.length === 0 ? (
            <View style={styles.empty}>
              <AppText muted style={{ textAlign: "center", lineHeight: 20 }}>
                You're training partners. Say hello.
              </AppText>
            </View>
          ) : (
            messages.map((message) => {
              const planId = workoutPlanId(message.body);
              const plan = planId ? plans.find((item) => item.id === planId) : undefined;
              const otherPersonDeclined = plan?.status === "cancelled" && !!plan.cancelledBy && plan.cancelledBy !== plan.createdBy;
              if (planId && plansLoaded && !plan) return null;
              if (plan?.status === "cancelled" && !otherPersonDeclined) return null;
              if (plan && person) {
                return (
                  <WorkoutPlanCard
                    key={message.id}
                    plan={plan}
                    me={me}
                    partnerName={person.name.split(/\s+/)[0] || person.name}
                    onChange={() => void refreshMessages()}
                  />
                );
              }
              return (
                <Bubble
                  key={message.id}
                  message={message}
                  hidden={held?.id === message.id}
                  onHold={message.mine && !planId ? () => holdMessage(message) : undefined}
                  onBind={message.mine && !planId ? (node) => {
                    if (node) bubbleNodes.current.set(message.id, node);
                    else bubbleNodes.current.delete(message.id);
                  } : undefined}
                />
              );
            })
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
            onFocus={() => scrollRef.current?.scrollToEnd({ animated: Platform.OS !== "web" })}
            submitBehavior="submit"
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
            <Icon source={icons.arrowUp} size={16} tint={theme.colors.primaryText} />
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
      {person && safety ? (
        <Animated.View style={[styles.safetyLayer, safety === "menu" ? styles.menuLayer : { justifyContent: "flex-end", paddingBottom: keyboardLift }]}>
          <Pressable accessibilityLabel="Close safety options" style={StyleSheet.absoluteFill} onPress={closeSafety} />
          <View style={[styles.safetyCard, safety === "menu" && styles.menuCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            {safety === "menu" ? (
              <>
                <Pressable accessibilityRole="button" onPress={() => setSafety("unmatch")} style={styles.safetyAction}>
                  <AppText size={15} weight="semibold">Unmatch</AppText>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setSafety("report")} style={[styles.safetyAction, styles.safetyDivider, { borderTopColor: theme.colors.border }]}>
                  <AppText size={15} weight="semibold">Report</AppText>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setSafety("block")} style={[styles.safetyAction, styles.safetyDivider, { borderTopColor: theme.colors.border }]}>
                  <AppText size={15} weight="semibold" color={theme.colors.danger}>Block</AppText>
                </Pressable>
              </>
            ) : null}
            {safety === "unmatch" ? (
              <View style={styles.safetyCopy}>
                <AppText size={16} weight="extrabold">Unmatch {person.name}?</AppText>
                <AppText size={13} muted style={{ lineHeight: 18 }}>
                  Your chat is hidden. They can still show up in Discover, and the chat comes back only if you match again.
                </AppText>
                <View style={styles.safetyButtons}>
                  <Pressable accessibilityRole="button" onPress={closeSafety} disabled={safetyBusy} style={[styles.safetyButton, { backgroundColor: theme.colors.surfaceRaised }]}>
                    <AppText size={14} weight="semibold">Cancel</AppText>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => void confirmUnmatch()} disabled={safetyBusy} style={[styles.safetyButton, { backgroundColor: theme.colors.danger, opacity: safetyBusy ? 0.6 : 1 }]}>
                    <AppText size={14} weight="semibold" color="#FFFFFF">{safetyBusy ? "Unmatching…" : "Unmatch"}</AppText>
                  </Pressable>
                </View>
              </View>
            ) : null}
            {safety === "block" ? (
              <View style={styles.safetyCopy}>
                <AppText size={16} weight="extrabold">Block {person.name}?</AppText>
                <AppText size={13} muted style={{ lineHeight: 18 }}>
                  They disappear from Discover, chat, and matching. You can unblock them from the settings gear on Home.
                </AppText>
                <View style={styles.safetyButtons}>
                  <Pressable accessibilityRole="button" onPress={closeSafety} disabled={safetyBusy} style={[styles.safetyButton, { backgroundColor: theme.colors.surfaceRaised }]}>
                    <AppText size={14} weight="semibold">Cancel</AppText>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => void confirmBlock()} disabled={safetyBusy} style={[styles.safetyButton, { backgroundColor: theme.colors.danger, opacity: safetyBusy ? 0.6 : 1 }]}>
                    <AppText size={14} weight="semibold" color="#FFFFFF">{safetyBusy ? "Blocking…" : "Block"}</AppText>
                  </Pressable>
                </View>
              </View>
            ) : null}
            {safety === "report" ? (
              <View style={styles.safetyCopy}>
                <AppText size={16} weight="extrabold">Report {person.name}</AppText>
                <AppText size={12} muted>They won't be told you reported them.</AppText>
                <Pressable accessibilityRole="button" accessibilityLabel="Report reason" onPress={() => setReasonsOpen((open) => !open)} style={[styles.reasonPicker, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border }]}>
                  <AppText size={14} muted={!reportReason}>{reportReason || "Choose a reason"}</AppText>
                  <AppText muted>▾</AppText>
                </Pressable>
                {reasonsOpen ? (
                  <View style={[styles.reasonList, { borderColor: theme.colors.border }]}>
                    {reportReasons.map((reason) => (
                      <Pressable key={reason} accessibilityRole="button" onPress={() => { setReportReason(reason); setReasonsOpen(false); }} style={styles.reasonItem}>
                        <AppText size={14} weight={reportReason === reason ? "bold" : "medium"} primary={reportReason === reason}>{reason}</AppText>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <TextInput
                  value={reportDetails}
                  onChangeText={setReportDetails}
                  placeholder="Explain what happened"
                  placeholderTextColor={theme.colors.muted}
                  multiline
                  maxLength={500}
                  style={[styles.reportInput, { backgroundColor: theme.colors.surfaceRaised, color: theme.colors.text, fontFamily: theme.fonts.regular }]}
                />
                <View style={styles.safetyButtons}>
                  <Pressable accessibilityRole="button" onPress={closeSafety} disabled={safetyBusy} style={[styles.safetyButton, { backgroundColor: theme.colors.surfaceRaised }]}>
                    <AppText size={14} weight="semibold">Cancel</AppText>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => void submitReport()} disabled={safetyBusy || !reportReason} style={[styles.safetyButton, { backgroundColor: theme.colors.primary, opacity: safetyBusy || !reportReason ? 0.45 : 1 }]}>
                    <AppText size={14} weight="semibold" color={theme.colors.primaryText}>{safetyBusy ? "Sending…" : "Submit"}</AppText>
                  </Pressable>
                </View>
              </View>
            ) : null}
            {safety === "reported" ? (
              <View style={styles.safetyCopy}>
                <View style={styles.reportedHeader}>
                  <AppText size={16} weight="extrabold">Report sent</AppText>
                  <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={closeSafety}>
                    <AppText size={18} weight="bold" muted>✕</AppText>
                  </Pressable>
                </View>
                <AppText size={13} muted style={{ lineHeight: 18 }}>
                  You can unmatch {person.name}, block them, or leave the chat as it is.
                </AppText>
                <Pressable accessibilityRole="button" onPress={() => setSafety("unmatch")} style={styles.safetyAction}>
                  <AppText size={15} weight="semibold">Unmatch</AppText>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setSafety("block")} style={[styles.safetyAction, styles.safetyDivider, { borderTopColor: theme.colors.border }]}>
                  <AppText size={15} weight="semibold" color={theme.colors.danger}>Block</AppText>
                </Pressable>
              </View>
            ) : null}
          </View>
        </Animated.View>
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
    gap: 8,
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
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  safetyLayer: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 30,
  },
  menuLayer: {
    alignItems: "flex-end",
    paddingRight: 16,
    paddingTop: 58,
  },
  menuCard: {
    borderRadius: 14,
    marginBottom: 0,
    marginHorizontal: 0,
    width: 180,
  },
  safetyCard: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    marginHorizontal: 12,
    marginBottom: 12,
    overflow: "hidden",
  },
  safetyAction: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  safetyDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  safetyCopy: {
    gap: 10,
    padding: 16,
  },
  safetyButtons: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
  },
  safetyButton: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  reasonPicker: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  reasonList: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  reasonItem: {
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  reportInput: {
    borderRadius: 12,
    fontSize: 14,
    minHeight: 80,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
  },
  reportedHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
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
