import { useEffect, useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppText, Icon, ScrollBody } from "./ui";
import { icons } from "@/assets";
import { LiftProgression } from "./lift-progression";
import { SaveFeedback } from "./save-feedback";
import { useAppData, daysFromToday, type SessionLog } from "@/state/app-data";
import { exerciseOptions, loadExerciseCatalog } from "@/lib/exercise-catalog";
import { uniqueWorkoutTemplates, parseWorkoutDraft, type DraftExercise, type WorkoutDraft } from "@/lib/workout-drafts";
import { draftSets, validDraftSet } from "@/lib/workout-logging";
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
const blank = (): DraftExercise => ({ id: uid(), exercise: "Bench press", customName: "", sets: "3", reps: "8", weight: "60", unit: "kg" });
function hasWorkoutProgress(draft: WorkoutDraft) {
  if (draft.started !== undefined) return draft.started;
  const row = draft.rows[0];
  return !!(draft.title.trim() || draft.notes.trim() || draft.workoutOrigin === "template" || draft.rows.length !== 1 || draft.durationMinutes !== undefined && draft.durationMinutes !== 45 || row && (row.exercise !== "Bench press" || row.customName || row.sets !== "3" || row.reps !== "8" || row.weight !== "60" || row.unit !== "kg" || row.setValues?.some(set => set.completed)));
}
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
function Field({ label, value, onChangeText, numeric, placeholder, style, disabled }: { label: string; value: string; onChangeText: (v: string) => void; numeric?: boolean; placeholder?: string; style?: React.ComponentProps<typeof View>["style"]; disabled?: boolean }) {
  const palette = useTrainPalette();
  return <View style={[{ flex: 1, minWidth: 0, gap: 12 }, style]}><T size={16}>{label}</T><TextInput accessibilityLabel={label} value={value} editable={!disabled} onChangeText={onChangeText} keyboardType={numeric ? "decimal-pad" : "default"} placeholder={placeholder} placeholderTextColor={palette.muted} style={[s.input, { backgroundColor: palette.field, color: palette.text, borderColor: palette.border }]} /></View>;
}
function Sheet({ children, title, onClose, busy }: { children: ReactNode; title: string; onClose: () => void; busy?: boolean }) {
  const palette = useTrainPalette(); const theme = useAppTheme();
  return <Modal transparent visible animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[s.overlay, { backgroundColor: theme.colors.modalOverlay }]}><View accessibilityViewIsModal style={[s.sheet, { backgroundColor: palette.background, borderColor: palette.border }]}><ScrollBody contentContainerStyle={{ padding: 20, gap: 24 }}><View style={s.row}><T size={24} weight="bold" style={{ flex: 1 }}>{title}</T><Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={`Close ${title.toLowerCase()}`} onPress={onClose} style={s.iconButton}><T size={28} muted>×</T></Pressable></View>{children}</ScrollBody></View></KeyboardAvoidingView></Modal>;
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
        return draft && /^\d{4}-\d{2}-\d{2}$/.test(date) && hasWorkoutProgress(draft) && !logs.some(log => log.id === draft.recordId) ? { date, draft } : null;
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
    {checkIn}
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

