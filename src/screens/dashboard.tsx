import { ReactNode, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";

import {
  AppText,
  Avatar,
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
import { LiftProgression } from "@/components/lift-progression";
import { type UserProfile } from "@/lib/profile";
import {
  completeWorkout as checkInWorkout,
  listCheckInWorkouts,
  listVerifiedWorkoutLogs,
  meetupMissed,
  showUpPromptReady,
  type CheckInWorkout,
  type PlannedWorkout,
} from "@/lib/workouts";
import { queueSocialDraft } from "@/lib/social";
import { useNavigation } from "@/navigation";
import { NutritionTrackerScreen } from "@/screens/nutrition-tracker";
import { RecipesScreen } from "@/screens/recipes";
import { SettingsScreen } from "@/screens/settings";
import {
  daysFromToday,
  formatShortDate,
  type SessionLog,
  useAppData,
} from "@/state/app-data";
import { useAppTheme } from "@/theme";

type DashboardProfile = Pick<
  UserProfile,
  "fullName" | "primaryGym" | "squat" | "bench" | "deadlift" | "customLiftName" | "customLift"
>;

const weekdayLabels = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

function parseWeight(value: string) {
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

function countWorkoutDaysForWeek(logs: SessionLog[], weekStart: Date) {
  const targetWeek = weekKey(weekStart);
  return new Set(logs.filter((log) => weekKey(parseIsoDate(log.date)) === targetWeek).map((log) => log.date)).size;
}

function getWeeklyStreak(logs: SessionLog[], weeklyGoal: number) {
  let cursor = startOfWeek(new Date());
  let streak = 0;

  if (countWorkoutDaysForWeek(logs, cursor) < weeklyGoal) {
    cursor = addDays(cursor, -7);
  }

  while (countWorkoutDaysForWeek(logs, cursor) >= weeklyGoal) {
    streak += 1;
    cursor = addDays(cursor, -7);
  }

  return streak;
}

type HomeMode = "train" | "fuel";

let savedHomeMode: HomeMode = "train";
let savedShowRecipes = false;

function SegmentSwitch<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string }[];
}) {
  const theme = useAppTheme();
  return (
    <View style={[styles.segment, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.id)}
            style={[styles.segmentOption, selected && { backgroundColor: theme.colors.primary }]}
          >
            <AppText size={13} weight="extrabold" color={selected ? theme.colors.primaryText : theme.colors.muted}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function DashboardScreen({ empty: _empty, lifts: profile }: { empty: ReactNode; lifts: DashboardProfile }) {
  const theme = useAppTheme();
  const nav = useNavigation();
  const [notice, setNotice] = useState<string | null>(null);
  const [showLogForm, setShowLogForm] = useState(false);
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showGoalEditor, setShowGoalEditor] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [homeMode, setHomeMode] = useState<HomeMode>(savedHomeMode);
  const [showRecipes, setShowRecipes] = useState(savedShowRecipes);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => daysFromToday(0));
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [logTitle, setLogTitle] = useState("");
  const [logNotes, setLogNotes] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [calendarLogOpen, setCalendarLogOpen] = useState(false);
  const [calendarLogTitle, setCalendarLogTitle] = useState("");
  const [calendarLogNotes, setCalendarLogNotes] = useState("");
  const [deletingCalendarLogId, setDeletingCalendarLogId] = useState<string | null>(null);
  const [goalDraft, setGoalDraft] = useState(3);
  const {
    deleteWorkoutLog,
    foodEntries,
    foodJournalReady,
    foodJournalError,
    workoutStorageError,
    accountSyncError,
    retryAccountSync,
    logWorkout,
    logs,
    syncVerifiedWorkoutLogs,
    updateWeeklyWorkoutGoal,
    updateWorkoutLog,
    weeklyWorkoutGoal,
  } = useAppData();

  useEffect(() => {
    if (!foodJournalReady) return;
    let active = true;
    const refreshVerifiedLogs = async () => {
      try {
        const verifiedLogs = await listVerifiedWorkoutLogs();
        if (active) syncVerifiedWorkoutLogs(verifiedLogs);
      } catch {
        // Keep the last saved calendar data when a background refresh fails.
      }
    };
    void refreshVerifiedLogs();
    const timer = setInterval(() => void refreshVerifiedLogs(), 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [foodJournalReady]);

  const todayIso = daysFromToday(0);
  const currentWeekStart = useMemo(() => startOfWeek(new Date()), [todayIso]);
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
  const weeklyWorkoutDays = new Set(weeklyLogs.map((log) => log.date)).size;
  const weeklyStreak = getWeeklyStreak(logs, weeklyWorkoutGoal);
  const weeklyProgress = Math.min(weeklyWorkoutDays / weeklyWorkoutGoal, 1);
  const sortedLogs = [...logs].sort(sortByDateDesc);
  const visibleLogs = showAllActivities ? sortedLogs : sortedLogs.slice(0, 2);
  const selectedDayLogs = [...(logsByDate.get(selectedCalendarDate) ?? [])].sort(sortByDateDesc);
  const selectedDayFood = foodEntries.filter((entry) => entry.date === selectedCalendarDate);
  const selectedDayNutrition = selectedDayFood.length
    ? selectedDayFood.reduce(
        (total, entry) => ({
          calories: total.calories + entry.calories,
          protein: total.protein + entry.protein,
          carbs: total.carbs + entry.carbs,
          fats: total.fats + entry.fats,
        }),
        { calories: 0, protein: 0, carbs: 0, fats: 0 },
      )
    : null;

  function showNotice(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(null), 2400);
  }

  async function handleSaveLog() {
    const title = logTitle.trim();
    const notes = logNotes.trim();
    if (!title) {
      showNotice("Add a workout name first.");
      return;
    }

    if (!await logWorkout(title, notes || undefined)) return;
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

  async function handleSaveEditedLog() {
    if (!editingLogId) return;
    const title = editTitle.trim();
    if (!title) {
      showNotice("Workout name cannot be empty.");
      return;
    }

    if (!await updateWorkoutLog(editingLogId, { title, notes: editNotes.trim() || undefined })) return;
    setEditingLogId(null);
    setEditTitle("");
    setEditNotes("");
    showNotice("Activity updated.");
  }

  async function handleDeleteEditedLog() {
    if (!editingLogId) return;
    if (!await deleteWorkoutLog(editingLogId)) return;
    setEditingLogId(null);
    setEditTitle("");
    setEditNotes("");
    showNotice("Activity deleted. Weekly goal updated.");
  }

  function openGoalEditor() {
    setGoalDraft(weeklyWorkoutGoal);
    setShowGoalEditor(true);
  }

  async function saveWeeklyGoal() {
    if (!await updateWeeklyWorkoutGoal(goalDraft)) return;
    setShowGoalEditor(false);
    showNotice(`Weekly goal set to ${goalDraft} workout day${goalDraft === 1 ? "" : "s"}.`);
  }

  function openCalendarDay(iso: string) {
    setSelectedCalendarDate(iso);
    setCalendarMonth(startOfMonth(parseIsoDate(iso)));
    setCalendarLogOpen(false);
    setShowCalendar(true);
  }

  function closeCalendar() {
    setDeletingCalendarLogId(null);
    setCalendarLogOpen(false);
    setShowCalendar(false);
  }

  async function saveCalendarWorkout() {
    const title = calendarLogTitle.trim();
    if (!title) {
      showNotice("Add a workout name first.");
      return;
    }
    if (!await logWorkout(title, calendarLogNotes.trim() || undefined, selectedCalendarDate)) return;
    setCalendarLogTitle("");
    setCalendarLogNotes("");
    setCalendarLogOpen(false);
    showNotice("Workout logged. Weekly goal updated.");
  }

  async function deleteCalendarWorkout(log: SessionLog) {
    if (!await deleteWorkoutLog(log.id)) return;
    setDeletingCalendarLogId(null);
    showNotice("Workout deleted. Weekly goal updated.");
  }

  if (showSettings) return <SettingsScreen onClose={() => setShowSettings(false)} />;

  return (
    <Screen>
      <TitleBar
        title="Home"
        right={
          <Pressable accessibilityRole="button" accessibilityLabel="Settings" hitSlop={8} onPress={() => setShowSettings(true)}>
            <AppText size={28} primary>
              ⚙
            </AppText>
          </Pressable>
        }
      />

      <View style={styles.modeSwitch}>
        <SegmentSwitch
          value={homeMode}
          onChange={(next) => {
            savedHomeMode = next;
            setHomeMode(next);
          }}
          options={[
            { id: "train", label: "Train" },
            { id: "fuel", label: "Fuel" },
          ]}
        />
      </View>
      {accountSyncError ? <View style={{ paddingHorizontal: 20, gap: 8 }}><AppText color={theme.colors.danger}>{accountSyncError}</AppText><SecondaryButton onPress={retryAccountSync}>Retry account sync</SecondaryButton></View> : null}
      {workoutStorageError ? <AppText size={13} color={theme.colors.danger} style={{ paddingHorizontal: 20 }}>{workoutStorageError}</AppText> : null}

      {homeMode === "fuel" ? (
        <View style={{ flex: 1 }}>
          {showRecipes ? (
            <RecipesScreen
              embedded
              onBack={() => {
                savedShowRecipes = false;
                setShowRecipes(false);
              }}
            />
          ) : (
            <NutritionTrackerScreen
              embedded
              header={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open recipes"
                  onPress={() => {
                    savedShowRecipes = true;
                    setShowRecipes(true);
                  }}
                >
                  <Card padding={14} radius={18} gap={4} style={{ backgroundColor: theme.colors.primaryDeep }}>
                    <View style={styles.sectionHeader}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <SectionLabel>Recipes</SectionLabel>
                        <AppText weight="bold">Build meals that match your macros</AppText>
                        <AppText size={12} muted>
                          Open the recipe maker
                        </AppText>
                      </View>
                      <AppText size={18} primary>
                        ›
                      </AppText>
                    </View>
                  </Card>
                </Pressable>
              }
            />
          )}
        </View>
      ) : (
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

        <CheckInPanel />

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
              <View style={{ gap: 2 }}>
                <AppText size={13} muted>
                  Weekly goal
                </AppText>
                <AppText size={13} weight="bold">
                  {weeklyWorkoutDays}/{weeklyWorkoutGoal} workout days
                </AppText>
              </View>
              <SecondaryButton height={34} fontSize={12} style={styles.smallButton} onPress={openGoalEditor}>
                Edit goal
              </SecondaryButton>
            </View>
            <ProgressBar progress={weeklyProgress} />
            <AppText size={12} muted>
              {weeklyWorkoutDays >= weeklyWorkoutGoal
                ? "Goal hit for this week."
                : `${weeklyWorkoutGoal - weeklyWorkoutDays} more workout day${
                    weeklyWorkoutGoal - weeklyWorkoutDays === 1 ? "" : "s"
                  } this week to build your streak. A partner workout counts after both people check in.`}
            </AppText>
          </View>

          <View style={styles.weekRow}>
            {weekDays.map((day, index) => {
              const iso = toIsoDate(day);
              const logged = loggedDates.has(iso);
              const hasFood = foodEntries.some((entry) => entry.date === iso);
              const today = iso === todayIso;
              return (
                <Pressable
                  key={iso}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${calendarDayTitle(iso)} activity`}
                  onPress={() => openCalendarDay(iso)}
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
                  {hasFood ? <View accessibilityLabel="Nutrition logged" style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: logged ? theme.colors.primaryText : theme.colors.primary }} /> : null}
                </Pressable>
              );
            })}
          </View>
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

        <LiftProgression />

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
                  <SecondaryButton
                    height={32}
                    fontSize={12}
                    style={styles.editButton}
                    onPress={() => {
                      const lines = [log.title, formatShortDate(log.date), log.notes].filter(Boolean);
                      queueSocialDraft(lines.join("\n"));
                      nav.setTab("Social");
                    }}
                  >
                    Share
                  </SecondaryButton>
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
      </ScrollBody>
      )}

      <Modal animationType="slide" transparent visible={showCalendar} onRequestClose={closeCalendar}>
        <View style={styles.modalOverlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close calendar" style={styles.modalBackdrop} onPress={closeCalendar} />
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
                  onPress={closeCalendar}
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
                    const hasNutrition = foodEntries.some((entry) => entry.date === iso);
                    const hasActivity = hasWorkout || hasNutrition;
                    const dayBackground = hasActivity
                      ? theme.colors.primary
                      : isSelected
                        ? theme.colors.surface
                        : theme.colors.surfaceRaised;
                    const dayTextColor = hasActivity ? theme.colors.primaryText : isToday || isSelected ? theme.colors.accent : theme.colors.text;

                    return (
                      <Pressable
                        key={iso}
                        accessibilityRole="button"
                        accessibilityLabel={`View ${calendarDayTitle(iso)} activity`}
                        onPress={() => {
                          setSelectedCalendarDate(iso);
                          setCalendarLogOpen(false);
                          setDeletingCalendarLogId(null);
                        }}
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
                {workoutStorageError ? <AppText size={13} color={theme.colors.danger}>{workoutStorageError}</AppText> : null}
                {foodJournalError ? <AppText size={13} color={theme.colors.danger}>{foodJournalError}</AppText> : null}
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
                    {selectedDayLogs.map((log) => {
                      const confirmingDelete = deletingCalendarLogId === log.id;
                      return (
                        <View key={log.id} style={{ gap: 8 }}>
                          <View style={[styles.dayDetailRow, { backgroundColor: theme.colors.surfaceRaised }]}>
                            {log.partnerName ? (
                              <PartnerFace name={log.partnerName} photo={log.partnerPhoto ?? null} size={42} />
                            ) : (
                              <AppText size={18}>🏋️</AppText>
                            )}
                            <View style={{ flex: 1, gap: 3 }}>
                              <AppText weight="bold">Worked out: {log.title}</AppText>
                              {log.partnerName ? (
                                <AppText size={12} weight="bold" primary>
                                  With {log.partnerName}
                                </AppText>
                              ) : null}
                              <AppText size={12} muted numberOfLines={2}>
                                {log.notes || (log.checkedIn ? "Checked in for this workout" : log.verified ? "Verified partner attendance" : "Self-logged workout")}
                              </AppText>
                            </View>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Delete ${log.title}`}
                              hitSlop={8}
                              onPress={() => setDeletingCalendarLogId(log.id)}
                              style={[styles.calendarDeleteButton, { borderColor: theme.colors.danger }]}
                            >
                              <AppText size={12} weight="bold" color={theme.colors.danger}>
                                Delete
                              </AppText>
                            </Pressable>
                          </View>

                          {confirmingDelete ? (
                            <View
                              accessibilityRole="alert"
                              style={[styles.deleteConfirmation, { borderColor: theme.colors.danger }]}
                            >
                              <View style={{ flex: 1, gap: 2 }}>
                                <AppText size={13} weight="bold">
                                  Delete this workout?
                                </AppText>
                                <AppText size={11} muted>
                                  Your weekly progress will be recalculated.
                                </AppText>
                              </View>
                              <Pressable
                                accessibilityRole="button"
                                onPress={() => setDeletingCalendarLogId(null)}
                                style={styles.confirmationButton}
                              >
                                <AppText size={12} weight="bold" muted>
                                  Cancel
                                </AppText>
                              </Pressable>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Confirm delete ${log.title}`}
                                onPress={() => deleteCalendarWorkout(log)}
                                style={[styles.confirmationButton, { backgroundColor: theme.colors.danger }]}
                              >
                                <AppText size={12} weight="bold" color="#FFFFFF">
                                  Delete
                                </AppText>
                              </Pressable>
                            </View>
                          ) : null}
                        </View>
                      );
                    })}

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

                {selectedCalendarDate <= todayIso ? (
                  <SecondaryButton height={42} fontSize={13} onPress={() => {
                    closeCalendar();
                    nav.push({ name: "nutrition", date: selectedCalendarDate });
                  }}>
                    {selectedDayFood.length ? "Review & edit food for this day" : "Add food for this day"}
                  </SecondaryButton>
                ) : null}

                {selectedCalendarDate <= todayIso ? (
                  calendarLogOpen ? (
                    <View style={{ gap: 10 }}>
                      <Input
                        bordered
                        placeholder="Workout name, e.g. Pull Day"
                        value={calendarLogTitle}
                        onChangeText={setCalendarLogTitle}
                      />
                      <Input
                        bordered
                        multiline
                        placeholder="Exercises, sets, or notes"
                        value={calendarLogNotes}
                        onChangeText={setCalendarLogNotes}
                      />
                      <View style={styles.quickActions}>
                        <SecondaryButton
                          height={42}
                          fontSize={13}
                          style={styles.quickButton}
                          onPress={() => setCalendarLogOpen(false)}
                        >
                          Cancel
                        </SecondaryButton>
                        <PrimaryButton height={42} fontSize={13} style={styles.quickButton} onPress={saveCalendarWorkout}>
                          Save workout
                        </PrimaryButton>
                      </View>
                    </View>
                  ) : (
                    <SecondaryButton height={42} fontSize={13} onPress={() => setCalendarLogOpen(true)}>
                      Log workout for this day
                    </SecondaryButton>
                  )
                ) : null}
              </Card>

              <Card padding={16} radius={22} gap={8} style={{ backgroundColor: theme.colors.primaryDeep }}>
                <AppText size={12} muted>
                  Current week
                </AppText>
                <AppText size={18} weight="black">
                  {weeklyWorkoutDays >= weeklyWorkoutGoal
                    ? "You're on fire. You've secured your streak for the week."
                    : `${weeklyWorkoutGoal - weeklyWorkoutDays} more workout day${
                        weeklyWorkoutGoal - weeklyWorkoutDays === 1 ? "" : "s"
                      } to secure this week.`}
                </AppText>
              </Card>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={showGoalEditor} onRequestClose={() => setShowGoalEditor(false)}>
        <View style={styles.modalOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close weekly goal editor"
            style={styles.modalBackdrop}
            onPress={() => setShowGoalEditor(false)}
          />
          <View style={[styles.goalSheet, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1, gap: 4 }}>
                <SectionLabel>Weekly goal</SectionLabel>
                <AppText size={24} weight="black">
                  Choose your workout days
                </AppText>
                <AppText size={13} muted style={{ lineHeight: 19 }}>
                  Each day with a workout log counts once. Partner workouts count after both people check in.
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close weekly goal editor"
                onPress={() => setShowGoalEditor(false)}
                style={[styles.closeButton, { backgroundColor: theme.colors.surfaceRaised }]}
              >
                <AppText size={24} weight="bold">×</AppText>
              </Pressable>
            </View>

            <View style={styles.goalOptions}>
              {Array.from({ length: 7 }, (_, index) => index + 1).map((goal) => {
                const selected = goal === goalDraft;
                return (
                  <Pressable
                    key={goal}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${goal} workout day${goal === 1 ? "" : "s"} per week`}
                    onPress={() => setGoalDraft(goal)}
                    style={[
                      styles.goalOption,
                      {
                        backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceRaised,
                        borderColor: selected ? theme.colors.primary : theme.colors.border,
                      },
                    ]}
                  >
                    <AppText size={22} weight="black" color={selected ? theme.colors.primaryText : theme.colors.text}>
                      {goal}
                    </AppText>
                    <AppText size={10} weight="bold" color={selected ? theme.colors.primaryText : theme.colors.muted}>
                      {goal === 1 ? "DAY" : "DAYS"}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            <PrimaryButton height={48} onPress={saveWeeklyGoal}>
              Save weekly goal
            </PrimaryButton>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function checkInOpensLabel(plan: PlannedWorkout) {
  return plan.time;
}

function PartnerFace({ name, photo, size }: { name: string; photo: string | null; size: number }) {
  const theme = useAppTheme();
  if (photo) return <Avatar source={{ uri: photo }} size={size} />;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.colors.primaryTint,
      }}
    >
      <AppText size={size * 0.38} weight="black" primary>
        {name.slice(0, 1).toUpperCase()}
      </AppText>
    </View>
  );
}

function CheckInPanel() {
  const theme = useAppTheme();
  const { syncVerifiedWorkoutLogs } = useAppData();
  const [items, setItems] = useState<CheckInWorkout[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    listCheckInWorkouts()
      .then((workouts) => {
        if (!active) return;
        setItems(workouts);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (!active) return;
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Could not load workouts.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function checkIn(item: CheckInWorkout) {
    if (busyId) return;
    setBusyId(item.plan.id);
    setMessage(null);
    try {
      await checkInWorkout(item.plan);
      const workouts = await listCheckInWorkouts();
      setItems(workouts);
      syncVerifiedWorkoutLogs(await listVerifiedWorkoutLogs());
      setStatus("ready");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not check in.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 4 }}>
        <SectionLabel>Check in</SectionLabel>
        <AppText size={13} muted style={{ lineHeight: 20 }}>
          Check in when a workout starts. It counts toward the weekly goal after both people check in.
        </AppText>
      </View>
      {status === "loading" ? <AppText muted>Loading workouts...</AppText> : null}
      {status === "error" && message ? <AppText color={theme.colors.danger}>{message}</AppText> : null}
      {status === "ready" && items.length === 0 ? (
        <Card padding={16} radius={20} gap={8}>
          <AppText size={16} weight="extrabold">
            Nothing to check in for
          </AppText>
          <AppText size={13} muted style={{ lineHeight: 20 }}>
            Scheduled workouts show up here.
          </AppText>
        </Card>
      ) : null}
      {items.map((item) => {
        const { plan, partnerName, checkedIn, partnerCheckedIn } = item;
        const both = plan.status === "completed" || (checkedIn && partnerCheckedIn);
        const missed = meetupMissed(plan, now);
        const ready = showUpPromptReady(plan, now) && !checkedIn && !missed && !both;
        const detail = both
          ? `You and ${partnerName} both checked in.`
          : missed
            ? "Check-in for this workout is closed."
            : checkedIn
              ? `Checked in. Waiting on ${partnerName}.`
              : `Check in opens at ${checkInOpensLabel(plan)}.`;
        return (
          <Card key={plan.id} padding={16} radius={20} gap={8}>
            <View style={styles.partnerRow}>
              <PartnerFace name={partnerName} photo={item.partnerPhoto} size={48} />
              <View style={styles.partnerCopy}>
                <AppText size={12} weight="extrabold" primary upper>
                  {plan.focus}
                </AppText>
                <AppText size={18} weight="extrabold">
                  {partnerName}
                </AppText>
                <AppText size={13}>
                  {formatShortDate(plan.date)}
                  {plan.time ? ` at ${plan.time}` : ""}
                </AppText>
              </View>
            </View>
            {ready ? null : (
              <AppText size={13} muted>
                {detail}
              </AppText>
            )}
            {ready ? (
              <PrimaryButton height={44} disabled={busyId === plan.id} onPress={() => void checkIn(item)}>
                {busyId === plan.id ? "Checking in..." : "Check in"}
              </PrimaryButton>
            ) : null}
          </Card>
        );
      })}
      {status === "ready" && message ? <AppText color={theme.colors.danger}>{message}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  modeSwitch: {
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  segment: {
    alignSelf: "stretch",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    padding: 3,
  },
  segmentOption: {
    alignItems: "center",
    borderRadius: 11,
    flex: 1,
    paddingVertical: 8,
  },
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
  partnerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  partnerCopy: {
    flex: 1,
    gap: 3,
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
  goalSheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    gap: 18,
    maxWidth: 430,
    padding: 20,
    paddingBottom: 28,
    width: "100%",
  },
  goalOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  goalOption: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    gap: 2,
    justifyContent: "center",
    minHeight: 66,
    width: "22%",
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
  calendarDeleteButton: {
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  deleteConfirmation: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 10,
  },
  confirmationButton: {
    alignItems: "center",
    borderRadius: 9,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 10,
  },
});
