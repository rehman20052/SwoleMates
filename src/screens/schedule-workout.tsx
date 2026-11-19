import { useEffect, useMemo, useState } from "react";
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
  SecondaryButton,
  Screen,
  ScrollBody,
  SelectField,
  TitleBar,
} from "@/components/ui";
import { getPartner, gyms, WorkoutFocus, workoutFocuses } from "@/data/partners";
import { listConnections } from "@/lib/matches";
import { isAccountId } from "@/lib/discover";
import { loadProfile } from '@/lib/profile';
import { listPartnerRoutines, localRoutines, type PartnerRoutine } from '@/lib/partner-routines';
import { listMatchWorkouts, occupiedTimeLabels, proposeWorkout, upcomingTimeSlots, type PlannedWorkout } from "@/lib/workouts";
import { useNavigation } from "@/navigation";
import { daysFromToday, formatDate, relativeDay, useAppData } from "@/state/app-data";

const timeSlots = ["6:00 AM", "7:00 AM", "8:00 AM", "12:00 PM", "5:30 PM", "6:00 PM", "6:30 PM", "7:00 PM", "8:00 PM"] as const;
const dateOptions = Array.from({ length: 14 }, (_, index) => daysFromToday(index + 1));
const matchDateOptions = Array.from({ length: 14 }, (_, index) => daysFromToday(index));

export function ScheduleWorkoutScreen({ partnerId: presetPartner }: { partnerId?: string }) {
  if (presetPartner && isAccountId(presetPartner)) return <MatchSchedule partnerId={presetPartner} />;
  return <MockSchedule partnerId={presetPartner} />;
}

