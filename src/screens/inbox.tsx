import { Fragment, ReactNode, useEffect, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { icons } from "@/assets";
import { AppText, Avatar, Divider, Icon, Screen, TitleBar } from "@/components/ui";
import { getPartner } from "@/data/partners";
import { useNavigation } from "@/navigation";
import { Conversation, Invite, useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";

// Invite tiles are compact. The pane shows two and a half, so the cut-off tile
// makes it obvious the list scrolls.
const INVITE_TILE_HEIGHT = 64;
const INVITE_GAP = 8;
const INVITE_PANE_PADDING = 8;
const INVITE_PANE_HEIGHT = INVITE_TILE_HEIGHT * 2.5 + INVITE_GAP * 2 + INVITE_PANE_PADDING;

// The Chat tab: a short scrolling pane of partner invites, then conversations fill the rest.
export function InboxScreen({ empty }: { empty: ReactNode }) {
  const theme = useAppTheme();
  const { conversations, invites } = useAppData();
  const invitePane = useRef<ScrollView>(null);
  const incoming = invites.filter((invite) => invite.direction === "incoming").length;
  // Incoming invites first (they need a decision), then ones you sent.
  const sortedInvites = [...invites].sort((a, b) => (a.direction === b.direction ? 0 : a.direction === "incoming" ? -1 : 1));

  // Briefly show the scroll bar so it's clear the invites pane scrolls.
  useEffect(() => {
    const timer = setTimeout(() => invitePane.current?.flashScrollIndicators(), 500);
    return () => clearTimeout(timer);
  }, []);

  if (conversations.length === 0 && invites.length === 0) {
    return (
      <Screen>
        <TitleBar title="Chat" />
        {empty}
      </Screen>
    );
  }

  return (
    <Screen>
      <TitleBar title="Chat" />

      {invites.length ? (
        <View style={styles.invites}>
          <View style={styles.sectionTitle}>
            <AppText weight="extrabold" upper>
              Partner Invites
            </AppText>
            {incoming ? (
              <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
                <AppText size={10} weight="extrabold" color={theme.colors.primaryText}>
                  {incoming}
                </AppText>
              </View>
            ) : null}
            {invites.length > 2 ? (
              <AppText size={11} muted style={{ marginLeft: "auto" }}>
                Scroll to see all {invites.length}
              </AppText>
            ) : null}
          </View>
          <ScrollView
            ref={invitePane}
            nestedScrollEnabled
            persistentScrollbar
            style={[styles.invitePane, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}
            contentContainerStyle={{ gap: INVITE_GAP, padding: INVITE_PANE_PADDING }}
          >
            {sortedInvites.map((invite) => (
              <InviteTile key={invite.partnerId} invite={invite} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <AppText weight="extrabold" upper style={styles.chatsTitle}>
        Chats
      </AppText>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.chats}>
        {conversations.length ? (
          conversations.map((conversation, index) => (
            <Fragment key={conversation.partnerId}>
              {index > 0 ? <Divider /> : null}
              <ChatRow conversation={conversation} />
            </Fragment>
          ))
        ) : (
          <AppText muted style={{ lineHeight: 20, paddingVertical: 16 }}>
            No chats yet. Accept a partner invite to start a conversation.
          </AppText>
        )}
      </ScrollView>
    </Screen>
  );
}

function InviteTile({ invite }: { invite: Invite }) {
  const theme = useAppTheme();
  const nav = useNavigation();
  const { respondToInvite, cancelInvite } = useAppData();
  const partner = getPartner(invite.partnerId);

  if (!partner) return null;

  const incoming = invite.direction === "incoming";

  return (
    <View style={[styles.tile, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${partner.name}'s profile`}
        onPress={() => nav.push({ name: "partner", id: partner.id })}
        style={styles.person}
      >
        <Avatar source={partner.avatar} size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText size={14} weight="extrabold" numberOfLines={1}>
            {partner.name}, {partner.age}
          </AppText>
          <AppText size={11} muted numberOfLines={1}>
            {incoming ? (
              <AppText size={11} weight="bold" primary>
                {partner.match}% Match
              </AppText>
            ) : (
              "Invite sent"
            )}
            {` • ${partner.gym}`}
          </AppText>
        </View>
      </Pressable>

      {incoming ? (
        <View style={styles.actions}>
          <SmallButton label="Decline" color={theme.colors.danger} onPress={() => respondToInvite(partner.id, false)} />
          <SmallButton label="Accept" primary onPress={() => respondToInvite(partner.id, true)} />
        </View>
      ) : (
        <SmallButton label="Cancel" onPress={() => cancelInvite(partner.id)} />
      )}
    </View>
  );
}

function SmallButton({ label, onPress, primary, color }: { label: string; onPress: () => void; primary?: boolean; color?: string }) {
  const theme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.smallButton,
        primary
          ? { backgroundColor: theme.colors.primary }
          : { borderColor: theme.colors.border, borderWidth: 1 },
        { opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <AppText size={12} weight="extrabold" color={primary ? theme.colors.primaryText : color ?? theme.colors.muted}>
        {label}
      </AppText>
    </Pressable>
  );
}

function ChatRow({ conversation }: { conversation: Conversation }) {
  const nav = useNavigation();
  const partner = getPartner(conversation.partnerId);
  const last = conversation.messages[conversation.messages.length - 1];

  if (!partner || !last) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Chat with ${partner.name}${conversation.unread ? ", unread" : ""}`}
      onPress={() => nav.push({ name: "chat", id: partner.id })}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Avatar source={partner.avatar} size={48} />
      <View style={styles.rowText}>
        <View style={styles.rowTop}>
          <AppText size={15} weight="extrabold" numberOfLines={1} style={{ flexShrink: 1 }}>
            {partner.name}
          </AppText>
          <AppText size={11} muted>
            {last.day === "Today" ? last.time : last.day}
          </AppText>
        </View>
        <AppText size={13} weight={conversation.unread ? "bold" : "regular"} muted={!conversation.unread} numberOfLines={1}>
          {last.from === "me" ? `You: ${last.text}` : last.text}
        </AppText>
      </View>
      {conversation.unread ? <Icon source={icons.unreadDot} size={8} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  invites: {
    gap: 10,
    paddingBottom: 8,
    paddingHorizontal: 24,
  },
  invitePane: {
    borderRadius: 16,
    borderWidth: 1,
    maxHeight: INVITE_PANE_HEIGHT,
  },
  sectionTitle: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tile: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    height: INVITE_TILE_HEIGHT,
    paddingHorizontal: 10,
  },
  person: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 8,
  },
  actions: {
    flexDirection: "row",
    gap: 6,
  },
  smallButton: {
    alignItems: "center",
    borderRadius: 8,
    height: 32,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  chatsTitle: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  chats: {
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingVertical: 14,
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  rowTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
});
