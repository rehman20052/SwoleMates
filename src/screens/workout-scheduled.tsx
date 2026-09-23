import { Alert, StyleSheet, View } from "react-native";

import { icons } from "@/assets";
import { AppText, Avatar, Card, Divider, FieldLabel, Icon, PrimaryButton, Screen, ScrollBody, SecondaryButton } from "@/components/ui";
import { getPartner } from "@/data/partners";
import { useNavigation } from "@/navigation";
import { relativeDay, useAppData } from "@/state/app-data";

export function WorkoutScheduledScreen({ workoutId }: { workoutId: string }) {
  const nav = useNavigation();
  const { workouts } = useAppData();
  const workout = workouts.find((entry) => entry.id === workoutId);
  const partner = workout ? getPartner(workout.partnerId) : undefined;

  if (!workout || !partner) {
    return null;
  }

  return (
    <Screen>
      <ScrollBody contentContainerStyle={styles.content}>
        <Icon source={icons.successCheck} size={100} />

        <View style={styles.copy}>
          <AppText size={24} weight="black" style={styles.center}>
            Workout Scheduled!
          </AppText>
          <AppText muted style={[styles.center, { lineHeight: 20 }]}>
            Your invitation has been confirmed. Get ready to crush those goals together!
          </AppText>
        </View>

        <Card style={{ alignSelf: "stretch" }}>
          <View style={{ gap: 6 }}>
            <FieldLabel size={11}>Lifting Partner</FieldLabel>
            <View style={styles.partner}>
              <Avatar source={partner.avatar} size={28} />
              <AppText size={15} weight="extrabold">
                {partner.name}
              </AppText>
            </View>
          </View>
          <Divider />
          <View style={{ gap: 6 }}>
            <FieldLabel size={11}>Scheduled Session</FieldLabel>
            <AppText size={15} weight="extrabold" primary>
              {workout.title}
            </AppText>
            <AppText size={13}>
              {relativeDay(workout.date)} at {workout.time}
            </AppText>
            <AppText size={12} muted>
              {workout.gym}
            </AppText>
          </View>
        </Card>

        <View style={styles.actions}>
          <PrimaryButton
            onPress={() =>
              Alert.alert("Calendar sync isn't connected yet", "This session is saved under Plans in the meantime.", [
                { text: "View Plans", onPress: () => nav.setTab("Plans") },
                { text: "OK" },
              ])
            }
          >
            Add to Calendar
          </PrimaryButton>
          <SecondaryButton onPress={() => nav.replace({ name: "chat", id: partner.id })}>Go to Inbox Chat</SecondaryButton>
        </View>
      </ScrollBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: "center",
    flexGrow: 1,
    gap: 32,
    justifyContent: "center",
    padding: 24,
  },
  copy: {
    alignSelf: "stretch",
    gap: 12,
  },
  center: {
    textAlign: "center",
  },
  partner: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  actions: {
    alignSelf: "stretch",
    gap: 12,
  },
});
