import { FlatList, ListRenderItemInfo, StyleSheet, View } from "react-native";

import { AppText, Card, Pill, PrimaryButton, SecondaryButton } from "@/components/ui";
import { Partner, partners } from "@/data/project";
import { useAppTheme } from "@/theme";

export function MatchesScreen() {
  const theme = useAppTheme();

  return (
    <FlatList
      style={{ backgroundColor: theme.colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, { padding: theme.spacing.lg }]}
      data={partners}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.header}>
          <Pill tone="primary">Ranked recommendations</Pill>
          <AppText title>Compare possible gym partners before sending a request.</AppText>
          <AppText muted>
            The first version uses mock scores, but the app structure is ready for real profile and
            preference data later.
          </AppText>
        </View>
      }
      renderItem={renderPartner}
    />
  );
}

function renderPartner({ item }: ListRenderItemInfo<Partner>) {
  return <PartnerRow partner={item} />;
}

function PartnerRow({ partner }: { partner: Partner }) {
  const theme = useAppTheme();

  return (
    <Card>
      <View style={styles.rowTop}>
        <View style={styles.partnerIdentity}>
          <View style={[styles.avatar, { backgroundColor: theme.colors.primarySoft }]}>
            <AppText style={{ color: theme.colors.text, fontWeight: "800" }}>
              {partner.name.slice(0, 1)}
            </AppText>
          </View>
          <View>
            <AppText style={styles.partnerName}>
              {partner.name}, {partner.age}
            </AppText>
            <AppText small muted>
              {partner.gym} · {partner.distance}
            </AppText>
          </View>
        </View>
        <View style={[styles.score, { backgroundColor: theme.colors.primary }]}>
          <AppText style={{ color: theme.colors.primaryText, fontWeight: "800" }}>
            {partner.match}%
          </AppText>
        </View>
      </View>

      <View style={styles.pillWrap}>
        <Pill>{partner.experience}</Pill>
        <Pill tone="blue">{partner.availability}</Pill>
        <Pill tone="teal">Reliability {partner.reliability}</Pill>
      </View>

      <AppText muted>{partner.goal}</AppText>

      <View style={styles.reasonGrid}>
        {partner.interests.map((interest) => (
          <View
            key={interest}
            style={[
              styles.reason,
              {
                backgroundColor: theme.colors.surfaceMuted,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <AppText small>{interest}</AppText>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <SecondaryButton>View profile</SecondaryButton>
        <PrimaryButton>Request</PrimaryButton>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
    paddingBottom: 28,
  },
  header: {
    gap: 10,
  },
  rowTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  partnerIdentity: {
    alignItems: "center",
    flexDirection: "row",
    flex: 1,
    gap: 12,
  },
  avatar: {
    alignItems: "center",
    borderRadius: 16,
    height: 58,
    justifyContent: "center",
    width: 58,
  },
  partnerName: {
    fontSize: 17,
    fontWeight: "800",
  },
  score: {
    alignItems: "center",
    borderRadius: 12,
    minWidth: 58,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pillWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  reasonGrid: {
    gap: 8,
  },
  reason: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
});
