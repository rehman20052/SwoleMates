import { ScrollView, StyleSheet, View } from "react-native";

import { AppText, Card, Pill, Screen } from "@/components/ui";
import { featureDirection, teamMembers, weeklyMeetings } from "@/data/project";
import { useAppTheme } from "@/theme";

export function TeamScreen() {
  const theme = useAppTheme();

  return (
    <Screen>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { padding: theme.spacing.lg }]}
      >
        <View style={styles.header}>
          <Pill tone="primary">Project hub</Pill>
          <AppText title>Base app and team branches are ready to split work.</AppText>
          <AppText muted>{featureDirection.supporting}</AppText>
        </View>

        <Card>
          <AppText style={styles.sectionTitle}>Team branches</AppText>
          {teamMembers.map((member) => (
            <View
              key={member.name}
              style={[
                styles.memberRow,
                {
                  backgroundColor: theme.colors.surfaceMuted,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View style={[styles.initial, { backgroundColor: theme.colors.primary }]}>
                <AppText style={{ color: theme.colors.primaryText, fontWeight: "800" }}>
                  {member.name.slice(0, 1)}
                </AppText>
              </View>
              <View style={styles.memberText}>
                <AppText style={{ fontWeight: "800" }}>{member.name}</AppText>
                <AppText small muted selectable>
                  {member.branch}
                </AppText>
                <AppText small muted>
                  {member.focus}
                </AppText>
              </View>
            </View>
          ))}
        </Card>

        <Card>
          <AppText style={styles.sectionTitle}>Weekly meetings</AppText>
          {weeklyMeetings.map((meeting) => (
            <AppText key={meeting} muted>
              {meeting}
            </AppText>
          ))}
        </Card>

        <Card>
          <AppText style={styles.sectionTitle}>Next build goals</AppText>
          <AppText muted>1. Finalize profile setup fields and preference filters.</AppText>
          <AppText muted>2. Replace mock partners with Supabase data.</AppText>
          <AppText muted>3. Add match request states: pending, accepted, declined.</AppText>
          <AppText muted>4. Add workout confirmation and reliability history.</AppText>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingBottom: 28,
  },
  header: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  memberRow: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  initial: {
    alignItems: "center",
    borderRadius: 14,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  memberText: {
    flex: 1,
    gap: 3,
  },
});
