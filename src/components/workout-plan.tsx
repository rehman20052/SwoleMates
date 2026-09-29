import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText, PrimaryButton, SecondaryButton } from "@/components/ui";
import { cancelWorkoutRequest, respondToWorkout, type PlannedWorkout } from "@/lib/workouts";
import { formatDate } from "@/state/app-data";
import { useAppTheme } from "@/theme";

export function WorkoutPlanCard({
  plan,
  me,
  partnerName,
  onChange,
}: {
  plan: PlannedWorkout;
  me: string;
  partnerName: string;
  onChange: () => void;
}) {
  const theme = useAppTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"accept" | "decline" | null>(null);
  const accepted = plan.acceptedBy.includes(me);
  const waiting = plan.status === "proposed";
  const scheduled = plan.status === "scheduled" || plan.status === "completed";

  async function cancel() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await cancelWorkoutRequest(plan);
      onChange();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Could not cancel that workout.");
    }
  }

  async function respond(accept: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await respondToWorkout(plan, accept);
      onChange();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Could not update that workout.");
    }
  }

  const statusLine = scheduled
    ? "Scheduled"
    : plan.status === "cancelled"
      ? "Canceled"
      : accepted
        ? `Waiting for ${partnerName} to accept`
        : `${partnerName} proposed this. Accept to schedule it.`;

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <AppText size={12} weight="extrabold" primary upper>
        Workout request
      </AppText>
      <AppText size={16} weight="extrabold">
        {plan.focus}
      </AppText>
      <AppText size={13}>
        {formatDate(plan.date)}
        {plan.time ? ` at ${plan.time}` : ""}
      </AppText>
      <AppText size={13} muted>
        {statusLine}
      </AppText>
      {error ? (
        <AppText size={12} color={theme.colors.danger}>
          {error}
        </AppText>
      ) : null}
      {waiting && !accepted && confirm === null ? (
        <View style={styles.actions}>
          <SecondaryButton style={styles.action} height={40} fontSize={13} disabled={busy} onPress={() => setConfirm("decline")}>
            Decline
          </SecondaryButton>
          <PrimaryButton style={styles.action} height={40} fontSize={13} disabled={busy} onPress={() => setConfirm("accept")}>
            Accept
          </PrimaryButton>
        </View>
      ) : null}
      {waiting && !accepted && confirm ? (
        <View style={styles.confirm}>
          <AppText size={13} weight="bold">
            {confirm === "accept" ? "Are you sure you want to accept?" : "Are you sure you'd like to decline?"}
          </AppText>
          <View style={styles.actions}>
            <SecondaryButton style={styles.action} height={40} fontSize={13} disabled={busy} onPress={() => setConfirm(null)}>
              Back
            </SecondaryButton>
            {confirm === "accept" ? (
              <PrimaryButton style={styles.action} height={40} fontSize={13} disabled={busy} onPress={() => void respond(true)}>
                Accept
              </PrimaryButton>
            ) : (
              <SecondaryButton
                style={[styles.action, { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger }]}
                textColor="#FFFFFF"
                height={40}
                fontSize={13}
                disabled={busy}
                onPress={() => void respond(false)}
              >
                Decline
              </SecondaryButton>
            )}
          </View>
        </View>
      ) : null}
      {waiting && accepted ? (
        <SecondaryButton height={40} fontSize={13} disabled={busy} onPress={() => void cancel()}>
          Cancel request
        </SecondaryButton>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "stretch",
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    padding: 14,
  },
  confirm: {
    gap: 8,
    marginTop: 4,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  action: {
    flex: 1,
  },
});
