import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { icons } from "@/assets";
import { AppText, Avatar, Icon, IconButton, Screen } from "@/components/ui";
import { listConnections, listMessages, markChatRead, sendMatchMessage, type MatchConnection, type MatchMessage } from "@/lib/matches";
import { supabase } from "@/lib/supabase";
import { useNavigation } from "@/navigation";
import { useAppTheme } from "@/theme";

export function MatchChat({ userId }: { userId: string }) {
  const theme = useAppTheme();
  const nav = useNavigation();
  const scrollRef = useRef<ScrollView>(null);
  const [person, setPerson] = useState<MatchConnection | null>(null);
  const [me, setMe] = useState("");
  const [messages, setMessages] = useState<MatchMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

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

  async function send() {
    if (!person || !draft.trim()) return;
    const text = draft;
    setDraft("");
    try {
      await sendMatchMessage(person.requestId, text);
      const items = await listMessages(person.requestId, me);
      setMessages(items);
      setError(null);
    } catch (err) {
      setDraft(text);
      setError(err instanceof Error ? err.message : "Could not send that message.");
    }
  }

  return (
    <Screen>
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
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.length === 0 ? (
            <AppText muted style={{ textAlign: "center" }}>
              You're training partners. Say hello.
            </AppText>
          ) : (
            messages.map((message) => <Bubble key={message.id} message={message} />)
          )}
          {error ? (
            <AppText size={12} color={theme.colors.danger}>
              {error}
            </AppText>
          ) : null}
        </ScrollView>

        <View style={[styles.composer, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => void send()}
            placeholder="Message"
            placeholderTextColor={theme.colors.muted}
            selectionColor={theme.colors.primary}
            style={[styles.input, { backgroundColor: theme.colors.surfaceRaised, color: theme.colors.text, fontFamily: theme.fonts.regular }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            onPress={() => void send()}
            disabled={!draft.trim() || !person}
            style={[styles.send, { backgroundColor: theme.colors.primary, opacity: draft.trim() && person ? 1 : 0.45 }]}
          >
            <Icon source={icons.arrowUp} size={16} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Bubble({ message }: { message: MatchMessage }) {
  const theme = useAppTheme();
  const time = new Date(message.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return (
    <View style={[styles.bubbleRow, { justifyContent: message.mine ? "flex-end" : "flex-start" }]}>
      <View
        style={[
          styles.bubble,
          message.mine
            ? { backgroundColor: theme.colors.primaryDeep, borderColor: theme.colors.primary }
            : { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <AppText style={{ lineHeight: 21 }}>{message.body}</AppText>
        <AppText size={10} muted style={{ textAlign: "right" }}>
          {time}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBlock: {
    borderBottomWidth: 1,
    gap: 8,
    paddingBottom: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  identity: {
    flex: 1,
    gap: 2,
  },
  profileLink: {
    alignItems: "center",
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  messages: {
    flexGrow: 1,
    gap: 10,
    justifyContent: "flex-end",
    padding: 16,
  },
  bubbleRow: {
    flexDirection: "row",
  },
  bubble: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 4,
    maxWidth: "78%",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  composer: {
    alignItems: "center",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingBottom: 14,
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
