import { ScrollView, StyleSheet, View } from "react-native";

import { AppText, Card, Pill, PrimaryButton, Screen, SecondaryButton } from "@/components/ui";
import { featureDirection, matchingFactors, partners, prototypeDirection } from "@/data/project";
import { useAppTheme } from "@/theme";

export function DiscoverScreen() {
  const theme = useAppTheme();
  const partner = partners[0];

  return (
    <Screen>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { padding: theme.spacing.lg }]}
      >
        <View style={styles.hero}>
          <Pill tone="primary">MVP focus</Pill>
          <AppText title>SwoleMates helps lifters find compatible gym partners.</AppText>
          <AppText muted>{featureDirection.problem}</AppText>
        </View>

        <Card style={{ gap: theme.spacing.md }}>
          <View
            style={[
              styles.profileArt,
              {
                backgroundColor: theme.colors.surfaceMuted,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View style={[styles.artCircle, { backgroundColor: theme.colors.primary }]} />
            <View style={[styles.artPlate, { backgroundColor: theme.colors.teal }]} />
            <View style={[styles.artBar, { backgroundColor: theme.colors.text }]} />
          </View>

          <View style={styles.rowBetween}>
            <View>
              <AppText title>
                {partner.name}, {partner.age}
              </AppText>
              <AppText muted>
                {partner.gym} · {partner.distance}
              </AppText>
            </View>
            <View style={[styles.matchBadge, { backgroundColor: theme.colors.primary }]}>
              <AppText style={{ color: theme.colors.primaryText, fontWeight: "800" }}>
                {partner.match}%
              </AppText>
              <AppText small style={{ color: theme.colors.primaryText }}>
                match
              </AppText>
            </View>
          </View>

          <View style={styles.pillWrap}>
            <Pill>{partner.experience}</Pill>
            <Pill tone="teal">{partner.split}</Pill>
            <Pill tone="blue">{partner.availability}</Pill>
          </View>

          <View style={styles.metrics}>
            <Metric label="Bench" value={partner.lifts.bench} />
            <Metric label="Squat" value={partner.lifts.squat} />
            <Metric label="Deadlift" value={partner.lifts.deadlift} />
          </View>

          <AppText>{partner.goal}</AppText>

          <View style={styles.actions}>
            <SecondaryButton>Skip</SecondaryButton>
            <PrimaryButton>Send match request</PrimaryButton>
          </View>
        </Card>

        <Card>
          <AppText style={styles.sectionTitle}>Matching compares</AppText>
          <View style={styles.pillWrap}>
            {matchingFactors.map((factor) => (
              <Pill key={factor}>{factor}</Pill>
            ))}
          </View>
        </Card>

        <Card>
          <AppText style={styles.sectionTitle}>Prototype direction</AppText>
          {prototypeDirection.map((item) => (
            <AppText key={item} muted>
              {item}
            </AppText>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.metric,
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <AppText style={{ fontWeight: "800" }}>{value}</AppText>
      <AppText small muted>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingBottom: 28,
  },
  hero: {
    gap: 10,
  },
  profileArt: {
    borderRadius: 16,
    borderWidth: 1,
    height: 210,
    overflow: "hidden",
  },
  artCircle: {
    borderRadius: 999,
    height: 150,
    position: "absolute",
    right: -28,
    top: -24,
    width: 150,
  },
  artPlate: {
    borderRadius: 999,
    bottom: 34,
    height: 86,
    left: 34,
    position: "absolute",
    width: 86,
  },
  artBar: {
    bottom: 75,
    height: 12,
    left: 44,
    position: "absolute",
    transform: [{ rotate: "-14deg" }],
    width: 220,
  },
  rowBetween: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  matchBadge: {
    alignItems: "center",
    borderRadius: 14,
    minWidth: 70,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pillWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metrics: {
    flexDirection: "row",
    gap: 10,
  },
  metric: {
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    padding: 12,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
});
