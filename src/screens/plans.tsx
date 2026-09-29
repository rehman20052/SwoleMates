import { ReactNode, useEffect, useState } from "react";
import { View } from "react-native";

import { SessionCard } from "@/components/session-card";
import { AppText, Screen, ScrollBody, TitleBar } from "@/components/ui";
import { listConnections } from "@/lib/matches";
import { listScheduledWorkouts, type PlannedWorkout } from "@/lib/workouts";
import { useNavigation } from "@/navigation";
import type { Workout } from "@/state/app-data";

export function PlansScreen({ empty }: { empty: ReactNode }) {
  const nav = useNavigation();
  const [plans, setPlans] = useState<PlannedWorkout[] | null>(null);
  const [partners, setPartners] = useState(new Map<string, string>());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([listScheduledWorkouts(), listConnections().catch(() => [])])
      .then(([workouts, connections]) => {
        if (!active) return;
        setPlans(workouts);
        setPartners(new Map(connections.map((person) => [person.requestId, person.userId])));
      })
      .catch((err: unknown) => {
        if (!active) return;
        setPlans([]);
        setError(err instanceof Error ? err.message : "Could not load workouts.");
      });
    return () => {
      active = false;
    };
  }, []);

  if (plans === null) {
    return (
      <Screen>
        <TitleBar title="Upcoming Workouts" />
        <ScrollBody>
          <AppText muted>Loading workouts...</AppText>
        </ScrollBody>
      </Screen>
    );
  }

  if (plans.length === 0) {
    return (
      <Screen>
        <TitleBar title="Upcoming Workouts" />
        <ScrollBody>
          {error ? <AppText size={13}>{error}</AppText> : null}
          {empty}
        </ScrollBody>
      </Screen>
    );
  }

  return (
    <Screen>
      <TitleBar title="Upcoming Workouts" />
      <ScrollBody>
        {error ? <AppText size={13}>{error}</AppText> : null}
        <View style={{ gap: 12 }}>
          {plans.map((plan, index) => {
            const workout: Workout = {
              id: plan.id,
              partnerId: partners.get(plan.matchId) ?? "",
              title: plan.title,
              gym: plan.location,
              date: plan.date,
              time: plan.time,
              focus: plan.focus === "Push" || plan.focus === "Pull" || plan.focus === "Legs" || plan.focus === "Upper" || plan.focus === "Full Body" || plan.focus === "Cardio" ? plan.focus : "Full Body",
              notes: "",
            };
            return (
              <SessionCard
                key={plan.id}
                workout={workout}
                label={index === 0 ? "Next Gym Session" : `${plan.focus} Session`}
                onPress={workout.partnerId ? () => nav.push({ name: "chat", id: workout.partnerId }) : undefined}
              />
            );
          })}
        </View>
      </ScrollBody>
    </Screen>
  );
}
