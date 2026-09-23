import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";

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
import { useNavigation } from "@/navigation";
import { daysFromToday, formatDate, relativeDay, useAppData } from "@/state/app-data";

const timeSlots = ["6:00 AM", "7:00 AM", "8:00 AM", "12:00 PM", "5:30 PM", "6:00 PM", "6:30 PM", "7:00 PM", "8:00 PM"] as const;
const dateOptions = Array.from({ length: 14 }, (_, index) => daysFromToday(index + 1));

export function ScheduleWorkoutScreen({ partnerId: presetPartner }: { partnerId?: string }) {
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

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
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
