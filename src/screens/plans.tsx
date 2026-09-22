import { ScrollView, StyleSheet, View } from "react-native";

import { AppText, Card, Pill, PrimaryButton, Screen, SecondaryButton } from "@/components/ui";
import { partners, weeklyMeetings } from "@/data/project";
import { useAppTheme } from "@/theme";

const workoutSlots = [
  { time: "Tue 5:30", count: "2 matches", active: false },
  { time: "Thu 10:30", count: "Team work", active: true },
  { time: "Fri 7:00", count: "8 matches", active: false },
  { time: "Sat 11:00", count: "5 matches", active: false },
];

export function PlansScreen() {
  const theme = useAppTheme();
  const topPartner = partners[1];

  return (
    <Screen>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { padding: theme.spacing.lg }]}
      >
        <View style={styles.header}>
          <Pill tone="primary">Workout-session matching</Pill>
          <AppText title>Make matching lead to an actual workout.</AppText>
          <AppText muted>
            This screen turns a match request into a proposed time, gym, and workout focus.
          </AppText>
        </View>

        <View style={styles.slotGrid}>
          {workoutSlots.map((slot) => (
            <View
              key={slot.time}
              style={[
                styles.slot,
                {
                  backgroundColor: slot.active ? theme.colors.primary : theme.colors.surface,
                  borderColor: slot.active ? theme.colors.primary : theme.colors.border,
                },
              ]}
            >
              <AppText
                style={{
                  color: slot.active ? theme.colors.primaryText : theme.colors.text,
                  fontWeight: "800",
                }}
              >
                {slot.time}
              </AppText>
              <AppText
                small
                style={{ color: slot.active ? theme.colors.primaryText : theme.colors.muted }}
              >
                {slot.count}
              </AppText>
            </View>
          ))}
        </View>

        <Card>
          <View style={styles.rowBetween}>
            <View>
              <AppText style={styles.sectionTitle}>Suggested session</AppText>
              <AppText muted>Gold's Gym · Thursday · chest and triceps</AppText>
            </View>
            <Pill tone="teal">Open</Pill>
          </View>

          <View
            style={[
              styles.map,
              {
                backgroundColor: theme.colors.surfaceMuted,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View style={[styles.pin, styles.pinYou, { backgroundColor: theme.colors.primary }]}>
              <AppText small style={{ color: theme.colors.primaryText }}>
                You
              </AppText>
            </View>
            <View style={[styles.pin, styles.pinMate, { backgroundColor: theme.colors.teal }]}>
              <AppText small style={{ color: "#061412" }}>
                {topPartner.name}
              </AppText>
            </View>
          </View>

          <View style={styles.pillWrap}>
            <Pill>{topPartner.split}</Pill>
            <Pill tone="blue">{topPartner.availability}</Pill>
            <Pill tone="teal">Reliability {topPartner.reliability}</Pill>
          </View>

          <View style={styles.actions}>
            <SecondaryButton>Message first</SecondaryButton>
            <PrimaryButton>Plan workout</PrimaryButton>
          </View>
        </Card>

        <Card>
          <AppText style={styles.sectionTitle}>Team meeting rhythm</AppText>
          {weeklyMeetings.map((meeting) => (
            <AppText key={meeting} muted>
              {meeting}
            </AppText>
          ))}
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
  slotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  slot: {
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    gap: 4,
    padding: 14,
  },
  rowBetween: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  map: {
    borderRadius: 16,
    borderWidth: 1,
    height: 145,
    overflow: "hidden",
  },
  pin: {
    alignItems: "center",
    borderRadius: 999,
    justifyContent: "center",
    minHeight: 42,
    minWidth: 72,
    paddingHorizontal: 12,
    position: "absolute",
  },
  pinYou: {
    left: 24,
    top: 26,
  },
  pinMate: {
    bottom: 28,
    right: 24,
  },
  pillWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
});
