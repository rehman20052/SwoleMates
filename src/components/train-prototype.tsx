import { WorkoutPlanner } from './workout-planner';
import { WorkoutLogButton, WorkoutLogHeader, WorkoutSetEditor, WorkoutRecordedSets, WorkoutLogIcon, useWorkoutLogPalette } from './workout-log-editor';
import { useEffect, useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppText, Icon, ScrollBody } from "./ui";
import { icons } from "@/assets";
import { LiftProgression } from "./lift-progression";
import { TrainSaveFeedback as SaveFeedback } from "./train-ui";
import { useAppData, daysFromToday, type SessionLog } from "@/state/app-data";

import { uniqueWorkoutTemplates, parseWorkoutDraft, hasWorkoutDraftInput, type DraftExercise, type WorkoutDraft } from "@/lib/workout-drafts";
import { completedExercises, exerciseToDraft } from "@/lib/workout-logging";
import { validWorkoutExercises } from "@/lib/workout-session";
import { useSavedDraft } from "@/lib/use-saved-draft";
import { trainTokens, trainTextSize, TrainPrototypeContext, useTrainPalette } from "./train-ui";
import { ThemeScope, useAppTheme } from "@/theme";
import { ProgressVisibilityProvider, useProgressVisibility } from "./train-progress-bar";

export const TRAIN_LIME = "#bdf40b";
const trainingPhoto = require("../../assets/brand/train-prototype-gym.jpg");
const weekdays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dateOf = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const plus = (d: Date, n: number) => { const next = new Date(d); next.setDate(next.getDate() + n); return next; };
const monday = (s: string) => { const d = dateOf(s); return plus(d, -((d.getDay() + 6) % 7)); };
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function T({ muted, color, size, ...props }: React.ComponentProps<typeof AppText>) { const palette = useTrainPalette(); return <AppText {...props} size={trainTextSize(size)} color={color ?? (muted ? palette.muted : palette.text)} />; }
export function TrainAppearance({ active, children }: { active: boolean; children: ReactNode }) {
  const base = useAppTheme();
  if (!active) return <>{children}</>;
  const light = !base.isDark;
  const colors = light ? { ...base.colors, background: "#F5F6F2", surface: "#FFFFFF", surfaceRaised: "#F0F2EC", border: "#D6DCE0", text: "#252C31", muted: "#606A72", primary: TRAIN_LIME, accent: "#476600", success: "#476600", primaryText: "#11130F", primaryTint: "#EDF5D9", primaryDeep: "#E4EEC2", progressTrack: "#D6DCE0", panelBorder: "#D6DCE0", borderStrong: "#C8CEC0", segmentSurface: "#E5EAD8", actionSurface: "#EEF2E3", rowSurface: "#F0F2EC", insetSurface: "#F0F2EC", planSurface: "#F0F2EC", sheetOverlay: "rgba(17,19,15,0.36)", modalOverlay: "rgba(17,19,15,0.36)" } : { ...base.colors, background: "#080a0b", surface: "#111314", surfaceRaised: "#1b1e20", border: "#2a2e30", text: "#f5f5f5", muted: "#859099", primary: TRAIN_LIME, accent: TRAIN_LIME, success: TRAIN_LIME, primaryText: "#0b1000", primaryTint: "#212b13", primaryDeep: "#212b13", progressTrack: "#1b1e20", sheetOverlay: "rgba(0,0,0,0.75)", modalOverlay: "rgba(0,0,0,0.75)" };
  const theme = { ...base, colors, effects: { ...base.effects, cardShadow: light ? "0 3px 14px rgba(17,19,15,0.06)" : "none", actionShadow: "none", selectionShadow: "none" } };
  return <ThemeScope theme={theme}><TrainPrototypeContext.Provider value><ProgressVisibilityProvider>{children}</ProgressVisibilityProvider></TrainPrototypeContext.Provider></ThemeScope>;
}
function Action({ label, accessibilityLabel, style, onPress, primary, disabled }: { label: string; accessibilityLabel?: string; style?: React.ComponentProps<typeof View>["style"]; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  const palette = useTrainPalette();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label.replace(/^[+✓]\s*/, "")} disabled={disabled} onPress={onPress} style={[s.action, { backgroundColor: primary ? TRAIN_LIME : palette.surface, borderColor: primary ? TRAIN_LIME : palette.border, opacity: disabled ? 0.45 : 1 }, style]}><T display={false} size={trainTokens.type.button} weight="semibold" color={primary ? "#0b1000" : palette.text}>{label}</T></Pressable>;
}
function Sheet({ children, title, onClose, busy, compact = false, onDiscard }: { children: ReactNode; title: string; onClose: () => void; busy?: boolean; compact?: boolean; onDiscard?: () => void }) {
  const palette = useTrainPalette();
  const theme = useAppTheme();
  const logPalette = useWorkoutLogPalette();
  const header = <View style={s.row}>
    <AppText display={compact ? false : undefined} size={compact ? 17 : 24} weight="semibold" color={compact ? logPalette.text : palette.text} style={{ flex: 1 }}>{compact && /^(Log|Resume) workout$/.test(title) ? 'Workout log' : title}</AppText>
    {onDiscard ? <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel="Discard workout draft" onPress={onDiscard} style={{ minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' }}><AppText display={false} size={13} weight="medium" color={logPalette.danger}>Discard</AppText></Pressable> : null}
    <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={`Close ${title.toLowerCase()}`} onPress={onClose} style={s.iconButton}>{compact ? <WorkoutLogIcon name="close" color={logPalette.muted} size={19} /> : <T size={28} muted>×</T>}</Pressable>
  </View>;
  return <Modal transparent visible animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.overlay, { backgroundColor: theme.colors.modalOverlay }]}>
      <View accessibilityViewIsModal style={[s.sheet, { backgroundColor: palette.background, borderColor: palette.border }, compact && { maxWidth: 460, height: '92%', borderRadius: 20, overflow: 'hidden', backgroundColor: logPalette.background, borderColor: logPalette.border }]}>
        {compact ? <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, borderBottomWidth: 1, borderColor: logPalette.border }}>{header}</View> : null}
        <ScrollBody contentContainerStyle={{ padding: compact ? 16 : 20, gap: compact ? 20 : 24 }}>{compact ? null : header}{children}</ScrollBody>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

