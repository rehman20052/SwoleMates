import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText, PrimaryButton, SecondaryButton } from "@/components/ui";
import { acceptWindowClosed, cancelWorkoutRequest, respondToWorkout, type PlannedWorkout } from "@/lib/workouts";
import { formatDate } from "@/state/app-data";
import { useAppTheme } from "@/theme";
import { SharedWorkoutSession } from "./shared-workout-session";

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
  const [now, setNow] = useState(() => new Date());
  const accepted = plan.acceptedBy.includes(me);
  const expired = acceptWindowClosed({ status: plan.status, date: plan.date, startTime: plan.time }, now);
  const waiting = plan.status === "proposed" && !expired;

  useEffect(() => {
    if (plan.status !== "proposed") return;
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, [plan.status]);

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

  const statusLine = expired
    ? "Expired. Send a new request."
    : plan.status === "completed"
      ? "Completed"
      : plan.status === "scheduled"
        ? "Scheduled. Check in from Home after it starts."
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
      <SharedWorkoutSession plan={plan} me={me} />
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
      {(waiting || expired) && accepted ? (
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
