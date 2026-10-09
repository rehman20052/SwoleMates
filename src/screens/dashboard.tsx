import { BRAND_LIME } from "@/theme";
import { TrainAppearance, TrainPrototype } from "@/components/train-prototype";
import { HomeBackdrop } from "@/components/home-backdrop";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";

import {
  AppText,
  Avatar,
  Card,
  Icon,
  Input,
  PrimaryButton,
  ProgressBar,
  Screen,
  ScrollBody,
  SecondaryButton,
  SectionLabel,
  TitleBar,
} from "@/components/ui";
import { QuickWorkoutLog } from "@/components/quick-workout-log";
import { WorkoutRoutines } from "@/components/workout-routines";
import { SaveFeedback } from "@/components/save-feedback";
import { exerciseSummary } from "@/lib/workout-session";
import { comparePerformanceLogs } from "@/lib/workout-logging";
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
import { icons } from "@/assets";
import { trainingSummary, trainingVolume, TrainIconBadge, TrainNumber, TrainText, useTrainPalette, TrainSecondary, TrainSection as TrainingCard, TrainSaveFeedback } from "@/components/train-ui";

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

function sortByDateDesc<T extends { date: string; loggedAt?: string }>(a: T, b: T) {
  return comparePerformanceLogs(a, b);
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
  const palette = useTrainPalette();
  const training = value === "train";
  return (
    <View style={[styles.segment, { backgroundColor: training ? palette.field : theme.colors.segmentSurface, borderColor: training ? palette.border : theme.colors.panelBorder, borderRadius: training ? 12 : 18 }]}>
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.id)}
            style={[styles.segmentOption, { minHeight: 46, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, borderRadius: training ? 8 : 14 }, selected && { backgroundColor: training ? palette.field : theme.colors.primary, borderBottomWidth: training ? 2 : 0, borderBottomColor: BRAND_LIME, boxShadow: training ? "none" : theme.effects.selectionShadow }]}
          >
            <Icon source={option.label === "Train" ? icons.training : icons.fuel} size={20} tint={selected ? training ? palette.text : theme.colors.primaryText : theme.colors.muted} />
            <AppText size={15} weight="extrabold" color={selected ? training ? palette.text : theme.colors.primaryText : theme.colors.muted}>
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
  const trainPalette = useTrainPalette();
  const [showCalendar, setShowCalendar] = useState(false);
  const [showGoalEditor, setShowGoalEditor] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRoutines, setShowRoutines] = useState(false);
  const [homeMode, setHomeMode] = useState<HomeMode>(savedHomeMode);
  const [fuelDate, setFuelDate] = useState<string | undefined>();
  const [showRecipes, setShowRecipes] = useState(savedShowRecipes);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => daysFromToday(0));
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [calendarLogOpen, setCalendarLogOpen] = useState(false);
  const [deletingCalendarLogId, setDeletingCalendarLogId] = useState<string | null>(null);
  const [goalDraft, setGoalDraft] = useState(3);
  const [savingGoal, setSavingGoal] = useState(false);
  const {
    deleteWorkoutLog,
    foodEntries,
    foodJournalReady,
    foodJournalError,
    workoutStorageError,
    accountSyncError,
    retryAccountSync,
    logs,
    syncVerifiedWorkoutLogs,
    updateWeeklyWorkoutGoal,
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

  function beginEditLog(log: SessionLog) {
    setEditingLogId(log.id);
  }

  async function handleDeleteEditedLog() {
    if (!editingLogId) return;
    if (!await deleteWorkoutLog(editingLogId)) return;
    setEditingLogId(null);
    showNotice("Activity deleted. Weekly goal updated.");
  }

  function openGoalEditor() {
    setGoalDraft(weeklyWorkoutGoal);
    setShowGoalEditor(true);
  }

  async function saveWeeklyGoal() {
    if (savingGoal || !foodJournalReady) return;
    setSavingGoal(true);
    try {
      if (await updateWeeklyWorkoutGoal(goalDraft)) setShowGoalEditor(false);
    } finally { setSavingGoal(false); }
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

  async function deleteCalendarWorkout(log: SessionLog) {
    if (!await deleteWorkoutLog(log.id)) return;
    setDeletingCalendarLogId(null);
    showNotice("Workout deleted. Weekly goal updated.");
  }

  if (showSettings) return <SettingsScreen onClose={() => setShowSettings(false)} />;
  if (showRoutines) return <WorkoutRoutines onClose={() => setShowRoutines(false)} />;

  return (
    <TrainAppearance active={homeMode === "train"}><Screen style={homeMode === "train" ? { backgroundColor: "#080a0b" } : undefined}>
      {!theme.isDark && homeMode === "fuel" ? <Image accessible={false} pointerEvents="none" source={require("../../assets/brand/home-light.svg")} contentFit="fill" style={StyleSheet.absoluteFill} /> : null}
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
            if (next === "fuel") setFuelDate(undefined);
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
              key={fuelDate ?? "today"}
              date={fuelDate}
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
                  <Card padding={16} radius={22} gap={0} style={{ borderWidth: 1, borderColor: theme.colors.primary, overflow: "hidden", boxShadow: theme.effects.recipeShadow }}>
                    <HomeBackdrop source={require("../../assets/brand/fuel-hero.jpg")} opacity={theme.effects.recipeOpacity} />
                    <View style={[styles.sectionHeader, { gap: 12, zIndex: 1, minHeight: 104 }]}>
                      <Image accessible={false} source={require("../../assets/brand/recipe-icon.png")} contentFit="contain" style={{ width: 56, height: 56 }} />
                      <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                        <SectionLabel color={theme.colors.photoAccent}>Recipes</SectionLabel>
                        <AppText size={15} weight="extrabold" color={theme.colors.photoText}>Build meals that match your macros</AppText>
                        <AppText size={11} color={theme.colors.photoMuted}>
                          Browse recipes and save them to your tracker
                        </AppText>
                      </View>
                      <AppText size={26} color={theme.colors.photoAccent} style={{ width: 30, height: 30, lineHeight: 28, textAlign: "center", borderRadius: 15, backgroundColor: theme.colors.photoControl, borderWidth: 1, borderColor: theme.colors.photoAccent }}>
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
        <TrainPrototype onCalendar={openCalendarDay} onEditLog={beginEditLog} onGoal={openGoalEditor} onEditFoods={(date) => {
          setFuelDate(date);
          savedShowRecipes = false;
          setShowRecipes(false);
          savedHomeMode = "fuel";
          setHomeMode("fuel");
        }} checkIn={<CheckInPanel />} />
      )}

      <WorkoutEditor visible={!!editingLogId} log={logs.find(log => log.id === editingLogId)} onClose={() => setEditingLogId(null)} onDelete={handleDeleteEditedLog} onSaved={() => { setEditingLogId(null); showNotice("Workout updated."); }} />

      <Modal animationType="slide" transparent visible={showCalendar} onRequestClose={closeCalendar}>
        <View style={[styles.modalOverlay, { backgroundColor: theme.colors.modalOverlay }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close calendar" style={styles.modalBackdrop} onPress={closeCalendar} />
          <View style={[styles.calendarSheet, { backgroundColor: trainPalette.background, borderColor: theme.colors.border }]}>
            <ScrollBody contentContainerStyle={styles.calendarSheetContent}>
              <View style={styles.sheetHeader}>
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <TrainText size={22} weight="bold">
                    {weeklyStreak ? `${weeklyStreak}-week streak` : "No streak yet"} 🔥
                  </TrainText>
                  <TrainText size={13} muted>
                    Tap any day to review workouts and nutrition.
                  </TrainText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close calendar"
                  onPress={closeCalendar}
                  style={[styles.closeButton, { backgroundColor: theme.colors.surfaceRaised }]}
                >
                  <TrainText size={24} weight="bold">
                    ×
                  </TrainText>
                </Pressable>
              </View>

              <TrainingCard padding={0} gap={12}>
                <View style={styles.monthHeader}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Previous month"
                    onPress={() => setCalendarMonth((current) => addMonths(current, -1))}
                    style={styles.monthButton}
                  >
                    <TrainText size={24} weight="black" primary>
                      ‹
                    </TrainText>
                  </Pressable>
                  <TrainText size={18} weight="black">
                    {monthTitle(calendarMonth)}
                  </TrainText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Next month"
                    onPress={() => setCalendarMonth((current) => addMonths(current, 1))}
                    style={styles.monthButton}
                  >
                    <TrainText size={24} weight="black" muted>
                      ›
                    </TrainText>
                  </Pressable>
                </View>

                <View style={styles.calendarWeekLabels}>
                  {weekdayLabels.map((day) => (
                    <TrainText key={day} size={12} weight="extrabold" muted style={styles.calendarWeekLabel}>
                      {day[0]}
                    </TrainText>
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
                    const dayBackground = hasWorkout
                      ? theme.colors.primary
                      : theme.colors.surfaceRaised;
                    const dayTextColor = hasWorkout ? theme.colors.primaryText : isToday || isSelected ? theme.colors.accent : theme.colors.text;

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
                        <TrainText size={15} weight="black" color={dayTextColor}>
                          {day.getDate()}
                        </TrainText>
                        {hasActivity ? <View style={{ position: "absolute", bottom: 3, flexDirection: "row", alignItems: "center", gap: 3 }}>{hasWorkout ? <TrainText accessibilityLabel="Workout logged" size={8} weight="bold" color={dayTextColor}>✓</TrainText> : null}{hasNutrition ? <View accessibilityLabel="Food logged" style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: dayTextColor }} /> : null}</View> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </TrainingCard>

              <Card padding={16} radius={22} gap={12}>
                {workoutStorageError ? <TrainText size={13} color={theme.colors.danger}>{workoutStorageError}</TrainText> : null}
                {foodJournalError ? <TrainText size={13} color={theme.colors.danger}>{foodJournalError}</TrainText> : null}
                <View style={[styles.sectionHeader, { flexWrap: "wrap", gap: 8 }]}>
                  <SectionLabel>{calendarDayTitle(selectedCalendarDate)}</SectionLabel>
                  {selectedCalendarDate === todayIso ? (
                    <View style={[styles.pill, { backgroundColor: theme.colors.primaryTint }]}>
                      <TrainText size={11} weight="bold" primary>
                        Today
                      </TrainText>
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
                              <TrainText size={18}>🏋️</TrainText>
                            )}
                            <View style={{ flex: 1, gap: 3 }}>
                              <TrainText weight="bold">{log.title}</TrainText>
                              {log.partnerName ? (
                                <TrainText size={12} weight="bold" primary>
                                  With {log.partnerName}
                                </TrainText>
                              ) : null}
                              <TrainText size={12} muted>{log.exercises?.length ? `${log.exercises.length} exercise${log.exercises.length === 1 ? "" : "s"}` : log.notes || (log.checkedIn ? "Checked in" : log.verified ? "Partner workout" : "Logged workout")}</TrainText>
                            </View>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Delete ${log.title}`}
                              hitSlop={8}
                              onPress={() => setDeletingCalendarLogId(log.id)}
                              style={[styles.calendarDeleteButton, { borderColor: theme.colors.danger }]}
                            >
                              <TrainText size={12} weight="bold" color={theme.colors.danger}>
                                Delete
                              </TrainText>
                            </Pressable>
                          </View>

                          {log.exercises?.length ? <View style={{ padding: 12, borderRadius: 14, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, gap: 10 }}>
                            {log.exercises.map((exercise, index) => <View key={exercise.id} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                              <TrainText size={11} muted style={{ width: 16 }}>{index + 1}</TrainText>
                              <TrainText size={12} weight="bold" style={{ flex: 1 }}>{exercise.name}</TrainText>
                              <View style={{ alignItems: "flex-end", gap: 2 }}>{exercise.setDetails?.some(set => set.weight !== exercise.weight || set.reps !== exercise.reps)
                                ? exercise.setDetails.map((set, setIndex) => <TrainText key={setIndex} size={11} muted>{set.weight} {exercise.unit} × {set.reps}</TrainText>)
                                : <><TrainText size={12} weight="bold">{exercise.weight} {exercise.unit}</TrainText><TrainText size={11} muted>{exercise.sets} × {exercise.reps}</TrainText></>}</View>
                            </View>)}
                          </View> : null}

                          {confirmingDelete ? (
                            <View
                              accessibilityRole="alert"
                              style={[styles.deleteConfirmation, { borderColor: theme.colors.danger }]}
                            >
                              <View style={{ flex: 1, gap: 2 }}>
                                <TrainText size={13} weight="bold">
                                  Delete this workout?
                                </TrainText>
                                <TrainText size={11} muted>
                                  Your weekly progress will be recalculated.
                                </TrainText>
                              </View>
                              <Pressable
                                accessibilityRole="button"
                                onPress={() => setDeletingCalendarLogId(null)}
                                style={styles.confirmationButton}
                              >
                                <TrainText size={12} weight="bold" muted>
                                  Cancel
                                </TrainText>
                              </Pressable>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Confirm delete ${log.title}`}
                                onPress={() => deleteCalendarWorkout(log)}
                                style={[styles.confirmationButton, { backgroundColor: theme.colors.danger }]}
                              >
                                <TrainText size={12} weight="bold" color="#FFFFFF">
                                  Delete
                                </TrainText>
                              </Pressable>
                            </View>
                          ) : null}
                        </View>
                      );
                    })}

                    {selectedDayNutrition ? (
                      <View style={[styles.dayDetailRow, { backgroundColor: theme.colors.surfaceRaised }]}>
                        <TrainText size={18}>🍽️</TrainText>
                        <View style={{ flex: 1, gap: 3 }}>
                          <TrainText weight="bold">Consumed {selectedDayNutrition.calories.toLocaleString()} calories</TrainText>
                          <TrainText size={12} muted>
                            {selectedDayNutrition.protein}g protein • {selectedDayNutrition.carbs}g carbs • {selectedDayNutrition.fats}g fats
                          </TrainText>
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <TrainText muted style={{ lineHeight: 20 }}>
                    No workout or nutrition has been logged for this day yet.
                  </TrainText>
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
                      <QuickWorkoutLog key={selectedCalendarDate} date={selectedCalendarDate} onSaved={() => { setCalendarLogOpen(false); showNotice("Workout saved to this day."); }} />
                      <View style={styles.quickActions}>
                        <SecondaryButton
                          height={42}
                          fontSize={13}
                          style={styles.quickButton}
                          onPress={() => setCalendarLogOpen(false)}
                        >
                          Cancel
                        </SecondaryButton>
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
                <TrainText size={12} muted>
                  Current week
                </TrainText>
                <TrainText size={18} weight="black">
                  {weeklyWorkoutDays >= weeklyWorkoutGoal
                    ? "You're on fire. You've secured your streak for the week."
                    : `${weeklyWorkoutGoal - weeklyWorkoutDays} more workout day${
                        weeklyWorkoutGoal - weeklyWorkoutDays === 1 ? "" : "s"
                      } to secure this week.`}
                </TrainText>
              </Card>
            </ScrollBody>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={showGoalEditor} onRequestClose={() => { if (!savingGoal) setShowGoalEditor(false); }}>
        <View style={[styles.modalOverlay, { backgroundColor: theme.colors.modalOverlay }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close weekly goal editor"
            disabled={savingGoal}
            style={styles.modalBackdrop}
            onPress={() => setShowGoalEditor(false)}
          />
          <View style={[styles.goalSheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: 8 }]}>
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1, gap: 4 }}>
                <SectionLabel>Weekly goal</SectionLabel>
                <TrainText size={24} weight="black">
                  Set your weekly goal
                </TrainText>
                <TrainText size={13} muted style={{ lineHeight: 19 }}>
                  Each day with a workout log counts once. Partner workouts count after both people check in.
                </TrainText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close weekly goal editor"
                disabled={savingGoal}
                onPress={() => setShowGoalEditor(false)}
                style={[styles.closeButton, { backgroundColor: theme.colors.surfaceRaised }]}
              >
                <TrainText size={24} weight="bold">×</TrainText>
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
                    disabled={savingGoal}
                    onPress={() => setGoalDraft(goal)}
                    style={[
                      styles.goalOption,
                      {
                        backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceRaised,
                        borderColor: selected ? theme.colors.primary : theme.colors.border,
                        borderRadius: 8,
                      },
                    ]}
                  >
                    <TrainText size={22} weight="black" color={selected ? theme.colors.primaryText : theme.colors.text}>
                      {goal}
                    </TrainText>
                    <TrainText size={10} weight="bold" color={selected ? theme.colors.primaryText : theme.colors.muted}>
                      {goal === 1 ? "DAY" : "DAYS"}
                    </TrainText>
                  </Pressable>
                );
              })}
            </View>

            <SaveFeedback area="workouts" onRetried={() => setShowGoalEditor(false)} />
            <PrimaryButton height={48} disabled={savingGoal || !foodJournalReady} style={{ borderRadius: 8 }} onPress={saveWeeklyGoal}>
              {savingGoal ? "Saving…" : "Save weekly goal"}
            </PrimaryButton>
          </View>
        </View>
      </Modal>
    </Screen></TrainAppearance>
  );
}

