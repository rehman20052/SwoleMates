import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText, Avatar, Card, PrimaryButton, Screen, ScrollBody, Segmented, TitleBar } from "@/components/ui";
import { getPartner, Partner } from "@/data/partners";
import { useNavigation } from "@/navigation";
import { useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";

type Tab = "incoming" | "outgoing";

export function RequestsScreen() {
  const theme = useAppTheme();
  const nav = useNavigation();
  const { invites, respondToInvite, cancelInvite } = useAppData();
  const [tab, setTab] = useState<Tab>("incoming");
  const incomingCount = invites.filter((invite) => invite.direction === "incoming").length;
  const visible = invites
    .filter((invite) => invite.direction === tab)
    .map((invite) => getPartner(invite.partnerId))
    .filter((partner): partner is Partner => !!partner);

  return (
    <Screen>
      <TitleBar title="Partner Invites" onBack={nav.back} />

      <ScrollBody>
        <Segmented
          height={40}
          value={tab}
          onChange={setTab}
          badges={{ incoming: incomingCount }}
          options={[
            { value: "incoming", label: "Incoming" },
            { value: "outgoing", label: "Outgoing" },
          ]}
        />

        {visible.length === 0 ? (
          <AppText muted style={styles.empty}>
            {tab === "incoming"
              ? "No new invites right now. Keep swiping to get noticed."
              : "You haven't sent any invites. Tap the check on a Discover card to send one."}
          </AppText>
        ) : null}

        <View style={{ gap: 12 }}>
          {visible.map((partner) => (
            <Card key={partner.id} padding={16} gap={12}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`View ${partner.name}'s profile`}
                onPress={() => nav.push({ name: "partner", id: partner.id })}
                style={styles.person}
              >
                <Avatar source={partner.avatar} size={56} />
                <View style={styles.personText}>
                  <View style={styles.personTop}>
                    <AppText size={15} weight="extrabold">
                      {partner.name}, {partner.age}
                    </AppText>
                    <AppText size={12} weight="bold" primary>
                      {partner.match}% Match
                    </AppText>
                  </View>
                  <AppText size={12} muted>
                    {partner.gym}
                  </AppText>
                  <AppText size={12} weight="medium">
                    {partner.tags}
                  </AppText>
                </View>
              </Pressable>

              <View style={styles.actions}>
                {tab === "incoming" ? (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => respondToInvite(partner.id, false)}
                      style={[styles.decline, { borderColor: theme.colors.border }]}
                    >
                      <AppText size={13} weight="semibold" color={theme.colors.danger}>
                        Decline
                      </AppText>
                    </Pressable>
                    <PrimaryButton
                      height={36}
                      fontSize={13}
                      style={styles.accept}
                      onPress={() => respondToInvite(partner.id, true)}
                    >
                      Accept Invite
                    </PrimaryButton>
                  </>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => cancelInvite(partner.id)}
                    style={[styles.decline, { borderColor: theme.colors.border }]}
                  >
                    <AppText size={13} weight="semibold" muted>
                      Cancel Invite
                    </AppText>
                  </Pressable>
                )}
              </View>
            </Card>
          ))}
        </View>
      </ScrollBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    lineHeight: 20,
    paddingVertical: 24,
    textAlign: "center",
  },
  person: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  personText: {
    flex: 1,
    gap: 4,
  },
  personTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  decline: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    height: 36,
    justifyContent: "center",
  },
  accept: {
    borderRadius: 8,
    flex: 1,
  },
});
