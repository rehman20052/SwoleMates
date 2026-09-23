import { Fragment, useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { icons } from "@/assets";
import { AppText, Avatar, Icon, IconButton, PrimaryButton, Screen } from "@/components/ui";
import { firstName, getPartner, Partner } from "@/data/partners";
import { useNavigation } from "@/navigation";
import { confirmSafetyAction } from "@/screens/partner-profile";
import { daysFromToday, Message, relativeDay, useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";

export function ChatScreen({ id }: { id: string }) {
  const { blocked } = useAppData();
  const partner = getPartner(id);
  return partner && !blocked.includes(partner.id) ? <Conversation partner={partner} /> : null;
}

function Conversation({ partner }: { partner: Partner }) {
  const theme = useAppTheme();
  const nav = useNavigation();
  const { conversations, workouts, sendMessage, markRead, block, swipe } = useAppData();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const messages = conversations.find((c) => c.partnerId === partner.id)?.messages ?? [];
  const nextSession = workouts.find((w) => w.partnerId === partner.id && w.date >= daysFromToday(0));
  const name = firstName(partner);

  useEffect(() => {
    markRead(partner.id);
    // Only mark read when the conversation opens or a new message lands.
  }, [partner.id, messages.length]);

  function handleSend() {
    sendMessage(partner.id, draft);
    setDraft("");
  }

  function scheduleWorkout() {
    nav.push({ name: "schedule", partnerId: partner.id });
  }

  function handleBlock() {
    confirmSafetyAction(partner, "block", () => {
      block(partner.id);
      nav.back();
    });
  }

  function handleReport() {
    confirmSafetyAction(partner, "report", () =>
      Alert.alert("Report submitted", "Thanks for helping keep SwoleMates safe."),
    );
  }

  function handleHide() {
    swipe(partner.id, false);
    Alert.alert("Profile hidden", `${name} won't appear in your Discover deck anymore.`);
  }

  return (
    <Screen>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <View style={styles.identity}>
          <IconButton source={icons.arrowLeft} label="Back" onPress={nav.back} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View ${partner.name}'s profile`}
            onPress={() => nav.push({ name: "partner", id: partner.id })}
            style={styles.identityTap}
          >
            <Avatar source={partner.avatar} size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText size={15} weight="extrabold" numberOfLines={1}>
                {partner.name}
              </AppText>
              <AppText size={11} primary numberOfLines={1}>
                Active {partner.distance}mi away
              </AppText>
            </View>
          </Pressable>
        </View>
        <View style={styles.safety}>
          <SafetyButton label="Report" color={theme.colors.danger} onPress={handleReport} />
          <SafetyButton label="Block" onPress={handleBlock} />
          <SafetyButton label="Hide Profile" onPress={handleHide} />
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          <View style={[styles.cta, { backgroundColor: theme.colors.primaryDeep, borderColor: theme.colors.primary }]}>
            <View style={styles.ctaTop}>
              <AppText size={13} weight="extrabold" primary upper>
                Ready to lift?
              </AppText>
              {nextSession ? (
                <AppText size={11}>
                  {relativeDay(nextSession.date)} {nextSession.time}
                </AppText>
              ) : null}
            </View>
            <AppText style={{ lineHeight: 20 }}>Co-schedule a session directly with {name}.</AppText>
            <PrimaryButton height={36} fontSize={13} style={{ borderRadius: 8 }} onPress={scheduleWorkout}>
              Schedule Workout
            </PrimaryButton>
          </View>

          {messages.map((message, index) => (
            <Fragment key={message.id}>
              {index === 0 || messages[index - 1].day !== message.day ? (
                <AppText size={11} weight="semibold" muted upper style={{ textAlign: "center" }}>
                  {message.day}
                </AppText>
              ) : null}
              <Bubble message={message} partner={partner} />
            </Fragment>
          ))}
        </ScrollView>

        <View
          style={[
            styles.composer,
            {
              backgroundColor: theme.colors.surface,
              borderTopColor: theme.colors.border,
              paddingBottom: 12,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Schedule a workout"
            onPress={scheduleWorkout}
            style={[styles.roundButton, { backgroundColor: theme.colors.surfaceRaised }]}
          >
            <Icon source={icons.plusWhite} size={16} />
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            placeholder="Type your workout plan..."
            placeholderTextColor={theme.colors.muted}
            selectionColor={theme.colors.primary}
            style={[
              styles.input,
              { backgroundColor: theme.colors.surfaceRaised, color: theme.colors.text, fontFamily: theme.fonts.regular },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            onPress={handleSend}
            disabled={!draft.trim()}
            style={[styles.roundButton, { backgroundColor: theme.colors.primary, opacity: draft.trim() ? 1 : 0.5 }]}
          >
            <Icon source={icons.arrowUp} size={16} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function SafetyButton({ label, color, onPress }: { label: string; color?: string; onPress: () => void }) {
  const theme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.safetyButton, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border }]}
    >
      <AppText size={12} weight="bold" color={color ?? theme.colors.muted}>
        {label}
      </AppText>
    </Pressable>
  );
}

function Bubble({ message, partner }: { message: Message; partner: Partner }) {
  const theme = useAppTheme();
  const mine = message.from === "me";

  const bubble = (
    <View
      style={[
        styles.bubble,
        mine
          ? { backgroundColor: theme.colors.primaryDeep, borderColor: theme.colors.primary, borderBottomRightRadius: 4 }
          : { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderBottomLeftRadius: 4 },
      ]}
    >
      <AppText style={{ lineHeight: 20 }}>{message.text}</AppText>
      <AppText size={9} muted style={{ textAlign: "right" }}>
        {message.time}
      </AppText>
    </View>
  );

  if (mine) {
    return <View style={styles.mine}>{bubble}</View>;
  }

  return (
    <View style={styles.theirs}>
      <Avatar source={partner.avatar} size={28} />
      {bubble}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: 1,
    gap: 10,
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  identity: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  identityTap: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
  },
  safety: {
    flexDirection: "row",
    gap: 8,
  },
  safetyButton: {
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  messages: {
    gap: 16,
    padding: 16,
  },
  cta: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  ctaTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  theirs: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 8,
  },
  mine: {
    alignItems: "flex-end",
  },
  bubble: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    maxWidth: 280,
    padding: 12,
  },
  composer: {
    alignItems: "center",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  roundButton: {
    alignItems: "center",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  input: {
    borderRadius: 20,
    flex: 1,
    fontSize: 14,
    height: 40,
    paddingHorizontal: 14,
  },
});
