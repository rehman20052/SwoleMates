import { ReactNode, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";

import {
  AppText,
  Card,
  Input,
  PrimaryButton,
  ProgressBar,
  Screen,
  ScrollBody,
  SecondaryButton,
  SectionLabel,
  TitleBar,
} from "@/components/ui";
import { getPartner } from "@/data/partners";
import { type UserProfile } from "@/lib/profile";
import { useNavigation } from "@/navigation";
import {
  daysFromToday,
  formatShortDate,
  relativeDay,
  type NutritionTotals,
  type SessionLog,
  useAppData,
} from "@/state/app-data";
import { useAppTheme } from "@/theme";

type DashboardProfile = Pick<
  UserProfile,
  "fullName" | "primaryGym" | "squat" | "bench" | "deadlift" | "customLiftName" | "customLift"
>;
type MacroField = "calories" | "protein" | "carbs" | "fats";

const WEEKLY_WORKOUT_GOAL = 3;
const weekdayLabels = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const macroGoals: Record<MacroField, keyof NutritionTotals> = {
  calories: "calorieGoal",
  protein: "proteinGoal",
  carbs: "carbGoal",
  fats: "fatGoal",
};

function parseWeight(value: string) {
  const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseNumber(value: string) {
  const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "Lifter";
}

function parseIsoDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return copy;
}

function addDays(date: Date, amount: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function addMonths(date: Date, amount: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + amount);
  return new Date(copy.getFullYear(), copy.getMonth(), 1);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthTitle(date: Date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function calendarDayTitle(iso: string) {
  return parseIsoDate(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function getCalendarDays(month: Date) {
  const firstVisibleDay = startOfWeek(startOfMonth(month));
  return Array.from({ length: 42 }, (_, index) => addDays(firstVisibleDay, index));
}

function weekKey(date: Date) {
  return toIsoDate(startOfWeek(date));
}

function sortByDateDesc<T extends { date: string }>(a: T, b: T) {
  return b.date.localeCompare(a.date);
}

function countLogsForWeek(logs: SessionLog[], weekStart: Date) {
  const targetWeek = weekKey(weekStart);
  return logs.filter((log) => weekKey(parseIsoDate(log.date)) === targetWeek).length;
}

function getWeeklyStreak(logs: SessionLog[], weeklyGoal: number) {
  let cursor = startOfWeek(new Date());
  let streak = 0;

  if (countLogsForWeek(logs, cursor) < weeklyGoal) {
    cursor = addDays(cursor, -7);
  }

  while (countLogsForWeek(logs, cursor) >= weeklyGoal) {
    streak += 1;
    cursor = addDays(cursor, -7);
  }

  return streak;
}

export function DashboardScreen({ empty: _empty, lifts: profile }: { empty: ReactNode; lifts: DashboardProfile }) {
  const theme = useAppTheme();
  const nav = useNavigation();
  const [notice, setNotice] = useState<string | null>(null);
  const [showLogForm, setShowLogForm] = useState(false);
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => daysFromToday(0));
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [logTitle, setLogTitle] = useState("");
  const [logNotes, setLogNotes] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const {
    completedWorkoutIds,
    completeWorkout,
    deleteWorkoutLog,
    logWorkout,
    logs,
    nutrition,
    updateNutrition,
    updateWorkoutLog,
    workouts,
  } = useAppData();

  const todayIso = daysFromToday(0);
  const currentWeekStart = useMemo(() => startOfWeek(new Date()), []);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(currentWeekStart, index)), [currentWeekStart]);
  const loggedDates = useMemo(() => new Set(logs.map((log) => log.date)), [logs]);
  const logsByDate = useMemo(() => {
    const grouped = new Map<string, SessionLog[]>();
    for (const log of logs) {
      const existing = grouped.get(log.date) ?? [];
      grouped.set(log.date, [...existing, log]);
    }
    return grouped;
  }, [logs]);
  const calendarDays = useMemo(() => getCalendarDays(calendarMonth), [calendarMonth]);
  const weekStartIso = toIsoDate(currentWeekStart);
  const weekEndIso = toIsoDate(addDays(currentWeekStart, 6));
  const weeklyLogs = logs.filter((log) => log.date >= weekStartIso && log.date <= weekEndIso);
  const weeklyStreak = getWeeklyStreak(logs, WEEKLY_WORKOUT_GOAL);
  const weeklyProgress = Math.min(weeklyLogs.length / WEEKLY_WORKOUT_GOAL, 1);
  const nextWorkout = [...workouts]
    .filter((workout) => workout.date >= todayIso && !completedWorkoutIds.includes(workout.id))
    .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)))[0];
  const nextPartner = nextWorkout ? getPartner(nextWorkout.partnerId) : null;
  const sortedLogs = [...logs].sort(sortByDateDesc);
  const visibleLogs = showAllActivities ? sortedLogs : sortedLogs.slice(0, 2);
  const selectedDayLogs = [...(logsByDate.get(selectedCalendarDate) ?? [])].sort(sortByDateDesc);
  const selectedDayNutrition = selectedCalendarDate === todayIso ? nutrition : null;

  const lifts = (
    [
      ["Squat", parseWeight(profile.squat)],
      ["Bench", parseWeight(profile.bench)],
      ["Deadlift", parseWeight(profile.deadlift)],
      [profile.customLiftName.trim() || "Custom", parseWeight(profile.customLift)],
    ] as const
  ).filter(([, current], index) => current > 0 && (index < 3 || profile.customLiftName.trim()));

  function showNotice(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(null), 2400);
  }

  function handleCompleteWorkout() {
    if (!nextWorkout) return;
    completeWorkout(nextWorkout.id);
    showNotice("Workout added to your session log.");
  }

  function handleSaveLog() {
    const title = logTitle.trim();
    const notes = logNotes.trim();
    if (!title) {
      showNotice("Add a workout name first.");
      return;
    }

    logWorkout(title, notes || undefined);
    setLogTitle("");
    setLogNotes("");
    setShowLogForm(false);
    showNotice("Workout logged. Weekly goal updated.");
  }

  function beginEditLog(log: SessionLog) {
    setEditingLogId(log.id);
    setEditTitle(log.title);
    setEditNotes(log.notes ?? "");
  }

  function handleSaveEditedLog() {
    if (!editingLogId) return;
    const title = editTitle.trim();
    if (!title) {
      showNotice("Workout name cannot be empty.");
      return;
    }

    updateWorkoutLog(editingLogId, { title, notes: editNotes.trim() || undefined });
    setEditingLogId(null);
    setEditTitle("");
    setEditNotes("");
    showNotice("Activity updated.");
  }

  function handleDeleteEditedLog() {
    if (!editingLogId) return;
    deleteWorkoutLog(editingLogId);
    setEditingLogId(null);
    setEditTitle("");
    setEditNotes("");
    showNotice("Activity deleted. Weekly goal updated.");
  }

  return (
    <Screen>
      <TitleBar title="Home" />

      <ScrollBody contentContainerStyle={styles.body}>
        <View style={styles.hero}>
          <AppText size={13} weight="bold" primary upper>
            SwoleMates
          </AppText>
          <AppText size={30} weight="black">
            Welcome back, {firstName(profile.fullName)}
          </AppText>
          <AppText muted style={{ lineHeight: 20 }}>
            {profile.primaryGym ? `Home gym: ${profile.primaryGym}` : "Plan, train, and track your lifts."}
          </AppText>
        </View>

        {notice ? (
          <View style={[styles.notice, { backgroundColor: theme.colors.primaryTint, borderColor: theme.colors.primary }]}>
            <AppText size={12} weight="bold" primary>
              {notice}
            </AppText>
          </View>
        ) : null}

        <Card padding={18} radius={24} gap={16} style={[styles.streakCard, { backgroundColor: theme.colors.primaryDeep }]}>
          <View style={styles.sectionHeader}>
            <View style={{ gap: 4 }}>
              <AppText size={12} weight="bold" primary upper>
                Weekly Streak
              </AppText>
              <AppText size={28} weight="black">
                {weeklyStreak ? `${weeklyStreak}-week streak` : "No streak yet"}
              </AppText>
            </View>
            <AppText size={32}>🔥</AppText>
          </View>

          <SecondaryButton height={38} fontSize={13} style={styles.calendarButton} onPress={() => setShowCalendar(true)}>
            Open Calendar
          </SecondaryButton>

          <View style={{ gap: 8 }}>
            <View style={styles.sectionHeader}>
              <AppText size={13} muted>
                Weekly goal
              </AppText>
              <AppText size={13} weight="bold">
                {weeklyLogs.length}/{WEEKLY_WORKOUT_GOAL} workouts
              </AppText>
            </View>
            <ProgressBar progress={weeklyProgress} />
            <AppText size={12} muted>
              {weeklyLogs.length >= WEEKLY_WORKOUT_GOAL
                ? "Goal hit for this week."
                : `${WEEKLY_WORKOUT_GOAL - weeklyLogs.length} more workout${
                    WEEKLY_WORKOUT_GOAL - weeklyLogs.length === 1 ? "" : "s"
                  } this week to build your streak.`}
            </AppText>
          </View>

          <View style={styles.weekRow}>
            {weekDays.map((day, index) => {
              const iso = toIsoDate(day);
              const logged = loggedDates.has(iso);
              const today = iso === todayIso;
              return (
                <View
                  key={iso}
                  style={[
                    styles.weekDay,
                    {
                      backgroundColor: logged ? theme.colors.primary : theme.colors.surfaceRaised,
                      borderColor: today ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                >
                  <AppText size={10} weight="bold" color={logged ? theme.colors.primaryText : theme.colors.muted}>
                    {weekdayLabels[index]}
                  </AppText>
                  <AppText size={14} weight="black" color={logged ? theme.colors.primaryText : theme.colors.text}>
                    {logged ? "✓" : day.getDate()}
                  </AppText>
                </View>
              );
            })}
          </View>
        </Card>

        <Card padding={18} radius={22} gap={16}>
          <View style={styles.sectionHeader}>
            <SectionLabel>Today</SectionLabel>
            {nextWorkout ? (
              <View style={[styles.pill, { backgroundColor: theme.colors.primaryTint }]}>
                <AppText size={11} weight="bold" primary>
                  {relativeDay(nextWorkout.date)}
                </AppText>
              </View>
            ) : null}
          </View>

          {nextWorkout ? (
            <>
              <View style={{ gap: 6 }}>
                <AppText size={21} weight="extrabold">
                  {nextWorkout.title}
                </AppText>
                <AppText size={13} muted style={{ lineHeight: 20 }}>
                  {nextWorkout.gym} • {nextWorkout.time}
                  {nextPartner ? ` • ${nextPartner.name.split(" ")[0]}` : ""}
                </AppText>
              </View>
              <PrimaryButton height={48} onPress={handleCompleteWorkout}>
                Mark Workout Complete
              </PrimaryButton>
            </>
          ) : (
            <>
              <View style={{ gap: 6 }}>
                <AppText size={21} weight="extrabold">
                  No workout planned yet
                </AppText>
                <AppText size={13} muted style={{ lineHeight: 20 }}>
                  Schedule with a match or log your own workout after training.
                </AppText>
              </View>
              <PrimaryButton height={48} onPress={() => nav.push({ name: "schedule" })}>
                Schedule Workout
              </PrimaryButton>
            </>
          )}
        </Card>

        <View style={styles.quickActions}>
          <SecondaryButton height={46} fontSize={13} style={styles.quickButton} onPress={() => nav.setTab("Discover")}>
            Find Partner
          </SecondaryButton>
          <SecondaryButton height={46} fontSize={13} style={styles.quickButton} onPress={() => setShowLogForm((current) => !current)}>
            {showLogForm ? "Close Log" : "Log Workout"}
          </SecondaryButton>
        </View>

        {showLogForm ? (
          <Card padding={16} radius={20} gap={12}>
            <SectionLabel>Quick Workout Log</SectionLabel>
            <Input bordered placeholder="Workout name, e.g. Push Day" value={logTitle} onChangeText={setLogTitle} />
            <Input
              bordered
              multiline
              placeholder="Exercises, sets, notes… e.g. Bench 3x8, incline DB press, triceps"
              value={logNotes}
              onChangeText={setLogNotes}
            />
            <PrimaryButton height={46} onPress={handleSaveLog}>
              Save Workout
            </PrimaryButton>
          </Card>
        ) : null}

        <Card padding={16} radius={20} gap={14}>
          <View style={styles.sectionHeader}>
            <SectionLabel>Your Lifts</SectionLabel>
            <SecondaryButton height={34} fontSize={12} style={styles.smallButton} onPress={() => nav.setTab("Profile")}>
              Edit
            </SecondaryButton>
          </View>

          {lifts.length ? (
            <View style={styles.liftGrid}>
              {lifts.slice(0, 4).map(([label, value]) => (
                <View key={label} style={[styles.liftTile, { backgroundColor: theme.colors.surfaceRaised }]}>
                  <AppText size={11} weight="bold" muted upper>
                    {label}
                  </AppText>
                  <AppText size={18} weight="black">
                    {value} lbs
                  </AppText>
                </View>
              ))}
            </View>
          ) : (
            <AppText muted style={{ lineHeight: 20 }}>
              Add your PRs in Profile so your home page can show your lifting numbers.
            </AppText>
          )}
        </Card>

        <Card padding={16} radius={20} gap={12}>
          <View style={styles.sectionHeader}>
            <SectionLabel>Recent Activity</SectionLabel>
            {logs.length > 2 ? (
              <SecondaryButton
                height={34}
                fontSize={12}
                style={styles.smallButton}
                onPress={() => setShowAllActivities((current) => !current)}
              >
                {showAllActivities ? "Show Less" : "See All"}
              </SecondaryButton>
            ) : null}
          </View>

          {editingLogId ? (
            <Card padding={12} radius={14} gap={10}>
              <AppText size={12} weight="bold" muted upper>
                Edit Activity
              </AppText>
              <Input bordered value={editTitle} onChangeText={setEditTitle} placeholder="Workout name" />
              <Input bordered multiline value={editNotes} onChangeText={setEditNotes} placeholder="Exercises and notes" />
              <View style={styles.quickActions}>
                <SecondaryButton
                  height={42}
                  fontSize={13}
                  style={styles.quickButton}
                  textColor={theme.colors.danger}
                  onPress={handleDeleteEditedLog}
                >
                  Delete
                </SecondaryButton>
                <SecondaryButton height={42} fontSize={13} style={styles.quickButton} onPress={() => setEditingLogId(null)}>
                  Cancel
                </SecondaryButton>
                <PrimaryButton height={42} fontSize={13} style={styles.quickButton} onPress={handleSaveEditedLog}>
                  Save
                </PrimaryButton>
              </View>
            </Card>
          ) : null}

          {visibleLogs.length ? (
            <View style={{ gap: 12 }}>
              {visibleLogs.map((log) => (
                <View key={log.id} style={styles.activityRow}>
                  <View style={[styles.dateChip, { backgroundColor: theme.colors.surfaceRaised }]}>
                    <AppText size={11} weight="extrabold" primary>
                      {formatShortDate(log.date)}
                    </AppText>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText weight="bold" numberOfLines={1}>
                      {log.title}
                    </AppText>
                    <AppText size={12} muted numberOfLines={log.notes ? 2 : 1}>
                      {log.notes || (log.verified ? "Verified partner session" : "Self-logged workout")}
                    </AppText>
                  </View>
                  <SecondaryButton height={32} fontSize={12} style={styles.editButton} onPress={() => beginEditLog(log)}>
                    Edit
                  </SecondaryButton>
                </View>
              ))}
            </View>
          ) : (
            <AppText muted style={{ lineHeight: 20 }}>
              Your workouts will appear here after you log them.
            </AppText>
          )}
        </Card>

        {nutrition ? (
          <Card padding={16} radius={20} gap={12}>
            <SectionLabel>Nutrition Snapshot</SectionLabel>
            <View style={styles.macroGrid}>
              {(["calories", "protein", "carbs", "fats"] as const).map((field) => (
                <MacroInput
                  key={field}
                  label={field === "fats" ? "Fats" : field[0].toUpperCase() + field.slice(1)}
                  suffix={field === "calories" ? "cal" : "g"}
                  value={nutrition[field]}
                  goal={nutrition[macroGoals[field]]}
                  onChange={(value) => updateNutrition({ [field]: value })}
                />
              ))}
            </View>
          </Card>
        ) : null}
      </ScrollBody>

      <Modal animationType="slide" transparent visible={showCalendar} onRequestClose={() => setShowCalendar(false)}>
        <View style={styles.modalOverlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close calendar" style={styles.modalBackdrop} onPress={() => setShowCalendar(false)} />
          <View style={[styles.calendarSheet, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.calendarSheetContent}>
              <View style={styles.sheetHeader}>
                <View style={{ gap: 4 }}>
                  <AppText size={28} weight="black">
                    {weeklyStreak ? `${weeklyStreak}-week streak` : "No streak yet"} 🔥
                  </AppText>
                  <AppText size={13} muted>
                    Tap any day to review workouts and nutrition.
                  </AppText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close calendar"
                  onPress={() => setShowCalendar(false)}
                  style={[styles.closeButton, { backgroundColor: theme.colors.surfaceRaised }]}
                >
                  <AppText size={24} weight="bold">
                    ×
                  </AppText>
                </Pressable>
              </View>

              <Card padding={14} radius={24} gap={14}>
                <View style={styles.monthHeader}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Previous month"
                    onPress={() => setCalendarMonth((current) => addMonths(current, -1))}
                    style={styles.monthButton}
                  >
                    <AppText size={24} weight="black" primary>
                      ‹
                    </AppText>
                  </Pressable>
                  <AppText size={18} weight="black">
                    {monthTitle(calendarMonth)}
                  </AppText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Next month"
                    onPress={() => setCalendarMonth((current) => addMonths(current, 1))}
                    style={styles.monthButton}
                  >
                    <AppText size={24} weight="black" muted>
                      ›
                    </AppText>
                  </Pressable>
                </View>

                <View style={styles.calendarWeekLabels}>
                  {weekdayLabels.map((day) => (
                    <AppText key={day} size={12} weight="extrabold" muted style={styles.calendarWeekLabel}>
                      {day[0]}
                    </AppText>
                  ))}
                </View>

                <View style={styles.calendarGrid}>
                  {calendarDays.map((day) => {
                    const iso = toIsoDate(day);
                    const isSelected = iso === selectedCalendarDate;
                    const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                    const isToday = iso === todayIso;
                    const hasWorkout = loggedDates.has(iso);
                    const hasNutrition = iso === todayIso && !!nutrition;
                    const hasActivity = hasWorkout || hasNutrition;
                    const dayBackground = hasActivity
                      ? theme.colors.primary
                      : isSelected
                        ? theme.colors.surface
                        : theme.colors.surfaceRaised;
                    const dayTextColor = hasActivity ? theme.colors.primaryText : isToday || isSelected ? theme.colors.primary : theme.colors.text;

                    return (
                      <Pressable
                        key={iso}
                        accessibilityRole="button"
                        accessibilityLabel={`View ${calendarDayTitle(iso)} activity`}
                        onPress={() => setSelectedCalendarDate(iso)}
                        style={[
                          styles.calendarDay,
                          {
                            backgroundColor: dayBackground,
                            borderColor: isSelected ? theme.colors.primary : "transparent",
                            opacity: isCurrentMonth ? 1 : 0.35,
                          },
                        ]}
                      >
                        <AppText size={15} weight="black" color={dayTextColor}>
                          {hasWorkout ? "✓" : day.getDate()}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </Card>

              <Card padding={16} radius={22} gap={12}>
                <View style={styles.sectionHeader}>
                  <SectionLabel>{calendarDayTitle(selectedCalendarDate)}</SectionLabel>
                  {selectedCalendarDate === todayIso ? (
                    <View style={[styles.pill, { backgroundColor: theme.colors.primaryTint }]}>
                      <AppText size={11} weight="bold" primary>
                        Today
                      </AppText>
                    </View>
                  ) : null}
                </View>

                {selectedDayLogs.length || selectedDayNutrition ? (
                  <View style={{ gap: 10 }}>
                    {selectedDayLogs.map((log) => (
                      <View key={log.id} style={[styles.dayDetailRow, { backgroundColor: theme.colors.surfaceRaised }]}>
                        <AppText size={18}>🏋️</AppText>
                        <View style={{ flex: 1, gap: 3 }}>
                          <AppText weight="bold">Worked out: {log.title}</AppText>
                          <AppText size={12} muted numberOfLines={2}>
                            {log.notes || (log.verified ? "Verified partner attendance" : "Self-logged workout")}
                          </AppText>
                        </View>
                      </View>
                    ))}

                    {selectedDayNutrition ? (
                      <View style={[styles.dayDetailRow, { backgroundColor: theme.colors.surfaceRaised }]}>
                        <AppText size={18}>🍽️</AppText>
                        <View style={{ flex: 1, gap: 3 }}>
                          <AppText weight="bold">Consumed {selectedDayNutrition.calories.toLocaleString()} calories</AppText>
                          <AppText size={12} muted>
                            {selectedDayNutrition.protein}g protein • {selectedDayNutrition.carbs}g carbs • {selectedDayNutrition.fats}g fats
                          </AppText>
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <AppText muted style={{ lineHeight: 20 }}>
                    No workout or nutrition has been logged for this day yet.
                  </AppText>
                )}
              </Card>

              <Card padding={16} radius={22} gap={8} style={{ backgroundColor: theme.colors.primaryDeep }}>
                <AppText size={12} muted>
                  Current week
                </AppText>
                <AppText size={18} weight="black">
                  {weeklyLogs.length >= WEEKLY_WORKOUT_GOAL
                    ? "You're on fire. You've secured your streak for the week."
                    : `${WEEKLY_WORKOUT_GOAL - weeklyLogs.length} more workout${
                        WEEKLY_WORKOUT_GOAL - weeklyLogs.length === 1 ? "" : "s"
                      } to secure this week.`}
                </AppText>
              </Card>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function MacroInput({
  label,
  suffix,
  value,
  goal,
  onChange,
}: {
  label: string;
  suffix: string;
  value: number;
  goal: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.macroItem}>
      <AppText size={11} weight="bold" muted upper>
        {label}
      </AppText>
      <Input
        accessibilityLabel={`${label} consumed today`}
        keyboardType="number-pad"
        value={`${value}`}
        onChangeText={(text) => onChange(parseNumber(text))}
        style={styles.macroInput}
      />
      <AppText size={11} muted>
        {value.toLocaleString()} / {goal.toLocaleString()}
        {suffix === "g" ? "g" : " cal"}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 14,
  },
  hero: {
    gap: 4,
    paddingBottom: 2,
  },
  notice: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  streakCard: {
    overflow: "hidden",
  },
  calendarButton: {
    alignSelf: "flex-start",
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  weekRow: {
    flexDirection: "row",
    gap: 7,
    justifyContent: "space-between",
  },
  weekDay: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    paddingVertical: 8,
  },
  quickActions: {
    flexDirection: "row",
    gap: 10,
  },
  quickButton: {
    borderRadius: 14,
    flex: 1,
  },
  smallButton: {
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  editButton: {
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  liftGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  liftTile: {
    borderRadius: 14,
    gap: 4,
    minWidth: "47%",
    padding: 12,
  },
  activityRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  dateChip: {
    borderRadius: 10,
    minWidth: 58,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  macroGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  macroItem: {
    gap: 6,
    minWidth: "47%",
  },
  macroInput: {
    fontSize: 17,
    fontWeight: "800",
    height: 38,
    paddingHorizontal: 10,
  },
  modalOverlay: {
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 12,
  },
  modalBackdrop: {
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  calendarSheet: {
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    borderWidth: 1,
    maxHeight: "88%",
    maxWidth: 430,
    overflow: "hidden",
    width: "100%",
  },
  calendarSheetContent: {
    gap: 14,
    padding: 18,
    paddingBottom: 26,
  },
  sheetHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 14,
    justifyContent: "space-between",
  },
  closeButton: {
    alignItems: "center",
    borderRadius: 26,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  monthHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  monthButton: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  calendarWeekLabels: {
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    width: 308,
  },
  calendarWeekLabel: {
    textAlign: "center",
    width: 38,
  },
  calendarGrid: {
    alignSelf: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    justifyContent: "center",
    width: 308,
  },
  calendarDay: {
    alignItems: "center",
    borderRadius: 19,
    borderWidth: 2,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  dayDetailRow: {
    alignItems: "center",
    borderRadius: 16,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
});
