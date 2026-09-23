import { Fragment, ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { icons } from "@/assets";
import { SessionCard } from "@/components/session-card";
import { AppText, Avatar, Divider, Icon, Screen, ScrollBody, TitleBar } from "@/components/ui";
import { getPartner } from "@/data/partners";
import { useNavigation } from "@/navigation";
import { Conversation, daysFromToday, useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";

export function InboxScreen({ empty }: { empty: ReactNode }) {
  const theme = useAppTheme();
  const nav = useNavigation();
  const { conversations, invites, workouts } = useAppData();
  const incoming = invites.filter((invite) => invite.direction === "incoming").length;
  const nextSession = workouts.find((workout) => workout.date >= daysFromToday(0));

  const invitesLink = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Partner invites, ${incoming} new`}
      onPress={() => nav.push({ name: "invites" })}
      style={[styles.invitesLink, { backgroundColor: theme.colors.surfaceRaised }]}
    >
      <AppText size={12} weight="bold">
        Invites
      </AppText>
      {incoming ? (
        <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
          <AppText size={10} weight="extrabold" color={theme.colors.primaryText}>
            {incoming}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );

  if (conversations.length === 0) {
    return (
      <Screen>
        <TitleBar title="Inbox" right={invitesLink} />
        {empty}
      </Screen>
    );
  }

  return (
    <Screen>
      <TitleBar title="Inbox" right={invitesLink} />
      <ScrollBody>
        {nextSession ? (
          <SessionCard workout={nextSession} label="Next Gym Session" onPress={() => nav.setTab("Plans")} />
        ) : null}

        <AppText weight="extrabold" upper>
          Recent Conversations
        </AppText>

        <View>
          {conversations.map((conversation, index) => (
            <Fragment key={conversation.partnerId}>
              {index > 0 ? <Divider /> : null}
              <ChatRow conversation={conversation} />
            </Fragment>
          ))}
        </View>
      </ScrollBody>
    </Screen>
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
  invitesLink: {
    alignItems: "center",
    borderRadius: 8,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
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