function WorkoutEditor({ visible, log, onClose, onDelete, onSaved }: { visible: boolean; log?: SessionLog; onClose: () => void; onDelete: () => Promise<void>; onSaved: () => void }) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => { setConfirmDelete(false); }, [visible, log?.id]);
  return <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
    <KeyboardAvoidingView enabled={Platform.OS !== "web"} behavior="padding" style={[styles.modalOverlay, { backgroundColor: theme.colors.editorOverlay }]}>
      <View style={{ width: "100%", maxWidth: 450, height: "92%", borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden", backgroundColor: theme.colors.background, paddingBottom: Math.max(insets.bottom, 16) }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderColor: theme.colors.border }}>
          <AppText size={20} weight="extrabold">Edit workout</AppText>
          <SecondaryButton height={44} fontSize={13} disabled={deleting} onPress={onClose}>Cancel</SecondaryButton>
        </View>
        <ScrollBody contentContainerStyle={{ padding: 16, gap: 12 }}>
          {log ? <QuickWorkoutLog key={log.id} existing={log} onSaved={onSaved} /> : <AppText muted>This workout is no longer available.</AppText>}
        </ScrollBody>
        <View style={{ paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderColor: theme.colors.border, gap: 8 }}>
          {confirmDelete ? <><AppText size={13}>Delete this workout?</AppText><View style={{ flexDirection: "row", gap: 12 }}><SecondaryButton style={{ flex: 1 }} disabled={deleting} onPress={() => setConfirmDelete(false)}>Keep</SecondaryButton><PrimaryButton style={{ flex: 1 }} disabled={deleting} onPress={async () => { setDeleting(true); await onDelete(); setDeleting(false); }}>{deleting ? "Deleting…" : "Delete workout"}</PrimaryButton></View></> : <SecondaryButton height={44} textColor={theme.colors.danger} onPress={() => setConfirmDelete(true)}>Delete workout</SecondaryButton>}
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
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
      {items.length ? <View style={{ gap: 4 }}><AppText size={16} weight="bold">Partner workouts</AppText><AppText size={12} muted>Both partners check in to count toward your goal.</AppText></View> : null}
      {status === "loading" ? <AppText muted>Loading workouts...</AppText> : null}
      {status === "error" && message ? <AppText color={theme.colors.danger}>{message}</AppText> : null}
      {status === "ready" && items.length === 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Icon source={icons.calendarMuted} size={16} tint={theme.colors.muted} /><AppText size={12} muted>No upcoming partner workouts</AppText></View>
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
    gap: 16,
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
    gap: 8,
    justifyContent: "space-between",
  },
  weekDay: {
    alignItems: "center",
    borderRadius: 8,
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
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderWidth: 0,
    maxHeight: "88%",
    maxWidth: 430,
    overflow: "hidden",
    width: "100%",
  },
  goalSheet: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
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
    paddingVertical: 18,
    paddingHorizontal: 6,
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
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  calendarWeekLabels: {
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  calendarWeekLabel: {
    textAlign: "center",
    width: "14.285714%",
  },
  calendarGrid: {
    alignSelf: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    width: "100%",
  },
  calendarDay: {
    alignItems: "center",
    borderRadius: 6,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: "14.285714%",
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