type Template = WorkoutDraft & { id: string };
type Split = { id?: string; title: string; days: string[] };
function readSplit(content: string): Split | null { try { const v = JSON.parse(content); return typeof v.title === "string" && Array.isArray(v.days) && v.days.length === 7 && v.days.every((d: unknown) => typeof d === "string") ? v : null; } catch { return null; } }

export function TrainPrototype({ onCalendar, onEditLog, onGoal, onEditFoods, checkIn }: { onCalendar: (date: string) => void; onEditLog: (log: SessionLog) => void; onGoal: () => void; onEditFoods: (date: string) => void; checkIn?: ReactNode }) {
  const { logs, foodEntries, weeklyWorkoutGoal, workspaceSettings, foodJournalReady, accountUserId } = useAppData();
  const palette = useTrainPalette();
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const visibility = useProgressVisibility();
  const wide = width >= 700;
  const today = daysFromToday(0);
  const [selected, setSelected] = useState(today);
  const [week, setWeek] = useState(() => monday(today));
  const [logging, setLogging] = useState(false);
  const [resumeWorkout, setResumeWorkout] = useState<{ date: string; draft: WorkoutDraft } | null>(null);
  const [planning, setPlanning] = useState(false);
  const [initialTemplate, setInitialTemplate] = useState<Template | undefined>();
  const [monthOpen, setMonthOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(dateOf(today).getFullYear(), dateOf(today).getMonth(), 1));
  const [detail, setDetail] = useState<SessionLog | null>(null);
  const [foodOverviewOpen, setFoodOverviewOpen] = useState(false);
  const days = Array.from({ length: 7 }, (_, i) => plus(week, i));
  const weekStart = iso(week), weekEnd = iso(days[6]);
  const weekLogs = logs.filter(log => log.date >= weekStart && log.date <= weekEnd);
  const dayLogs = logs.filter(log => log.date === selected).sort((a, b) => (b.loggedAt ?? "").localeCompare(a.loggedAt ?? ""));
  const dayFoods = foodEntries.filter(row => row.date === selected);
  const foodTotals = dayFoods.reduce((sum, row) => ({ calories: sum.calories + row.calories, protein: sum.protein + row.protein, carbs: sum.carbs + row.carbs, fats: sum.fats + row.fats }), { calories: 0, protein: 0, carbs: 0, fats: 0 });
  const calories = foodTotals.calories;
  const minutes = weekLogs.reduce((sum, log) => sum + (log.durationMinutes ?? 0), 0);
  const sets = weekLogs.reduce((sum, log) => sum + (log.exercises ?? []).reduce((n, e) => n + (e.setDetails?.length ?? e.sets), 0), 0);
  const workouts = new Set(weekLogs.map(log => log.date)).size;
  const range = `${week.toLocaleDateString("en-US", { month: "short" }).toUpperCase()} ${week.getDate()} – ${days[6].getMonth() !== week.getMonth() ? days[6].toLocaleDateString("en-US", { month: "short" }).toUpperCase() + " " : ""}${days[6].getDate()}`;
  const allTemplates: Template[] = workspaceSettings.flatMap(item => { if (!item.id.startsWith("workout-plan:") || typeof item.value !== "object") return []; const draft = parseWorkoutDraft(item.value.content); return draft ? [{ ...draft, id: item.id }] : []; });
  const templates = uniqueWorkoutTemplates(allTemplates);
  const splits = [...workspaceSettings].sort((a, b) => (typeof a.value === "object" ? a.value.updatedAt : 0) - (typeof b.value === "object" ? b.value.updatedAt : 0)).flatMap(item => { if (!item.id.startsWith("workout-split:") || typeof item.value !== "object") return []; const split = readSplit(item.value.content); return split ? [{ ...split, id: item.id }] : []; });
  const activeSplit = splits.at(-1);
  useEffect(() => {
    if (!accountUserId || !foodJournalReady || logging) return;
    let active = true;
    void (async () => {
      const candidates = new Map<string, { updatedAt: number; content: string }>();
      for (const item of workspaceSettings) {
        if (item.id.startsWith("draft:train-log:") && typeof item.value === "object") candidates.set(item.id, { updatedAt: item.value.updatedAt, content: item.value.content });
      }
      try {
        const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(`swolemates.draft.${accountUserId}.draft:train-log:`));
        const local = await AsyncStorage.multiGet(keys);
        for (const [key, raw] of local) {
          if (!raw) continue;
          try {
            const value = JSON.parse(raw);
            const id = key.slice(`swolemates.draft.${accountUserId}.`.length);
            if (typeof value.content === "string" && Number.isFinite(value.updatedAt) && (!candidates.has(id) || value.updatedAt >= candidates.get(id)!.updatedAt)) candidates.set(id, value);
          } catch { /* Ignore damaged local draft records. */ }
        }
      } catch { /* Cloud-synced drafts remain available if local storage is unavailable. */ }
      const latest = [...candidates.entries()].sort((a, b) => b[1].updatedAt - a[1].updatedAt);
      const found = latest.map(([id, item]) => {
        const draft = item.content ? parseWorkoutDraft(item.content) : null;
        const date = draft?.workoutDate ?? id.slice("draft:train-log:".length);
        return draft && /^\d{4}-\d{2}-\d{2}$/.test(date) && hasWorkoutDraftInput(draft, allTemplates) && !logs.some(log => log.id === draft.recordId) ? { date, draft } : null;
      }).find(Boolean) ?? null;
      if (active) setResumeWorkout(found);
    })();
    return () => { active = false; };
  }, [accountUserId, foodJournalReady, workspaceSettings, logs, logging]);
  const plannedTemplate = allTemplates.find(template => template.id === activeSplit?.days[(dateOf(selected).getDay() + 6) % 7]);
  const todayTemplate = allTemplates.find(template => template.id === activeSplit?.days[(dateOf(today).getDay() + 6) % 7]);
  const todayCompleted = todayTemplate && logs.some(log => log.date === today && log.title.trim().toLowerCase() === todayTemplate.title.trim().toLowerCase());
  function moveWeek(n: number) { const next = plus(week, n * 7); setWeek(next); setSelected(iso(plus(dateOf(selected), n * 7))); }
  function resumeActiveWorkout() { if (!resumeWorkout) return; setSelected(resumeWorkout.date); setWeek(monday(resumeWorkout.date)); setInitialTemplate(undefined); setLogging(true); }
  function startTemplate(template: Template) { setInitialTemplate(template); setLogging(true); }
  return <ScrollBody ref={visibility.setViewport} onScroll={visibility.check} onLayout={visibility.check} scrollEventThrottle={32} contentContainerStyle={{ padding: wide ? 24 : 16, paddingBottom: 40, gap: 28, width: "100%", maxWidth: 960, alignSelf: "center" }}>
    <View style={[s.row, { flexWrap: "wrap", gap: 20, paddingTop: 8, paddingBottom: 6 }]}>
      <View style={{ flex: 1, minWidth: 230, gap: 12 }}><T size={wide ? 44 : 34} weight="bold">Training<T size={wide ? 44 : 34} color={TRAIN_LIME}>.</T></T><T size={15} muted>Show up. Put in the work. Get stronger.</T></View>
      <View style={[s.row, { flexWrap: "wrap", gap: 10 }]}><Action label="Create workout plan" onPress={() => setPlanning(true)} /><Action label={resumeWorkout ? "↻  Resume workout" : "+  Log workout"} primary disabled={!foodJournalReady || !resumeWorkout && selected > today} onPress={() => { if (resumeWorkout) resumeActiveWorkout(); else setLogging(true); }} /></View>
    </View>
    {checkIn}
    {foodJournalReady && todayTemplate ? <View style={[s.card, { backgroundColor: theme.isDark ? "#141b0e" : "#F0F5E7", padding: 20, borderColor: theme.isDark ? "#43551b" : "#C8D8AC", gap: 12 }]}>
      <View style={[s.row, { flexWrap: "wrap", justifyContent: "space-between" }]}>
        <View style={{ flex: 1, minWidth: 180, gap: 8 }}>
          <T size={12} color={theme.colors.accent} weight="semibold">{todayCompleted ? "TODAY’S WORKOUT · LOGGED" : "TODAY’S WORKOUT"}</T>
          <T size={24} weight="bold">{todayCompleted ? `${todayTemplate.title} complete!` : `Today is ${todayTemplate.title.replace(/[!]+$/, "")}!`}</T>
          <T size={14} muted>{todayCompleted ? "You showed up. Keep the momentum going." : "Make time to get your workout in today."}</T>
          <T size={12} muted>{activeSplit?.title} · {todayTemplate.rows.length} exercises{todayTemplate.durationMinutes ? ` · ${todayTemplate.durationMinutes} min` : ""}</T>
        </View>
        {!todayCompleted ? <Action label={resumeWorkout ? "Resume workout" : "Start today’s workout"} primary onPress={() => { if (resumeWorkout) resumeActiveWorkout(); else { setSelected(today); setWeek(monday(today)); startTemplate(todayTemplate); } }} /> : null}
      </View>
    </View> : null}
    <View style={[s.card, { backgroundColor: palette.surface, borderColor: palette.border, padding: wide ? 30 : 18, gap: 28 }]}>
      <View style={[s.row, { flexWrap: "wrap", justifyContent: "space-between" }]}><T size={23} weight="bold">Your activity</T><Pressable accessibilityRole="button" accessibilityLabel="Toggle month calendar" accessibilityState={{ expanded: monthOpen }} onPress={() => { setMonth(new Date(dateOf(selected).getFullYear(), dateOf(selected).getMonth(), 1)); setMonthOpen(!monthOpen); }} style={[s.row, { minHeight: 44 }]}><Icon source={icons.calendarMuted} size={20} tint={palette.muted} /><T size={16} weight="medium">{(monthOpen ? month : dateOf(selected)).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</T><T size={20}>⌄</T></Pressable></View>
      <View style={[s.row, { justifyContent: "space-between" }]}><T size={12} muted style={{ letterSpacing: 2 }}>{range}</T><View style={s.row}><Pressable accessibilityRole="button" accessibilityLabel="Previous week" onPress={() => moveWeek(-1)} style={s.iconButton}><T size={28}>‹</T></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Next week" onPress={() => moveWeek(1)} style={s.iconButton}><T size={28}>›</T></Pressable></View></View>
      {monthOpen ? <View style={{ gap: 8 }}><View style={[s.row, { justifyContent: "space-between" }]}><Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} style={s.iconButton}><T size={24}>‹</T></Pressable><T>{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</T><Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} style={s.iconButton}><T size={24}>›</T></Pressable></View><View style={[s.row, { gap: 0 }]}>{weekdays.map(day => <T key={day} size={11} muted style={{ flex: 1, textAlign: "center" }}>{day[0]}</T>)}</View>{Array.from({ length: 6 }, (_, row) => <View key={row} style={[s.row, { gap: 0 }]}>{Array.from({ length: 7 }, (_, col) => { const d = plus(monday(iso(month)), row * 7 + col); const active = iso(d) === selected, logged = logs.some(log => log.date === iso(d)); return <Pressable key={col} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`Select ${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}${logged ? ", workout logged" : ""}`} onPress={() => { setSelected(iso(d)); setWeek(monday(iso(d))); }} style={{ flex: 1, minHeight: 48, borderRadius: 6, justifyContent: "center", alignItems: "center", gap: 5, opacity: d.getMonth() === month.getMonth() ? 1 : 0.35, backgroundColor: active ? TRAIN_LIME : "transparent" }}><T color={active ? "#101500" : palette.text}>{d.getDate()}</T><View style={{ height: 4, width: 4, borderRadius: 2, backgroundColor: logged ? active ? "#101500" : TRAIN_LIME : "transparent" }} /></Pressable>; })}</View>)}</View> : <View style={[s.row, { gap: wide ? 8 : 3 }]}>{days.map((d, i) => { const active = iso(d) === selected; return <Pressable key={iso(d)} accessibilityRole="button" accessibilityLabel={`View ${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`} accessibilityState={{ selected: active }} onPress={() => setSelected(iso(d))} style={{ flex: 1, borderRadius: 8, minHeight: wide ? 108 : 84, gap: 12, alignItems: "center", justifyContent: "center", backgroundColor: active ? TRAIN_LIME : "transparent" }}><T size={wide ? 12 : 10} color={active ? "#101500" : palette.muted}>{wide ? weekdays[i] : weekdays[i].slice(0, 1)}</T><T size={wide ? 24 : 20} weight="semibold" color={active ? "#101500" : palette.text}>{d.getDate()}</T><View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: logs.some(log => log.date === iso(d)) ? active ? "#101500" : TRAIN_LIME : "transparent" }} /></Pressable>; })}</View>}
      <View style={[s.row, { flexWrap: "wrap", justifyContent: "space-between", gap: 12 }]}>
        <View style={{ gap: 6 }}><T size={12} muted>Weekly goal</T><T accessibilityLabel="Calendar weekly goal progress" accessibilityLiveRegion="polite" size={18} weight="semibold" color={theme.colors.accent}>{workouts}/{weeklyWorkoutGoal}<T display={false} size={13} muted> workout days</T></T></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Set weekly goal" disabled={!foodJournalReady} onPress={onGoal} style={[s.row, { minHeight: 44, gap: 8, paddingLeft: 12, opacity: foodJournalReady ? 1 : 0.45 }]}><T display={false} size={14} weight="medium" muted>Edit goal</T><T display={false} size={16} muted>↗</T></Pressable>
      </View>
      <View style={s.separator} />
      <View style={[s.row, { justifyContent: "space-between" }]}><T size={16} weight="medium">{selected === today ? "Today" : dateOf(selected).toLocaleDateString("en-US", { weekday: "long" })}<T size={14} muted>{` · ${dateOf(selected).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}</T></T><T size={12} muted>{dayLogs.length} workout{dayLogs.length === 1 ? "" : "s"}</T></View>
      {dayLogs.length ? dayLogs.map(log => <Pressable key={log.id} accessibilityRole="button" accessibilityLabel={`View ${log.title}`} onPress={() => setDetail(log)} style={[s.row, { gap: wide ? 18 : 12, minHeight: 64 }]}><View style={[s.badge, { backgroundColor: theme.isDark ? "#212b13" : "#EDF5D9" }]}><Icon source={icons.training} size={trainTokens.iconSize} tint={theme.colors.accent} /></View><View style={{ flex: 1, gap: 10 }}><T size={18} weight="semibold">{log.title}</T><T size={13} muted>{log.exercises?.length ?? 0} exercises{log.durationMinutes !== undefined ? `  ·  ${log.durationMinutes} min` : ""}</T></View><View style={[s.status, { backgroundColor: theme.isDark ? "#212b13" : "#EDF5D9" }]}><T size={11} weight="semibold" color={theme.colors.accent}>Completed</T></View><T size={22}>↗</T></Pressable>) : <T size={14} muted>{foodJournalReady ? "No workouts logged for this day." : "Loading your activity…"}</T>}
      <View style={s.separator} /><View style={[s.row, { justifyContent: "space-between", flexWrap: "wrap" }]}><View style={s.row}><Icon source={icons.flame} size={20} tint="#ffa845" /><T size={16} muted>Calories eaten</T></View><View style={[s.row, { flexWrap: "wrap" }]}><T size={16} weight="semibold">{Math.round(calories).toLocaleString()}<T size={12} muted> kcal</T></T><Pressable accessibilityRole="button" accessibilityLabel="View foods and macros for selected day" disabled={!foodJournalReady} onPress={() => setFoodOverviewOpen(true)} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8, opacity: foodJournalReady ? 1 : 0.45 }}><T size={13} weight="medium" color={theme.colors.accent}>View foods ↗</T></Pressable></View></View>
      {plannedTemplate ? <View style={[s.row, { flexWrap: "wrap" }]}><View style={{ flex: 1, gap: 8, minWidth: 130 }}><T size={12} muted>Planned in your split</T><T weight="semibold">{plannedTemplate.title}</T></View><Action label="Start planned workout" disabled={selected > today || !!resumeWorkout} onPress={() => startTemplate(plannedTemplate)} /></View> : null}
    </View>
    {templates.length ? <WorkoutTemplates templates={templates} onUse={startTemplate} disabled={!!resumeWorkout} /> : null}
    <View style={{ height: wide ? 232 : 205, borderRadius: 12, overflow: "hidden", justifyContent: "center", backgroundColor: theme.isDark ? "#101214" : "#E8EDDF", borderWidth: 1, borderColor: palette.border }}>
      <Image source={trainingPhoto} contentFit="cover" style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.isDark ? "rgba(0,0,0,0.48)" : "rgba(0,0,0,0.22)" }]} />
      <View style={{ paddingHorizontal: wide ? 36 : 24, gap: 14, zIndex: 1 }}>
        <T size={12} weight="medium" color={theme.isDark ? TRAIN_LIME : "#D9FF62"} style={{ letterSpacing: 3, textShadowColor: "#000000", textShadowRadius: 5 }}>BUILT BY CONSISTENCY</T>
        <T size={wide ? 34 : 29} weight="bold" color="#FFFFFF" style={{ lineHeight: wide ? 44 : 38, textShadowColor: "#000000", textShadowRadius: 6 }}>{"Stronger than\nlast week."}</T>
        <T size={15} color="#FFFFFF" style={{ textShadowColor: "#000000", textShadowRadius: 5 }}>Every session is a step forward.</T>
      </View>
    </View>
    <LiftProgression prototype />
    <View style={[s.card, { backgroundColor: palette.surface, borderColor: palette.border, padding: wide ? 30 : 20, gap: 28 }]}>
      <View style={[s.row, { justifyContent: "space-between", flexWrap: "wrap" }]}><T size={23} weight="bold">Weekly recap</T><T size={12} muted style={{ letterSpacing: 2 }}>{range}</T></View>
      <View style={s.row}>{[{ value: workouts, label: "Workouts" }, { value: minutes, label: "Minutes trained" }, { value: sets, label: "Working sets" }].map((metric, i) => <View key={metric.label} style={{ flex: 1, gap: 14, paddingLeft: i ? (wide ? 24 : 10) : 0, borderLeftWidth: i ? 1 : 0, borderColor: palette.border }}><T size={wide ? 40 : 29} weight="medium">{metric.value}{i === 0 ? <T size={20} muted> / {weeklyWorkoutGoal}</T> : null}</T><T size={wide ? 13 : 11} muted>{metric.label}</T></View>)}</View>
      <View style={s.separator} />
      <View accessibilityLabel="Workouts by weekday" style={[s.row, { alignItems: "flex-end", gap: wide ? 18 : 8 }]}>{days.map((d, i) => { const count = weekLogs.filter(log => log.date === iso(d)).length; const max = Math.max(1, ...days.map(day => weekLogs.filter(log => log.date === iso(day)).length)); return <View key={iso(d)} accessibilityLabel={`${weekdays[i]}: ${count} workouts`} style={{ flex: 1, height: 126, justifyContent: "flex-end", gap: 16, alignItems: "center" }}><View style={{ width: "100%", height: count ? Math.max(20, count / max * 80) : 8, backgroundColor: count ? "#212b13" : palette.field, borderTopWidth: count ? 3 : 0, borderTopColor: TRAIN_LIME, borderTopLeftRadius: 5, borderTopRightRadius: 5 }} /><T size={11} muted>{weekdays[i][0]}</T></View>; })}</View>
      <Pressable accessibilityRole="button" accessibilityLabel="Edit weekly workout goal" onPress={onGoal} style={[s.row, { minHeight: 44, marginTop: 8 }]}><View style={[s.badge, { width: 40, height: 40 }]}><T size={23} color={TRAIN_LIME}>ϟ</T></View><T size={14} style={{ flex: 1 }}>{workouts >= weeklyWorkoutGoal ? "You hit your weekly goal. Keep showing up." : `${weeklyWorkoutGoal - workouts} more session${weeklyWorkoutGoal - workouts === 1 ? "" : "s"} to hit your weekly goal.`}</T></Pressable>
    </View>
    {foodOverviewOpen ? <Sheet title="Foods eaten" onClose={() => setFoodOverviewOpen(false)}>
      <View style={{ gap: 8 }}>
        <T size={13} muted>{dateOf(selected).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</T>
        <T size={18} weight="semibold">{Math.round(calories).toLocaleString()} kcal</T>
        <T size={12} muted>{`Protein ${Math.round(foodTotals.protein)}g · Carbs ${Math.round(foodTotals.carbs)}g · Fat ${Math.round(foodTotals.fats)}g`}</T>
      </View>
      <View style={{ gap: 0 }}>
        {dayFoods.length ? dayFoods.map(food => <View key={food.id} style={{ paddingVertical: 12, gap: 5, borderTopWidth: 1, borderColor: palette.border }}>
          <View style={[s.row, { alignItems: "flex-start", justifyContent: "space-between" }]}><T size={14} weight="medium" style={{ flex: 1 }}>{food.name}</T><T size={13}>{Math.round(food.calories)} kcal</T></View>
          <T size={11} muted>{`${food.meal} · P ${Math.round(food.protein)}g · C ${Math.round(food.carbs)}g · F ${Math.round(food.fats)}g`}</T>
        </View>) : <T size={14} muted>No foods logged for this day.</T>}
      </View>
      <Action label="Edit foods for this day" primary onPress={() => { setFoodOverviewOpen(false); onEditFoods(selected); }} />
    </Sheet> : null}
    <View style={[s.row, { justifyContent: "space-between", flexWrap: "wrap", paddingVertical: 16 }]}><T size={11} muted>YOUR ONLY COMPETITION IS YOU.</T><T size={11} muted>{`Your training data · ${dateOf(selected).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`}</T></View>
    {logging ? <PrototypeWorkout key={`${accountUserId}:${selected}`} date={selected} templates={templates} initialTemplate={initialTemplate} onClose={() => { setLogging(false); setInitialTemplate(undefined); }} /> : null}
    {detail ? <WorkoutDetail log={detail} onClose={() => setDetail(null)} onEdit={() => { onEditLog(detail); setDetail(null); }} /> : null}
    {planning ? <PrototypePlan templates={templates} splits={splits} onClose={() => setPlanning(false)} /> : null}
  </ScrollBody>;
}

function WorkoutDetail({ log, onClose, onEdit }: { log: SessionLog; onClose: () => void; onEdit: () => void }) {
  const { saveWorkspaceSetting, accountUserId, workspaceSettings } = useAppData();
  const palette = useTrainPalette();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const id = useRef(`workout-plan:${uid()}`);
  const canSaveTemplate = log.workoutOrigin !== "template" && !workspaceSettings.some(item => item.id.startsWith("workout-plan:") && typeof item.value === "object" && parseWorkoutDraft(item.value.content)?.title.trim().toLowerCase() === log.title.trim().toLowerCase());
  async function saveTemplate() {
    if (!canSaveTemplate || busy || !accountUserId || !log.exercises?.length) return;
    setBusy(true);
    try {
      const rows: DraftExercise[] = log.exercises.map(e => ({ id: uid(), exercise: e.name, customName: "", sets: String(e.sets), reps: String(e.reps), weight: String(e.weight), unit: e.unit, setValues: e.setDetails?.map(set => ({ reps: String(set.reps), weight: String(set.weight), completed: false })) }));
      const saved = await saveWorkspaceSetting(id.current, JSON.stringify({ title: log.title, notes: log.notes ?? "", durationMinutes: log.durationMinutes, rows }), accountUserId, Date.now());
      setMessage(saved ? "Template saved." : "Could not save this template. Try again.");
    } catch { setMessage("Could not save this template. Try again."); }
    finally { setBusy(false); }
  }
  return <Sheet compact title={log.title} onClose={onClose} busy={busy}><T muted>{log.date}{log.durationMinutes !== undefined ? ` · ${log.durationMinutes} minutes` : ""}</T><WorkoutRecordedSets exercises={log.exercises ?? []} />{message ? <T accessibilityLiveRegion="polite">{message}</T> : null}{canSaveTemplate ? <Action label="Save as template" disabled={busy || !accountUserId || !log.exercises?.length} onPress={() => void saveTemplate()} /> : null}<Action label="Edit workout" disabled={busy} onPress={onEdit} /></Sheet>;
}
function WorkoutTemplates({ templates, onUse, disabled }: { templates: Template[]; onUse: (template: Template) => void; disabled?: boolean }) {
  const { saveWorkspaceSetting, accountUserId, workspaceSettings } = useAppData();
  const palette = useTrainPalette();
  const [deleting, setDeleting] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function remove() {
    if (!deleting || busy || !accountUserId) return;
    setBusy(true); setError("");
    try { if (await saveWorkspaceSetting(deleting, "", accountUserId, Date.now())) setDeleting(null); else setError("Could not delete the template. Try again."); }
    catch { setError("Could not delete the template. Try again."); }
    finally { setBusy(false); }
  }
  return <View style={[s.card, { backgroundColor: palette.surface, borderColor: palette.border, padding: 20, gap: 22 }]}><T size={23} weight="bold">Workout templates</T>{templates.map(template => <View key={template.id} style={[s.row, { gap: 10 }]}><View style={{ flex: 1, minWidth: 0, gap: 8 }}><T weight="semibold" numberOfLines={2}>{template.title}</T><T size={12} muted>{template.rows.length} exercises{template.durationMinutes ? ` · ${template.durationMinutes} min` : ""}</T></View><Action label="Use" accessibilityLabel={`Use ${template.title}`} disabled={disabled} style={{ width: 84, height: 52, flexShrink: 0, paddingHorizontal: 12 }} onPress={() => onUse(template)} /><Pressable accessibilityRole="button" accessibilityLabel={`Delete ${template.title} template`} style={[s.iconButton, { width: 44, height: 52, flexShrink: 0, opacity: disabled ? 0.45 : 1 }]} disabled={disabled} onPress={() => setDeleting(template.id)}><T display={false} size={20} muted>×</T></Pressable></View>)}{disabled ? <T size={12} muted>Resume or finish your active workout before starting another.</T> : null}{deleting ? <View style={{ gap: 12 }}><T>Delete this template? Logged workouts will stay saved.</T><View style={[s.row, { flexWrap: "wrap" }]}><Action label="Cancel deletion" disabled={busy} onPress={() => setDeleting(null)} /><Action label="Delete template" disabled={busy} onPress={() => void remove()} /></View></View> : null}{error ? <T accessibilityRole="alert">{error}</T> : null}</View>;
}
export function PrototypeWorkout({ date, templates, initialTemplate, plannedWorkout, partnerName, partnerPhoto, onClose }: { date: string; templates: Template[]; initialTemplate?: Template; plannedWorkout?: import("@/lib/workouts").PlannedWorkout; partnerName?: string; partnerPhoto?: string | null; onClose: () => void }) {
  const { logWorkout, updateWorkoutLog, logs, foodJournalReady } = useAppData();
  const palette = useWorkoutLogPalette();
  const existing = plannedWorkout ? logs.find(log => log.plannedWorkoutId === plannedWorkout.id) : undefined;
  const [sourceTemplateId, setSourceTemplateId] = useState<string | undefined>(initialTemplate?.id);
  const [workoutOrigin, setWorkoutOrigin] = useState<"manual" | "template">(initialTemplate || plannedWorkout?.routine ? "template" : "manual");
  const [started, setStarted] = useState(false);
  const [title, setTitle] = useState(plannedWorkout ? plannedWorkout.routine?.title ?? '' : existing?.title ?? initialTemplate?.title ?? "");
  const [minutes, setMinutes] = useState(String(existing?.durationMinutes ?? initialTemplate?.durationMinutes ?? 45));
  const [durationEdited, setDurationEdited] = useState(false);
  const [rows, setRows] = useState<DraftExercise[]>(() => existing?.exercises?.map(e => exerciseToDraft(e, uid(), true)) ?? (plannedWorkout ? plannedWorkout.routine?.exercises.map(e => ({ id: uid(), exercise: e.name, customName: e.name, sets: String(e.sets), reps: String(e.reps), weight: "", unit: "lb" as const })) ?? [] : initialTemplate?.rows.map(row => ({ ...row, id: uid(), setValues: row.setValues?.map(set => ({ ...set, completed: false })) })) ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [discarding, setDiscarding] = useState<"top" | "bottom" | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const locked = useRef(false), id = useRef(`log-${uid()}`);
  const draft = useSavedDraft(plannedWorkout ? `draft:partner-log:${plannedWorkout.id}` : `draft:train-log:${date}`, content => {
    if (initialTemplate && !plannedWorkout) return;
    const recovered = parseWorkoutDraft(content);
    if (!recovered || logs.some(log => log.id === recovered.recordId)) return;
    // Old versions persisted their example exercise even before a workout began.
    // An untouched draft should open the same empty state as a new workout.
    if (!hasWorkoutDraftInput(recovered, templates)) { setRows([]); return; }
    setSourceTemplateId(recovered.sourceTemplateId); setWorkoutOrigin(recovered.workoutOrigin ?? "manual"); setTitle(plannedWorkout ? plannedWorkout.routine?.title ?? '' : recovered.title); setMinutes(recovered.durationInput ?? String(recovered.durationMinutes ?? 45)); setDurationEdited(!!recovered.durationEdited); setRows(recovered.rows); setStarted(hasWorkoutDraftInput(recovered, templates));
    if (recovered.recordId) id.current = recovered.recordId;
  });
  const hasInput = hasWorkoutDraftInput({ title, notes: '', rows, durationInput: minutes, durationEdited, inputVersion: 1, hasUserInput: started });
  const draftContent = JSON.stringify({ title, notes: '', rows, durationInput: minutes, durationEdited, inputVersion: 1, hasUserInput: hasInput, workoutOrigin, sourceTemplateId, durationMinutes: Number(minutes) >= 1 && Number.isInteger(Number(minutes)) && Number(minutes) <= 1440 ? Number(minutes) : undefined, recordId: id.current, workoutDate: date, started: hasInput });
  const savedInput = useRef(false);
  useEffect(() => {
    if (!draft.ready) return;
    if (hasInput) { savedInput.current = true; void draft.save(draftContent); }
    else if (savedInput.current) { savedInput.current = false; void draft.clear(); }
  }, [draftContent, hasInput, draft.ready]);
  function markStarted() { if (!started) setStarted(true); }
  async function closeWorkout() {
    if (draft.ready) { if (hasInput) await draft.save(draftContent); else await draft.clear(); }
    onClose();
  }
  async function discardWorkout() {
    if (busy || !draft.ready) return;
    locked.current = true; setBusy(true); setError("");
    try { await draft.clear(); onClose(); }
    catch { setError("Could not discard this workout. Please try again."); }
    finally { locked.current = false; setBusy(false); }
  }
  function discardConfirmation(location: "top" | "bottom") {
    if (discarding !== location) return null;
    return <View style={{ gap: 10 }}><T size={13}>Discard this unfinished workout? Its saved progress will be deleted.</T><View style={{ gap: 8 }}><WorkoutLogButton disabled={busy || !draft.ready} onPress={() => void discardWorkout()}>{busy ? "Discarding…" : "Discard workout"}</WorkoutLogButton><WorkoutLogButton disabled={busy} onPress={() => setDiscarding(null)}>Keep workout</WorkoutLogButton></View></View>;
  }
  async function save() {
    if (locked.current || !draft.ready) return;
    const workoutTitle = plannedWorkout ? plannedWorkout.routine?.title || 'Partner workout' : title.trim();
    if (!workoutTitle || !minutes.trim() || !Number.isInteger(Number(minutes)) || Number(minutes) < 1 || Number(minutes) > 1440) { setError(plannedWorkout ? 'Enter 1–1440 minutes.' : "Enter a workout name and 1–1440 minutes."); return; }
    const exercises = completedExercises(rows);
    if (!exercises.length) { setError("Check off at least one completed set before saving."); return; }
    if (!validWorkoutExercises(exercises)) { setError("Review your exercise values before saving."); return; }
    locked.current = true; setBusy(true); setError("");
    try { if (await (existing ? updateWorkoutLog(existing.id, { title: workoutTitle, exercises, durationMinutes: Number(minutes) }) : logWorkout(workoutTitle, undefined, date, { exercises, durationMinutes: Number(minutes), workoutOrigin, sourceTemplateId, ...(plannedWorkout ? { plannedWorkoutId: plannedWorkout.id, checkedIn: true, verified: plannedWorkout.attendedBy.length >= 2 } : {}) }, id.current))) { await draft.clear(); onClose(); } else setError("Could not save your workout. Your entries are still here; try again."); }
    catch { setError("Could not save your workout. Please try again."); }
    finally { locked.current = false; setBusy(false); }
  }
  return <Sheet compact onDiscard={() => setDiscarding('top')} title={hasInput ? 'Resume workout' : 'Log workout'} onClose={() => { void closeWorkout(); }} busy={busy}>
    {discardConfirmation('top')}
    <WorkoutLogHeader title={plannedWorkout ? plannedWorkout.routine?.title ?? '' : title} hideTitle={!!plannedWorkout && !plannedWorkout.routine} fixedTitle={!!plannedWorkout} onTitleChange={value => { markStarted(); setTitle(value); }} date={date} minutes={minutes} onMinutesChange={value => { markStarted(); setDurationEdited(true); setMinutes(value); }} disabled={busy || !draft.ready} partnerName={partnerName} partnerPhoto={partnerPhoto} />
    {!plannedWorkout && templates.length && !started ? <View style={{ gap: 10 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={showTemplates ? 'Hide routines' : 'Choose routine'} accessibilityState={{ expanded: showTemplates, disabled: busy || !draft.ready }} disabled={busy || !draft.ready} onPress={() => setShowTemplates(!showTemplates)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, minHeight: 80, borderRadius: 12, backgroundColor: palette.primary, opacity: busy || !draft.ready ? 0.4 : 1 }}>
        <WorkoutLogIcon name="dumbbell" size={26} color={palette.onPrimary} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText display={false} size={17} weight="semibold" color={palette.onPrimary}>{showTemplates ? 'Hide routines' : 'Choose routine'}</AppText>
          <AppText size={13} color={palette.onPrimary}>{templates.length} saved {templates.length === 1 ? 'routine' : 'routines'} · Start with your workout plan</AppText>
        </View>
        <WorkoutLogIcon name={showTemplates ? 'up' : 'down'} size={20} color={palette.onPrimary} />
      </Pressable>
      {showTemplates ? templates.map(plan => <WorkoutLogButton key={plan.id} disabled={busy || !draft.ready} onPress={() => { markStarted(); setSourceTemplateId(plan.id); setWorkoutOrigin('template'); setTitle(plan.title); setMinutes(String(plan.durationMinutes ?? 45)); setRows(plan.rows.map(row => ({ ...row, id: uid(), setValues: row.setValues?.map(set => ({ ...set, completed: false })) }))); setShowTemplates(false); }}>{plan.title}</WorkoutLogButton>) : null}
    </View> : null}
    <WorkoutSetEditor rows={rows} setRows={setRows} onChange={markStarted} disabled={busy || !draft.ready} preserveCompletionOnEdit={!!existing?.exercises?.length} history={logs.filter(log => log.id !== existing?.id && log.date <= date)} />
    {error ? <T color="#ff7878" accessibilityRole="alert">{error}</T> : null}<SaveFeedback area="workouts" />
    <WorkoutLogButton primary accessibilityLabel="Save workout" disabled={busy || !foodJournalReady || !draft.ready} onPress={() => void save()}>{busy ? 'Saving…' : 'Finish workout'}</WorkoutLogButton>
  </Sheet>;
}
function PrototypePlan({ templates, splits, onClose }: { templates: Template[]; splits: Split[]; onClose: () => void }) {
  return <WorkoutPlanner templates={templates} splits={splits} onClose={onClose} />;
}
const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  card: { backgroundColor: "transparent", borderWidth: 1, borderColor: "transparent", borderRadius: 12 },
  action: { minHeight: trainTokens.controlHeight, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  input: { height: trainTokens.controlHeight, borderRadius: 8, borderWidth: 1, borderColor: "transparent", backgroundColor: "transparent", color: "#111111", paddingHorizontal: 18, fontSize: trainTokens.type.label, fontFamily: "Barlow_400Regular" },
  separator: { height: 1, backgroundColor: "transparent" },
  badge: { width: 60, height: 60, borderRadius: 9, backgroundColor: "#212b13", alignItems: "center", justifyContent: "center" },
  status: { borderRadius: 6, backgroundColor: "#212b13", paddingHorizontal: 10, paddingVertical: 7 },
  iconButton: { minWidth: 44, minHeight: 44, justifyContent: "center", alignItems: "center" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", alignItems: "center", padding: 12 },
  sheet: { width: "100%", maxWidth: 740, maxHeight: "95%", borderRadius: 12, backgroundColor: "transparent", borderWidth: 1, borderColor: "transparent" },
});