function MatchSchedule({ partnerId }: { partnerId: string }) {
  const nav = useNavigation();
  const { workspaceSettings, accountUserId } = useAppData();
  const [partnerName, setPartnerName] = useState("");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlannedWorkout[]>([]);
  const [myGym, setMyGym] = useState('');
  const [partnerGym, setPartnerGym] = useState('');
  const [place, setPlace] = useState('mine');
  const [otherPlace, setOtherPlace] = useState('');
  const location = place === 'mine' ? myGym : place === 'partner' ? partnerGym : otherPlace;
  const [partnerRoutines, setPartnerRoutines] = useState<PartnerRoutine[]>([]);
  const [routineError, setRoutineError] = useState('');
  const [routineId, setRoutineId] = useState('none');
  const [preview, setPreview] = useState(false);
  const routines = [...localRoutines(workspaceSettings, accountUserId ?? ''), ...partnerRoutines];
  const routineKey = (r: PartnerRoutine) => `${r.ownerId}:${r.id}`;
  const routine = routines.find(r => routineKey(r) === routineId);
  const [date, setDate] = useState(matchDateOptions[0]);
  const [now, setNow] = useState(() => new Date());
  const timeOptions = useMemo(() => {
    const taken = new Set(occupiedTimeLabels(plans, date));
    return upcomingTimeSlots(date, now).filter((slot) => !taken.has(slot));
  }, [date, now, plans]);
  const [time, setTime] = useState(() => upcomingTimeSlots(matchDateOptions[0])[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadProfile().then(profile => { if (active) { setMyGym(profile?.primaryGym ?? ''); if (!profile?.primaryGym) setPlace('other'); } }).catch(() => { if (active) setPlace('other'); });
    void listPartnerRoutines(partnerId).then(rows => { if (active) setPartnerRoutines(rows); }).catch(error => { if (active) setRoutineError(error.message); });
    return () => { active = false; };
  }, [partnerId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (timeOptions.length === 0 || timeOptions.includes(time)) return;
    setTime(timeOptions[0]);
  }, [time, timeOptions]);

  useEffect(() => {
    let active = true;
    void listConnections().then(async (connections) => {
      if (!active) return;
      const person = connections.find((item) => item.userId === partnerId && item.status === "accepted");
      if (!person) return;
      setPartnerName(person.name.split(/\s+/)[0] || person.name);
      setMatchId(person.requestId);
      setPartnerGym(person.gym || '');
      const workouts = await listMatchWorkouts(person.requestId).catch(() => []);
      if (!active) return;
      setPlans(workouts);
    });
    return () => {
      active = false;
    };
  }, [partnerId]);

  async function send() {
    if (busy || !matchId || !timeOptions.includes(time)) return;
    setBusy(true);
    setError(null);
    try {
      await proposeWorkout({ matchId, partnerName: partnerName || "them", date, timeLabel: time, location, routine: routine ?? null });
      nav.back();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Could not send that workout request.");
    }
  }

  return (
    <Screen>
      <TitleBar title="Schedule workout" onBack={nav.back} />
      <KeyboardAvoidingView enabled={Platform.OS !== "web"} style={{ flex: 1 }} behavior="padding">
        <ScrollBody>
          <Card gap={14}>
            <AppText size={13} muted>With {partnerName || 'your partner'}</AppText>
            <Field label="Where">
              <SelectField value={place} options={[...(myGym ? ['mine'] : []), ...(partnerGym ? ['partner'] : []), 'other']} onChange={setPlace} renderLabel={id => id === 'mine' ? `Your gym · ${myGym}` : id === 'partner' ? `${partnerName}'s gym · ${partnerGym}` : 'Other'} />
              {place === 'other' ? <Input accessibilityLabel="Workout location" placeholder="Gym or meeting place" value={otherPlace} onChangeText={setOtherPlace} maxLength={120} /> : null}
            </Field>
            <Field label="Routine · optional">
              <SelectField value={routineId} options={['none', ...routines.map(routineKey)]} onChange={id => { setRoutineId(id); setPreview(false); }} renderLabel={id => { const found = routines.find(r => routineKey(r) === id); return found ? `${found.ownerId === accountUserId ? 'You' : partnerName} · ${found.title}` : 'No routine'; }} />
              {routine ? <SecondaryButton height={40} onPress={() => setPreview(!preview)}>{preview ? 'Hide routine' : 'View routine'}</SecondaryButton> : null}
              {preview && routine ? <View style={{ gap: 12, paddingVertical: 8 }}>{routine.exercises.map((e, i) => <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><AppText style={{ flex: 1 }}>{e.name}</AppText><AppText muted>{e.sets} × {e.reps}</AppText></View>)}</View> : null}
              {routineError ? <View style={{ gap: 8 }}><AppText size={12} muted>{routineError}</AppText><SecondaryButton height={38} onPress={() => { setRoutineError(''); void listPartnerRoutines(partnerId).then(setPartnerRoutines).catch(error => setRoutineError(error.message)); }}>Retry partner routines</SecondaryButton></View> : null}
            </Field>
            <Field label="Date">
              <SelectField value={date} options={matchDateOptions} onChange={setDate} renderLabel={formatDate} />
            </Field>
            <Field label="Time">
              <SelectField
                value={time}
                options={timeOptions}
                onChange={setTime}
                menuMaxHeight={220}
                centerOn={timeOptions.includes("12:00 PM") ? "12:00 PM" : timeOptions[0]}
              />
            </Field>
          </Card>
          {error ? <AppText size={13} color="#FF3B30">{error}</AppText> : null}
          {timeOptions.length === 0 ? (
            <AppText muted>No open times that day. Pick another day, or a time at least 30 minutes from now.</AppText>
          ) : null}
          {!matchId ? <AppText muted>This chat is not an accepted match yet.</AppText> : null}
          <PrimaryButton disabled={busy || !matchId || !timeOptions.includes(time) || !location.trim()} onPress={() => void send()}>
            {busy ? "Sending..." : "Send invite"}
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

      <KeyboardAvoidingView enabled={Platform.OS !== "web"} style={{ flex: 1 }} behavior="padding">
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