function ExerciseRows({ rows, setRows, disabled, onChange }: { rows: DraftExercise[]; setRows: React.Dispatch<React.SetStateAction<DraftExercise[]>>; disabled: boolean; onChange?: () => void }) {
  const palette = useTrainPalette();
  const [picking, setPicking] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => { let active = true; void loadExerciseCatalog(AsyncStorage).then(catalog => { if (active) setNames(catalog.names); }); return () => { active = false; }; }, []);
  const changeRows = (update: React.SetStateAction<DraftExercise[]>) => { onChange?.(); setRows(update); };
  const unit = rows[0]?.unit ?? "kg";
  function changeUnits(next: "kg" | "lb") {
    changeRows(current => current.map(row => {
      if (row.unit === next) return row;
      const factor = next === "kg" ? 0.45359237 : 1 / 0.45359237;
      const convert = (value: string) => value.trim() && Number.isFinite(Number(value)) ? String(Math.round(Number(value) * factor * 100) / 100) : value;
      return { ...row, unit: next, weight: convert(row.weight), setValues: row.setValues?.map(set => ({ ...set, weight: convert(set.weight) })) };
    }));
  }
  const update = (id: string, patch: Partial<DraftExercise>) => changeRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row));
  function replaceSets(row: DraftExercise, sets: NonNullable<DraftExercise["setValues"]>) {
    update(row.id, { sets: String(sets.length), reps: sets[0].reps, weight: sets[0].weight, setValues: sets });
  }
  function changeSet(row: DraftExercise, index: number, patch: { reps?: string; weight?: string }) {
    replaceSets(row, draftSets(row).map((set, i) => i === index ? { ...set, ...patch } : set));
  }
  return <><View style={[s.row, { justifyContent: "space-between" }]}><T size={14} muted>Weight unit</T><View style={s.row}>{(["kg", "lb"] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Use ${value} for all exercises`} accessibilityState={{ selected: rows.every(row => row.unit === value) }} disabled={disabled} onPress={() => changeUnits(value)} style={[s.action, { minWidth: 56, backgroundColor: rows.every(row => row.unit === value) ? TRAIN_LIME : palette.field }]}><T size={14} weight="semibold" color={rows.every(row => row.unit === value) ? "#0b1000" : palette.text}>{value}</T></Pressable>)}</View></View><View style={[s.row, { justifyContent: "space-between" }]}><T size={19} weight="medium">Exercises</T><Pressable disabled={disabled || rows.length >= 30} accessibilityRole="button" accessibilityLabel="Add exercise" onPress={() => changeRows(current => [...current, { ...blank(), unit }])} style={[s.row, { minHeight: 44 }]}><T size={23}>+</T><T size={15}>Add exercise</T></Pressable></View>{rows.map((row, index) => <View key={row.id} style={{ gap: 20, paddingBottom: 24, borderBottomWidth: 1, borderColor: palette.border }}><T size={16}>Lift</T><View style={s.row}><Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={`Choose lift ${index + 1}`} accessibilityState={{ expanded: picking === row.id }} onPress={() => { setPicking(picking === row.id ? null : row.id); setSearch(""); }} style={[s.input, s.row, { flex: 1, justifyContent: "space-between", backgroundColor: palette.field, borderColor: palette.border }]}><T size={17}>{row.exercise === "Other" ? row.customName || "Custom exercise" : row.exercise}</T><T size={20}>⌄</T></Pressable><Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={`Remove exercise ${index + 1}`} onPress={() => changeRows(current => current.filter(item => item.id !== row.id))} style={s.iconButton}><T size={25}>×</T></Pressable></View>{picking === row.id ? <View style={{ gap: 12 }}><TextInput accessibilityLabel="Search exercises" placeholder="Search exercises" placeholderTextColor={palette.muted} value={search} onChangeText={setSearch} style={[s.input, { backgroundColor: palette.field, borderColor: palette.border, color: palette.text }]} /><ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={{ maxHeight: 220 }}>{exerciseOptions(names, search).filter(name => name !== "Choose exercise").slice(0, 30).map(name => <Pressable key={name} disabled={disabled} accessibilityRole="button" onPress={() => { update(row.id, { exercise: name, customName: name === "Other" ? search.trim() : "" }); setPicking(null); }} style={{ padding: 14, minHeight: 44 }}><T>{name === "Other" ? "Custom exercise" : name}</T></Pressable>)}</ScrollView></View> : null}{row.exercise === "Other" ? <Field label="Exercise name" value={row.customName} onChangeText={customName => update(row.id, { customName })} disabled={disabled} /> : null}<View style={{ gap: 12 }}>{draftSets(row).map((set, setIndex) => <View key={setIndex} style={[s.row, { alignItems: "flex-end" }]}><T size={12} muted style={{ minWidth: 36, paddingBottom: 16 }}>{`Set ${setIndex + 1}`}</T><Field label="Reps" value={set.reps} numeric disabled={disabled} onChangeText={reps => changeSet(row, setIndex, { reps })} /><Field label={`Weight (${row.unit})`} value={set.weight} numeric disabled={disabled} onChangeText={weight => changeSet(row, setIndex, { weight })} /><Pressable accessibilityRole="button" accessibilityLabel={`Remove set ${setIndex + 1} from exercise ${index + 1}`} disabled={disabled || draftSets(row).length <= 1} onPress={() => replaceSets(row, draftSets(row).filter((_, i) => i !== setIndex))} style={s.iconButton}><T size={20} muted>×</T></Pressable></View>)}<Action label="+ Add set" disabled={disabled || draftSets(row).length >= 100} onPress={() => { const sets = draftSets(row); replaceSets(row, [...sets, { ...sets[sets.length - 1], completed: false }]); }} /></View></View>)}</>;
}
function validRows(rows: DraftExercise[]) {
  return rows.length > 0 && rows.length <= 30 && rows.every(row => (row.exercise === "Other" ? row.customName : row.exercise).trim() && row.sets.trim() && Number.isInteger(Number(row.sets)) && Number(row.sets) >= 1 && Number(row.sets) <= 100 && draftSets(row).every(set => validDraftSet(set) && Number(set.weight) <= 10000));
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
  return <Sheet title={log.title} onClose={onClose} busy={busy}><T muted>{log.date}{log.durationMinutes !== undefined ? ` · ${log.durationMinutes} minutes` : ""}</T>{log.exercises?.map(e => <View key={e.id} style={{ borderBottomWidth: 1, borderColor: palette.border, paddingVertical: 12, gap: 10 }}><T weight="semibold">{e.name}</T><T muted>{e.setDetails?.map(set => `${set.reps} reps × ${set.weight} ${e.unit}`).join(" · ") ?? `${e.sets} × ${e.reps} · ${e.weight} ${e.unit}`}</T></View>)}{message ? <T accessibilityLiveRegion="polite">{message}</T> : null}{canSaveTemplate ? <Action label="Save as template" disabled={busy || !accountUserId || !log.exercises?.length} onPress={() => void saveTemplate()} /> : null}<Action label="Edit workout" disabled={busy} onPress={onEdit} /></Sheet>;
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
function PrototypeWorkout({ date, templates, initialTemplate, onClose }: { date: string; templates: Template[]; initialTemplate?: Template; onClose: () => void }) {
  const { logWorkout, logs, foodJournalReady, saveWorkspaceSetting, accountUserId } = useAppData();
  const [sourceTemplateId, setSourceTemplateId] = useState<string | undefined>(initialTemplate?.id);
  const [workoutOrigin, setWorkoutOrigin] = useState<"manual" | "template">(initialTemplate ? "template" : "manual");
  const [started, setStarted] = useState(!!initialTemplate);
  const [title, setTitle] = useState(initialTemplate?.title ?? "");
  const [minutes, setMinutes] = useState(String(initialTemplate?.durationMinutes ?? 45));
  const [rows, setRows] = useState<DraftExercise[]>(() => initialTemplate?.rows.map(row => ({ ...row, id: uid(), setValues: row.setValues?.map(set => ({ ...set, completed: false })) })) ?? [blank()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [discarding, setDiscarding] = useState<"top" | "bottom" | null>(null);
  const locked = useRef(false), id = useRef(`log-${uid()}`);
  const draft = useSavedDraft(`draft:train-log:${date}`, content => {
    if (initialTemplate) return;
    const recovered = parseWorkoutDraft(content);
    if (!recovered || logs.some(log => log.id === recovered.recordId)) return;
    setSourceTemplateId(recovered.sourceTemplateId); setWorkoutOrigin(recovered.workoutOrigin ?? "manual"); setTitle(recovered.title); setMinutes(String(recovered.durationMinutes ?? 45)); setRows(recovered.rows); setStarted(hasWorkoutProgress(recovered));
    if (recovered.recordId) id.current = recovered.recordId;
  });
  useEffect(() => {
    if (!draft.ready) return;
    void draft.save(JSON.stringify({ title, notes: "", rows, workoutOrigin, sourceTemplateId, durationMinutes: Number(minutes) >= 1 && Number.isInteger(Number(minutes)) && Number(minutes) <= 1440 ? Number(minutes) : undefined, recordId: id.current, workoutDate: date, started }));
  }, [title, minutes, rows, workoutOrigin, sourceTemplateId, started, draft.ready]);
  function markStarted() { if (!started) setStarted(true); }
  async function closeWorkout() {
    await draft.save(JSON.stringify({ title, notes: "", rows, workoutOrigin, sourceTemplateId, durationMinutes: Number(minutes) >= 1 && Number.isInteger(Number(minutes)) && Number(minutes) <= 1440 ? Number(minutes) : undefined, recordId: id.current, workoutDate: date, started }));
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
    return <View style={{ gap: 10 }}><T size={13}>Discard this unfinished workout? Its saved progress will be deleted.</T><View style={[s.row, { flexWrap: "wrap" }]}><Action label="Keep workout" disabled={busy} onPress={() => setDiscarding(null)} /><Action label={busy ? "Discarding…" : "Discard workout"} disabled={busy || !draft.ready} onPress={() => void discardWorkout()} /></View></View>;
  }
  const templateId = useRef(`workout-plan:${uid()}`);
  async function saveTemplate() {
    if (locked.current || !draft.ready) return;
    if (!title.trim() || !validRows(rows) || !minutes.trim() || !Number.isInteger(Number(minutes)) || Number(minutes) < 1 || Number(minutes) > 1440) { setError("Enter a name, duration, and valid exercise values before saving a template."); return; }
    if (!accountUserId) { setError("Sign in to save templates."); return; }
    locked.current = true; setBusy(true);
    try { const saved = await saveWorkspaceSetting(templateId.current, JSON.stringify({ title: title.trim(), notes: "", durationMinutes: Number(minutes), rows }), accountUserId, Date.now()); setError(saved ? "Template saved. No workout was logged." : "Could not save your template. Try again."); }
    catch { setError("Could not save your template. Try again."); }
    finally { locked.current = false; setBusy(false); }
  }
  async function save() {
    if (locked.current || !draft.ready) return;
    if (!title.trim() || !validRows(rows) || !minutes.trim() || !Number.isInteger(Number(minutes)) || Number(minutes) < 1 || Number(minutes) > 1440) { setError("Enter a workout name, 1–1440 minutes, and valid sets, reps, and weights for every exercise."); return; }
    const exercises = rows.map(row => ({ id: row.id, name: (row.exercise === "Other" ? row.customName : row.exercise).trim(), sets: Number(row.sets), reps: Number(row.reps), weight: Number(row.weight), unit: row.unit, setDetails: draftSets(row).map(set => ({ reps: Number(set.reps), weight: Number(set.weight) })) }));
    if (!validWorkoutExercises(exercises)) { setError("Review your exercise values before saving."); return; }
    locked.current = true; setBusy(true); setError("");
    try { if (await logWorkout(title.trim(), undefined, date, { exercises, durationMinutes: Number(minutes), workoutOrigin, sourceTemplateId }, id.current)) { await draft.clear(); onClose(); } else setError("Could not save your workout. Your entries are still here; try again."); }
    catch { setError("Could not save your workout. Please try again."); }
    finally { locked.current = false; setBusy(false); }
  }
  return <Sheet title={started ? "Resume workout" : "Log workout"} onClose={() => { void closeWorkout(); }} busy={busy}><View style={[s.row, { justifyContent: "space-between", flexWrap: "wrap" }]}><T size={17} muted>{dateOf(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · Make the work count.</T>{started ? <Pressable accessibilityRole="button" disabled={busy || !draft.ready} onPress={() => setDiscarding("top")} style={[s.action, { minHeight: 42, borderColor: "#C94B4B", opacity: busy || !draft.ready ? 0.45 : 1 }]}><T size={14} weight="semibold" color="#B42318">Discard workout</T></Pressable> : null}</View>{discardConfirmation("top")}{templates.length ? <View style={{ gap: 10 }}><T size={13} muted>Start from a template</T><View style={[s.row, { flexWrap: "wrap" }]}>{templates.map(plan => <Action key={plan.id} label={plan.title} disabled={busy || !draft.ready} onPress={() => { markStarted(); setSourceTemplateId(plan.id); setWorkoutOrigin("template"); setTitle(plan.title); setMinutes(String(plan.durationMinutes ?? 45)); setRows(plan.rows.map(row => ({ ...row, id: uid(), setValues: row.setValues?.map(set => ({ ...set, completed: false })) }))); }} />)}</View></View> : null}<View style={[s.row, { alignItems: "flex-start", gap: 16 }]}><Field label="Workout name" placeholder="e.g. Push day" value={title} onChangeText={v => { markStarted(); setTitle(v.slice(0, 100)); }} disabled={busy || !draft.ready} /><Field label="Minutes" numeric value={minutes} onChangeText={v => { markStarted(); setMinutes(v); }} style={{ flex: 0.3, minWidth: 80 }} disabled={busy || !draft.ready} /></View><ExerciseRows rows={rows} setRows={setRows} onChange={markStarted} disabled={busy || !draft.ready} />{error ? <T color="#ff7878" accessibilityRole="alert">{error}</T> : null}<SaveFeedback area="workouts" /><Action label={busy ? "Saving…" : "✓  Save workout"} primary disabled={busy || !foodJournalReady || !draft.ready} onPress={() => void save()} />{workoutOrigin === "manual" ? <Action label="Save as template" disabled={busy || !foodJournalReady || !draft.ready} onPress={() => void saveTemplate()} /> : null}{started ? <View style={{ gap: 10, paddingTop: 8, borderTopWidth: 1, borderColor: "#D6DCE0" }}><Pressable accessibilityRole="button" disabled={busy || !draft.ready} onPress={() => setDiscarding("bottom")} style={[s.action, { borderColor: "#C94B4B", opacity: busy || !draft.ready ? 0.45 : 1 }]}><T size={14} weight="semibold" color="#B42318">Discard workout</T></Pressable>{discardConfirmation("bottom")}</View> : null}</Sheet>;
}
function PrototypePlan({ templates, splits, onClose }: { templates: Template[]; splits: Split[]; onClose: () => void }) {
  const { accountUserId, saveWorkspaceSetting, foodJournalReady } = useAppData();
  const currentSplit = splits.at(-1);
  const [modifyingSplit, setModifyingSplit] = useState(false);
  const [mode, setMode] = useState<"template" | "split">("template");
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<DraftExercise[]>(() => [blank()]);
  const [minutes, setMinutes] = useState("45");
  const [days, setDays] = useState<string[]>(Array(7).fill(""));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const locked = useRef(false), templateId = useRef(`workout-plan:${uid()}`), splitId = useRef(`workout-split:${uid()}`);
  async function save() {
    if (locked.current) return;
    if (!title.trim() || (mode === "template" ? !validRows(rows) || !minutes.trim() || !Number.isInteger(Number(minutes)) || Number(minutes) < 1 || Number(minutes) > 1440 : !days.some(Boolean))) { setMessage(mode === "template" ? "Enter a template name, duration, and valid exercise values." : "Name your split and choose a template for at least one day."); return; }
    if (!accountUserId) { setMessage("Sign in to save your workout plan."); return; }
    locked.current = true; setBusy(true); setMessage("");
    try {
      const saved = await saveWorkspaceSetting(mode === "template" ? editing ?? templateId.current : currentSplit?.id ?? splitId.current, JSON.stringify(mode === "template" ? { title: title.trim(), notes: "", rows, durationMinutes: Number(minutes) } : { title: title.trim(), days }), accountUserId, Date.now());
      if (saved) { if (mode === "split" || editing) { onClose(); return; } setMessage("Template saved. You can use it when logging workouts or building a split."); templateId.current = `workout-plan:${uid()}`; setEditing(null); }
      else setMessage("Could not save your plan. Your entries are still here; try again.");
    } catch { setMessage("Could not save your plan. Please try again."); }
    finally { locked.current = false; setBusy(false); }
  }
  return <Sheet title={editing ? "Edit workout template" : "Create workout plan"} onClose={onClose} busy={busy}>{!editing ? <><T muted>Build reusable workout templates and arrange your weekly split.</T><View style={s.row}><Action label="Workout template" primary={mode === "template"} disabled={busy} onPress={() => { setMode("template"); setTitle(""); setMessage(""); }} /><Action label="Weekly split" primary={mode === "split"} disabled={busy} onPress={() => { setMode("split"); setTitle(currentSplit?.title ?? ""); setDays(currentSplit?.days ?? Array(7).fill("")); setModifyingSplit(!currentSplit); setEditing(null); setMessage(""); }} /></View></> : null}{mode === "template" || modifyingSplit ? <Field label={mode === "template" ? "Template name" : "Split name"} value={title} onChangeText={v => setTitle(v.slice(0, 100))} placeholder={mode === "template" ? "e.g. Push day" : "e.g. Push / Pull / Legs"} disabled={busy} /> : null}{mode === "template" ? <><Field label="Minutes" numeric value={minutes} onChangeText={setMinutes} disabled={busy} /><ExerciseRows rows={rows} setRows={setRows} disabled={busy} />{!editing && templates.length ? <View style={{ gap: 12 }}><T weight="semibold">Saved templates</T>{templates.map(plan => <Action key={plan.id} label={`Edit ${plan.title}`} disabled={busy} onPress={() => { setEditing(plan.id); setTitle(plan.title); setMinutes(String(plan.durationMinutes ?? 45)); setRows(plan.rows.map(row => ({ ...row, id: uid(), setValues: row.setValues?.map(set => ({ ...set, completed: false })) }))); }} />)}</View> : null}</> : <>{currentSplit && !modifyingSplit ? <View style={{ gap: 16 }}><T size={24} weight="bold">Your current split</T><T size={16} weight="semibold">{currentSplit.title}</T>{currentSplit.days.map((id, i) => <View key={weekdays[i]} style={[s.row, { justifyContent: "space-between" }]}><T size={12} muted>{weekdays[i]}</T><T size={14}>{templates.find(plan => plan.id === id)?.title ?? "Rest"}</T></View>)}<Action label="Modify current split" primary disabled={busy} onPress={() => setModifyingSplit(true)} /></View> : <>{!templates.length ? <T muted>Create a workout template first, then assign it to training days.</T> : null}{weekdays.map((day, i) => <View key={day} style={{ gap: 10 }}><T size={13} weight="semibold">{day}</T><View style={[s.row, { flexWrap: "wrap" }]}>{[{ id: "", title: "Rest" }, ...templates].map(plan => <Action key={plan.id} label={plan.title} primary={days[i] === plan.id} disabled={busy} onPress={() => setDays(current => current.map((v, index) => index === i ? plan.id : v))} />)}</View></View>)}</>}</>}{message ? <T accessibilityLiveRegion="polite">{message}</T> : null}{mode === "template" || modifyingSplit ? <Action label={busy ? "Saving…" : mode === "template" ? "Save template" : currentSplit ? "Save changes" : "Save split"} primary disabled={busy || !foodJournalReady} onPress={() => void save()} /> : null}</Sheet>;
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

