import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, StyleSheet, View } from "react-native";

import { icons } from "@/assets";
import {
  AppText,
  Avatar,
  Card,
  Chip,
  Field,
  Input,
  PrimaryButton,
  Screen,
  ScrollBody,
  SelectField,
  TitleBar,
} from "@/components/ui";
import { getPartner, gyms, WorkoutFocus, workoutFocuses } from "@/data/partners";
import { listConnections } from "@/lib/matches";
import { isAccountId } from "@/lib/discover";
import { proposeWorkout, workoutTimeSlots } from "@/lib/workouts";
import { useNavigation } from "@/navigation";
import { daysFromToday, formatDate, relativeDay, useAppData } from "@/state/app-data";

const timeSlots = ["6:00 AM", "7:00 AM", "8:00 AM", "12:00 PM", "5:30 PM", "6:00 PM", "6:30 PM", "7:00 PM", "8:00 PM"] as const;
const dateOptions = Array.from({ length: 14 }, (_, index) => daysFromToday(index + 1));
const matchDateOptions = Array.from({ length: 14 }, (_, index) => daysFromToday(index));
const workoutTypeOptions = [...workoutFocuses, "Other"] as const;

export function ScheduleWorkoutScreen({ partnerId: presetPartner }: { partnerId?: string }) {
  if (presetPartner && isAccountId(presetPartner)) return <MatchSchedule partnerId={presetPartner} />;
  return <MockSchedule partnerId={presetPartner} />;
}

function MatchSchedule({ partnerId }: { partnerId: string }) {
  const nav = useNavigation();
  const [partnerName, setPartnerName] = useState("");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [location, setLocation] = useState("Gym");
  const [type, setType] = useState<(typeof workoutTypeOptions)[number]>("Push");
  const [customType, setCustomType] = useState("");
  const [date, setDate] = useState(matchDateOptions[0]);
  const [time, setTime] = useState("6:30 PM");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listConnections().then((connections) => {
      if (!active) return;
      const person = connections.find((item) => item.userId === partnerId && item.status === "accepted");
      if (!person) return;
      setPartnerName(person.name.split(/\s+/)[0] || person.name);
      setMatchId(person.requestId);
      if (person.gym) setLocation(person.gym);
    });
    return () => {
      active = false;
    };
  }, [partnerId]);

  async function send() {
    if (busy || !matchId) return;
    const focus = type === "Other" ? customType : type;
    setBusy(true);
    setError(null);
    try {
      await proposeWorkout({ matchId, partnerName: partnerName || "them", focus, date, timeLabel: time, location });
      nav.back();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Could not send that workout request.");
    }
  }

  return (
    <Screen>
      <TitleBar title="Schedule workout" onBack={nav.back} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollBody>
          <Card gap={14}>
            <Field label="Workout type">
              <SelectField value={type} options={workoutTypeOptions} onChange={setType} />
            </Field>
            {type === "Other" ? (
              <Field label="Your workout">
                <Input placeholder="Yoga, arms, or whatever you train" value={customType} onChangeText={setCustomType} />
              </Field>
            ) : null}
            <Field label="Date">
              <SelectField value={date} options={matchDateOptions} onChange={setDate} renderLabel={formatDate} />
            </Field>
            <Field label="Time">
              <SelectField value={time} options={workoutTimeSlots} onChange={setTime} menuMaxHeight={220} centerOn="12:00 PM" />
            </Field>
          </Card>
          {error ? <AppText size={13} color="#FF3B30">{error}</AppText> : null}
          {!matchId ? <AppText muted>This chat is not an accepted match yet.</AppText> : null}
          <PrimaryButton disabled={busy || !matchId} onPress={() => void send()}>
            {busy ? "Sending..." : "Send request"}
          </PrimaryButton>
        </ScrollBody>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function MockSchedule({ partnerId: presetPartner }: { partnerId?: string }) {
  const nav = useNavigation();
  const { conversations, scheduleWorkout, sendMessage } = useAppData();
  const withPartner = !!presetPartner;

  const partnerIds = useMemo(() => {
    const ids = conversations.map((c) => c.partnerId);
    return presetPartner && !ids.includes(presetPartner) ? [presetPartner, ...ids] : ids;
  }, [conversations, presetPartner]);

  const initialPartner = getPartner(presetPartner ?? partnerIds[0] ?? "");
  const [partnerId, setPartnerId] = useState(initialPartner?.id ?? "");
  const [gym, setGym] = useState<string>(initialPartner?.gym ?? gyms[0]);
  const [date, setDate] = useState(dateOptions[0]);
  const [time, setTime] = useState<(typeof timeSlots)[number]>("6:30 PM");
  const [focus, setFocus] = useState<WorkoutFocus>("Legs");
  const [notes, setNotes] = useState("");
  const gymOptions = useMemo(() => Array.from(new Set([gym, ...gyms])), [gym]);

  if (!initialPartner) {
    return (
      <Screen>
        <TitleBar title="Schedule Workout" onBack={nav.back} />
        <ScrollBody>
          <AppText muted style={{ lineHeight: 20 }}>
            Workouts are planned with a SwoleMate. Accept an invite or start a conversation, then come back to lock
            in a session.
          </AppText>
          <PrimaryButton onPress={() => nav.setTab("Discover")}>Find a Partner</PrimaryButton>
        </ScrollBody>
      </Screen>
    );
  }

  function handleConfirm() {
    const workout = scheduleWorkout({ partnerId, gym, date, time, focus, notes: notes.trim() });
    sendMessage(partnerId, `Sent a workout invite: ${focus} at ${gym}, ${relativeDay(date)} at ${time}.`);
    nav.replace({ name: "scheduled", workoutId: workout.id });
  }

  return (
    <Screen>
      <TitleBar
        title="Schedule Workout"
        onBack={nav.back}
        right={
          withPartner ? (
            <AppText weight="semibold" primary>
              With Partner
            </AppText>
          ) : null
        }
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollBody>
          <Card gap={14}>
            <Field label="SwoleMate Partner">
              <SelectField
                value={partnerId}
                options={partnerIds}
                onChange={setPartnerId}
                renderLabel={(id) => getPartner(id)?.name ?? id}
                leading={(id) => {
                  const partner = getPartner(id);
                  return partner ? <Avatar source={partner.avatar} size={24} /> : null;
                }}
              />
            </Field>

            <Field label={withPartner ? "Select Gym Location" : "Select Gym"}>
              <SelectField value={gym} options={gymOptions} onChange={setGym} />
            </Field>

            <View style={styles.row}>
              <Field label="Date" style={styles.flex}>
                <SelectField value={date} options={dateOptions} onChange={setDate} renderLabel={formatDate} icon={icons.calendarMuted} />
              </Field>
              <Field label="Time" style={styles.flex}>
                <SelectField value={time} options={timeSlots} onChange={setTime} icon={icons.clock} />
              </Field>
            </View>

            <Field label="Workout Focus">
              <View style={styles.wrap}>
                {workoutFocuses.map((option) => (
                  <Chip key={option} shape="tag" label={option} selected={option === focus} onPress={() => setFocus(option)} />
                ))}
              </View>
            </Field>

            <Field label="Co-workout Notes">
              <Input
                multiline
                placeholder="Let's try to hit a new squat 1RM together! Bring your knee sleeves."
                value={notes}
                onChangeText={setNotes}
              />
            </Field>
          </Card>

          <PrimaryButton onPress={handleConfirm}>{withPartner ? "Confirm Workout Invitation" : "Confirm Workout"}</PrimaryButton>
        </ScrollBody>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
  },
  flex: {
    flex: 1,
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
});
