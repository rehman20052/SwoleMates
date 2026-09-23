import { ReactNode } from "react";
import { View } from "react-native";

import { SessionCard } from "@/components/session-card";
import { PrimaryButton, Screen, ScrollBody, TitleBar } from "@/components/ui";
import { useNavigation } from "@/navigation";
import { daysFromToday, useAppData } from "@/state/app-data";

export function PlansScreen({ empty }: { empty: ReactNode }) {
  const nav = useNavigation();
  const { workouts } = useAppData();
  const upcoming = workouts.filter((workout) => workout.date >= daysFromToday(0));

  if (upcoming.length === 0) {
    return empty;
  }

  return (
    <Screen>
      <TitleBar title="Upcoming Workouts" />
      <ScrollBody>
        <View style={{ gap: 12 }}>
          {upcoming.map((workout, index) => (
            <SessionCard
              key={workout.id}
              workout={workout}
              label={index === 0 ? "Next Gym Session" : `${workout.focus} Session`}
              onPress={() => nav.push({ name: "chat", id: workout.partnerId })}
            />
          ))}
        </View>
        <PrimaryButton onPress={() => nav.push({ name: "schedule" })}>Propose a New Session</PrimaryButton>
      </ScrollBody>
    </Screen>
  );
}
