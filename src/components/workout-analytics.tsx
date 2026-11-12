import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo, ActivityIndicator, AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, View, findNodeHandle, useWindowDimensions, type GestureResponderEvent, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { useAppData, type SessionLog } from '@/state/app-data';
import { useWeightUnit } from '@/state/weight-unit';
import { analyticsExerciseId, analyticsExerciseKey, defaultAnalyticsLift, exerciseWorkload, prepareAnalyticsHistory, summarizeWorkoutAnalytics, dayDate, dayNumber, localDay, percentageChange, repWeightProfile, shiftDay, type AnalyticsRange, type StrengthMetric } from '@/lib/workout-analytics';
import { AppText, Input } from './ui';
import { useTrainPalette } from './train-ui';
import { useAppTheme } from '@/theme';
import { muscleBalance, muscleGroups, type MuscleGroup } from '@/lib/exercise-muscles';
import { WorkoutRecordedSets } from './workout-log-editor';
import { exerciseName } from '@/lib/workout-logging';
import type { WorkoutDraft } from '@/lib/workout-drafts';
import type { WeightUnit } from '@/lib/weight-unit';
import { ExerciseMusclePicker, useMuscleClassifications } from './exercise-muscle-picker';

const number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
const dateLabel = (day: string) => dayDate(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const recordLabels = { weight: 'Heaviest set', volume: 'Best session volume', reps: 'Most reps in one set' };
const metricLabels = { estimatedMax: 'Est. 1RM', weight: 'Heaviest set', volume: 'Session volume', reps: 'Best reps' };
type AnalyticsSelection = { range: AnalyticsRange; lift: { id: string; name: string } | null; metric: StrengthMetric | null };
const initialSelection: AnalyticsSelection = { range: 30, lift: null, metric: null };
const metricUnit = (metric: StrengthMetric, unit: WeightUnit) => metric === 'reps' ? 'reps' : metric === 'volume' ? unit + '·reps' : unit;
const dateSpan = (start: string, end: string) => start === end ? dateLabel(start) : dateLabel(start) + ' – ' + dateLabel(end);
const webPressed = (selected?: boolean) => Platform.OS === 'web' && selected !== undefined ? { 'aria-pressed': selected } : {};
const focusRing = (state: { pressed: boolean }, color: string) =>
  Platform.OS === 'web' && (state as { focused?: boolean }).focused ?
    ({ outlineColor: color, outlineWidth: 2, outlineStyle: 'solid', outlineOffset: -2 } as ViewStyle) : null;
const chartWidth = 600, chartHeight = 190, left = 14, right = 586, top = 20, bottom = 168;
function Text({ muted, ...props }: React.ComponentProps<typeof AppText>) { const p = useTrainPalette(); return <AppText display={false} {...props} color={props.color ?? (muted ? p.muted : p.text)} />; }
function Button({ children, onPress, selected, disabled, label, buttonRef }: { children: ReactNode; onPress: () => void; selected?: boolean; disabled?: boolean; label?: string; buttonRef?: React.Ref<View> }) {
  const p = useTrainPalette();
  return <Pressable ref={buttonRef} {...webPressed(selected)} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!selected, disabled: !!disabled }} disabled={disabled} onPress={onPress} style={state => [styles.button, { backgroundColor: selected ? p.field : 'transparent', opacity: disabled ? 0.4 : state.pressed ? 0.65 : 1 }, focusRing(state, p.text)]}>{typeof children === 'string' ? <Text size={13} weight={selected ? 'semibold' : 'medium'}>{children}</Text> : children}</Pressable>;
}

type Page = 'overview' | 'records' | 'consistency' | 'muscles' | 'volume' | 'workout';
const destinations = [
  { id: 'records', title: 'Personal Records' },
  { id: 'consistency', title: 'Consistency' },
  { id: 'muscles', title: 'Muscle Balance' },
  { id: 'volume', title: 'Training Volume' },
] as const;
const glyphs = {
  trend: 'M3 15l5-5 4 3 8-9M4 21v-3m5 3v-6m5 6v-3m5 3v-9',
  records: 'M8 3h8v6a4 4 0 0 1-8 0V3ZM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 1v5m-4 3h8m-6-3h4v3',
  consistency: 'M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Zm3-3v5m8-5v5M4 10h16M8 14h1m6 0h1m-8 3h1m6 0h1',
  muscles: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM3 12h5l3-5 3 10 3-5h4',
  volume: 'M4 3v17h17M9 16v-5m5 5V6m5 10V9',
  arrow: 'M7 17 17 7M7 7h10v10', back: 'm14 6-6 6 6 6', next: 'm10 6 6 6-6 6', info: 'M12 11v6m0-10v.1',
};
function Glyph({ name, size = 24, color }: { name: keyof typeof glyphs; size?: number; color?: string }) {
  const { colors } = useAppTheme();
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? colors.accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{name === 'info' ? <Circle cx={12} cy={12} r={9} /> : null}<Path d={glyphs[name]} /></Svg>;
}
function Surface({ children }: { children: ReactNode }) {
  const p = useTrainPalette(); return <View style={[styles.surface, { backgroundColor: p.surface }]}>{children}</View>;
}
function Trend({ value, suffix = '%' }: { value: number | null; suffix?: string }) {
  const { colors } = useAppTheme();
  return value === null ? null : <Text size={13} weight="semibold" color={value > 0 ? colors.accent : colors.muted}>{value > 0 ? '+' : ''}{number(value)}{suffix}</Text>;
}
function Stat({ label, value, detail, trend = null, suffix, onPress, buttonRef }: { label: string; value: string; detail: string; trend?: number | null; suffix?: string; onPress?: () => void; buttonRef?: React.Ref<View> }) {
  const p = useTrainPalette();
  const content = <><Text muted size={12}>{label}</Text><Text size={23} weight="semibold" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>{detail ? <Text muted size={11}>{detail}</Text> : null}{trend !== null ? <Trend value={trend} suffix={suffix} /> : null}</>;
  return onPress ? <Pressable ref={buttonRef} accessibilityRole="button" accessibilityLabel={[`${label}: ${value}`, detail, trend === null ? '' : `${trend > 0 ? '+' : ''}${number(trend)}${suffix ?? '%'} vs previous period`].filter(Boolean).join(', ')} onPress={onPress} style={({ pressed }) => [styles.stat, { backgroundColor: p.surface, opacity: pressed ? 0.7 : 1 }]}>{content}</Pressable>
    : <View style={[styles.stat, { backgroundColor: p.surface }]}>{content}</View>;
}

function MuscleBalanceDetail({ logs }: { logs: ReturnType<typeof summarizeWorkoutAnalytics>['selected'] }) {
  const classifications = useMuscleClassifications();
  const balance = useMemo(() => muscleBalance(logs, classifications), [logs, classifications]);
  const { colors } = useAppTheme();
  const palette = useTrainPalette();
  const [classifying, setClassifying] = useState('');
  const [limit, setLimit] = useState(12);
  const [selectedGroup, setSelectedGroup] = useState<MuscleGroup | null>(null);
  const untrainedGroups = muscleGroups.filter(group => !balance.contributions.has(group));

  if (!balance.totalSets) return <Surface><Text muted>Log completed sets to see which muscles you trained.</Text></Surface>;
  return <>
    <Surface>
      <Text size={18} weight="semibold">Sets by muscle group</Text>
      <Text muted size={13}>{balance.classifiedSets} of {balance.totalSets} sets classified · {number(balance.classifiedSets / balance.totalSets * 100)}% coverage</Text>
      {balance.groups.map(({ group, sets }) => {
        const share = balance.classifiedSets ? sets / balance.classifiedSets * 100 : 0;
        const expanded = selectedGroup === group;
        const exercises = [...(balance.contributions.get(group)?.values() ?? [])].sort((a, b) => b.sets - a.sets);
        return <View key={group}>
        <Pressable accessibilityRole="button" aria-expanded={expanded} accessibilityState={{ expanded }} onPress={() => setSelectedGroup(expanded ? null : group)} style={{ gap: 7, paddingVertical: 8, minHeight: 44 }}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text>{group}</Text><Text muted size={13}>{number(sets)} sets · {number(share)}%</Text>
          </View>
          <View style={{ height: 6, backgroundColor: palette.field, borderRadius: 3 }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.accent, width: `${share}%` }} />
          </View>
        </Pressable>
        {expanded ? <View style={{ paddingLeft: 12, gap: 5, paddingBottom: 8 }}>{exercises.map(exercise => <Text key={exercise.name} muted size={13}>{exercise.name} · {number(exercise.sets)} allocated sets</Text>)}</View> : null}
        </View>;
      })}
      {untrainedGroups.length ? <View style={{ gap: 4, borderTopWidth: 1, borderColor: palette.border, paddingTop: 10 }}>
        <Text size={13} weight="semibold">No sets logged</Text>
        <Text muted size={12}>{untrainedGroups.join(' · ')}</Text>
      </View> : null}
      <Text muted size={12}>Sets are split evenly across primary muscles. Percentages use classified sets.</Text>
    </Surface>
    {balance.unclassified.length ? <Surface>
      <Text size={18} weight="semibold">Unclassified work</Text><Text muted size={13}>{balance.totalSets - balance.classifiedSets} sets</Text>
      {classifying ? <ExerciseMusclePicker key={classifying} name={classifying} onSaved={() => setClassifying('')} onCancel={() => setClassifying('')} /> : <>
        {balance.unclassified.slice(0, limit).map(({ name, sets }) => <Pressable key={name} accessibilityRole="button"
          accessibilityLabel={`Classify ${name}`} onPress={() => setClassifying(name)}
          style={[styles.row, { minHeight: 44, justifyContent: 'space-between', gap: 12 }]}>
          <View style={{ flex: 1, gap: 4 }}><Text>{name}</Text><Text muted size={12}>{sets} {sets === 1 ? 'set' : 'sets'}</Text></View>
          <Text color={colors.accent} size={13}>Assign muscles</Text>
        </Pressable>)}
        {balance.unclassified.length > limit ? <Button onPress={() => setLimit(current => current + 12)}>Show more exercises</Button> : null}
      </>}
    </Surface> : null}
  </>;
}

function VolumeDetail({ data, unit, range }: { data: ReturnType<typeof summarizeWorkoutAnalytics>; unit: WeightUnit; range: AnalyticsRange }) {
  const p = useTrainPalette(), { colors } = useAppTheme();
  const [selected, select] = useState(''), [limit, setLimit] = useState(10);
  const [fullPeriod, setFullPeriod] = useState(false);
  const { weeks } = data;
  const weekScroll = useRef<ScrollView>(null);
  const max = Math.max(1, ...weeks.map(week => week.volume));
  const active = weeks.find(week => week.date === selected) ?? weeks.findLast(week => week.volume > 0) ?? weeks.findLast(week => week.hasSets) ?? weeks.at(-1)!;
  const showActiveWeek = () => {
    if (!selected) weekScroll.current?.scrollTo({ x: Math.max(0, (weeks.indexOf(active) - 2) * 48), animated: false });
  };
  const delta = data.hasPreviousVolume ? percentageChange(data.volume, data.previousVolume) : null;
  const label = unit + '·reps';
  const exercises = useMemo(() => exerciseWorkload(data.points, fullPeriod ? undefined : active), [data.points, fullPeriod, active]);
  const breakdownDates = fullPeriod ? dateSpan(data.bounds.start, data.bounds.end) : dateSpan(active.start, active.end);
  const workload = exercises.filter(exercise => exercise.volume > 0);
  const bodyweight = exercises.filter(exercise => exercise.sets > 0);
  return <>
    <Surface>
      <Text size={18} weight="semibold">Recorded-load volume</Text>
      <Text size={32} weight="semibold">{data.hasVolume ? number(data.volume) : '—'} <Text muted size={13}>{label}</Text></Text>
      {range !== 'all' ? <View style={{ gap: 5 }}>
        <Text size={13}>Previous {range} days · {data.hasPreviousVolume ? number(data.previousVolume) + ' ' + label : '—'}</Text>
        <Text muted size={12}>{dateSpan(data.bounds.previousStart, data.bounds.previousEnd)}</Text>
        {data.hasVolume && delta !== null ? <Trend value={delta} /> : <Text muted size={12}>{!data.hasPreviousVolume ? 'No recorded sets in the previous period.' : !data.hasVolume ? 'No recorded load data in this period.' : 'The previous total was zero. A percentage change is unavailable.'}</Text>}
      </View> : null}
    </Surface>
    <Surface>
      <Text size={18} weight="semibold">Weekly recorded load</Text>
      <Text muted size={12}>{dateSpan(weeks[0].start, weeks.at(-1)!.end)} · Monday–Sunday{weeks[0].start > data.bounds.start ? ' · Latest 12 weeks' : ''}</Text>
      <ScrollView ref={weekScroll} horizontal showsHorizontalScrollIndicator onContentSizeChange={showActiveWeek} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={[styles.row, { flex: 1, gap: 4, alignItems: 'flex-end', paddingBottom: 8 }]}>
          {weeks.map(week => <Pressable key={week.date} accessibilityRole="button" {...webPressed(active.date === week.date)} accessibilityState={{ selected: active.date === week.date }}
            accessibilityLabel={`Week of ${dateLabel(week.date)}: ${week.hasSets || !week.sessions ? number(week.volume) + ' ' + label : 'no recorded load data'}${week.partial ? ', partial week' : ''}`}
            onPress={() => { select(week.date); setLimit(10); }} style={{ flex: 1, minWidth: 44, alignItems: 'center', gap: 5 }}>
            <View style={{ height: 90, width: '85%', justifyContent: 'flex-end' }}>
              <View style={{ height: Math.max(4, week.volume / max * 90), borderRadius: 4, backgroundColor: week.volume ? colors.accent : p.field, borderWidth: active.date === week.date ? 1 : 0, borderColor: p.text }} />
            </View>
            <Text muted size={11}>{week.date.slice(5).replace('-', '/')}{week.partial ? '*' : ''}</Text>
          </Pressable>)}
        </View>
      </ScrollView>
      <View accessibilityLiveRegion="polite" style={{ gap: 4 }}>
        <Text size={15} weight="semibold">{active.hasSets || !active.sessions ? number(active.volume) + ' ' + label : '— · No recorded load data'}</Text>
        <Text muted size={12}>{dateSpan(active.start, active.end)}{active.partial ? ' · Partial week' : ''}</Text>
      </View>
      {weeks.some(week => week.partial) ? <Text muted size={12}>* Partial week within this range</Text> : null}
    </Surface>
    <Surface>
      <Text size={18} weight="semibold">Recorded load by exercise</Text>
      <View style={styles.routineFilters}>
        <Button selected={!fullPeriod} onPress={() => { setFullPeriod(false); setLimit(10); }}>Selected week</Button>
        <Button selected={fullPeriod} onPress={() => { setFullPeriod(true); setLimit(10); }}>Full period</Button>
      </View>
      <Text size={12}>{breakdownDates}</Text>
      {workload.length ? workload.slice(0, limit).map(row => <View key={row.name} style={styles.breakdown}><Text style={{ flex: 1 }} size={14}>{row.name}</Text><Text muted size={13}>{number(row.volume)} {label}</Text></View>) : <Text muted size={13}>No recorded-load exercises in this period.</Text>}
      {workload.length > limit ? <Button onPress={() => setLimit(value => value + 10)}>Show more exercises</Button> : null}
    </Surface>
    {bodyweight.length ? <Surface>
      <Text size={18} weight="semibold">Bodyweight work</Text><Text muted size={12}>Includes recognized bodyweight exercises and sets logged with zero weight. Added load is shown above.</Text>
      {bodyweight.slice(0, limit).map(row => <View key={row.name} style={styles.breakdown}><Text style={{ flex: 1 }} size={14}>{row.name}</Text><Text muted size={13}>{number(row.sets)} {row.sets === 1 ? 'set' : 'sets'} · {number(row.reps)} {row.reps === 1 ? 'rep' : 'reps'}</Text></View>)}
      {bodyweight.length > limit ? <Button onPress={() => setLimit(value => value + 10)}>Show more bodyweight exercises</Button> : null}
    </Surface> : null}
    <Text muted size={12}>{data.detailedWorkouts}/{data.selected.length} workouts include set data · Recorded load × reps</Text>
  </>;
}

type AnalyticsTemplate = Pick<WorkoutDraft, 'title' | 'rows'> & { id: string };
type AnalyticsSplit = { days: string[] };

function RepWeightDetail({ profile, unit, sideBySide, onSource, sourceRef }: { profile: ReturnType<typeof repWeightProfile>; unit: WeightUnit; sideBySide: boolean; onSource: () => void; sourceRef: React.Ref<View> }) {
  const palette = useTrainPalette();
  const { colors } = useAppTheme();
  const [showAll, setShowAll] = useState(false);
  const [showCalculation, setShowCalculation] = useState(false);
  const { points, attempt } = profile;
  const ranked = [...points].sort((a, b) => b.weight - a.weight || a.reps - b.reps);
  const heaviest = ranked[0];
  if (!heaviest) return null;
  const visible = showAll ? ranked : ranked.slice(0, 5);

  return <View style={[styles.repDetail, sideBySide && styles.repDetailWide]}>
    <View style={[styles.repPlot, sideBySide && styles.repColumn]}>
      <Text size={15} weight="semibold">Best weight by reps</Text>
      <Text muted size={12}>Selected period</Text>
      {visible.map(point => <View key={point.reps} style={styles.repBarRow}>
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <Text muted size={13}>{point.reps} {point.reps === 1 ? 'rep' : 'reps'}</Text>
          <Text size={14} weight="semibold">{number(point.weight)} {unit}</Text>
        </View>
        <View style={[styles.repBar, { backgroundColor: palette.field }]}>
          <View style={[styles.repBar, { width: `${point.weight / heaviest.weight * 100}%`, backgroundColor: colors.accent, opacity: point === ranked[0] ? 1 : 0.55 }]} />
        </View>
      </View>)}
      {ranked.length > 5 ? <Button onPress={() => setShowAll(value => !value)}>{showAll ? 'Show top five' : 'Show all rep counts'}</Button> : null}
    </View>
    <View style={[styles.notice, sideBySide && styles.repColumn, { backgroundColor: palette.field, borderColor: palette.border }]}>
      <Text size={14} weight="semibold">Estimated single-rep range</Text>
      {attempt ? <>
        <Text size={27} weight="semibold" color={colors.accent}>{number(attempt.low)}–{number(attempt.high)} {unit}</Text>
        <Text size={13}>Source set · {number(attempt.basis.weight)} {unit} × {attempt.basis.reps} {attempt.basis.reps === 1 ? 'rep' : 'reps'} · {dateLabel(attempt.basis.date)}</Text>
        <Button onPress={onSource} buttonRef={sourceRef}>View source workout</Button>
        {attempt.basis.reps > 10 ? <Text muted size={12}>Higher-rep estimates are less reliable. This estimate caps the calculation at 10 reps.</Text> : null}
        <Text muted size={12}>If you test a single, warm up, start below the range, and use a spotter or safeties where appropriate. Stop if your form breaks.</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showCalculation }} onPress={() => setShowCalculation(value => !value)} style={[styles.button, { alignItems: 'flex-start' }]}>
          <Text size={13} weight="semibold">{showCalculation ? 'Hide calculation' : 'How it’s calculated'}</Text>
        </Pressable>
        {showCalculation ? <Text size={13}>Epley estimates load × (1 + reps ÷ 30), using up to 10 reps. A single uses the logged load. The range uses 95–100% of the best estimate ({number(attempt.basis.estimate)} {unit}), rounded down where practical.</Text> : null}
      </> : null}
    </View>
  </View>;
}

export function WorkoutAnalytics({ onClose, onLogWorkout, templates, splits }: { onClose: () => void; onLogWorkout: () => void; templates: AnalyticsTemplate[]; splits: AnalyticsSplit[] }) {
  const { logs, deletedWorkoutIds, accountUserId, foodJournalReady, workoutStorageError, accountSyncError, retryAccountSync, saveFeedback, weeklyWorkoutGoal } = useAppData();
  const { unit } = useWeightUnit(); const p = useTrainPalette(); const theme = useAppTheme(); const { width } = useWindowDimensions();
  const [selection, setSelection] = useState<AnalyticsSelection | null>(null);
  const selectionKey = accountUserId ? 'swolemates.workout-analytics.' + accountUserId : null;
  const { range, lift: savedLift, metric: metricChoice } = selection ?? initialSelection;
  useEffect(() => {
    let active = true;
    async function loadSelection() {
      let next = initialSelection;
      if (selectionKey) {
        try {
          const saved = JSON.parse((await AsyncStorage.getItem(selectionKey)) ?? '{}') as Partial<AnalyticsSelection>;
          next = {
            range: saved.range === 7 || saved.range === 90 || saved.range === 'all' ? saved.range : 30,
            lift: typeof saved.lift?.id === 'string' && typeof saved.lift.name === 'string' ? saved.lift : null,
            metric: saved.metric && Object.hasOwn(metricLabels, saved.metric) ? saved.metric : null,
          };
        } catch { /* Storage is optional for opening Analytics. */ }
      }
      if (active) setSelection(next);
    }
    void loadSelection();
    return () => { active = false; };
  }, [selectionKey]);
  function updateSelection(change: Partial<AnalyticsSelection>) {
    const next = { ...(selection ?? initialSelection), ...change };
    setSelection(next);
    if (selectionKey) void AsyncStorage.setItem(selectionKey, JSON.stringify(next)).catch(() => undefined);
  }
  const [page, setPage] = useState<Page>('overview'), [info, setInfo] = useState(false);
  const [search, setSearch] = useState(''), [picking, setPicking] = useState(false);
  const [lifetime, setLifetime] = useState(false);
  const [workout, setWorkout] = useState<SessionLog | null>(null);
  const [highlightedExerciseId, setHighlightedExerciseId] = useState<string>();
  const [highlightedSetIndex, setHighlightedSetIndex] = useState<number>();
  const pageScroll = useRef<ScrollView>(null);
  const workoutParent = useRef<Page>('overview');
  const trigger = useRef('');
  const historyId = useId();
  const depth = useRef(0);
  const pendingBack = useRef(false);
  const exitToLog = useRef(false);
  const restoreScreen = useRef<() => void>(() => {});
  const exitActions = useRef({ onClose, onLogWorkout });
  exitActions.current = { onClose, onLogWorkout };
  const pushScreen = () => {
    if (Platform.OS !== 'web') return;
    depth.current++;
    window.history.pushState({ ...window.history.state, workoutAnalytics: { id: historyId, depth: depth.current } }, '');
  };
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const baseUrl = window.location.href;
    depth.current = 1;
    window.history.pushState({ ...window.history.state, workoutAnalytics: { id: historyId, depth: 1 } }, '');
    const onPop = (event: PopStateEvent) => {
      const entry = event.state?.workoutAnalytics;
      // Expo Router can replace the state of the current entry while keeping its URL.
      const samePage = window.location.href === baseUrl;
      const nextDepth = entry?.id === historyId ? entry.depth : samePage && !exitToLog.current ? Math.max(0, depth.current - 1) : 0;
      pendingBack.current = false;
      if (!nextDepth && exitToLog.current) {
        depth.current = 0;
        exitActions.current.onLogWorkout();
      } else if (nextDepth < depth.current) {
        const previousDepth = depth.current;
        depth.current = nextDepth;
        if (!nextDepth) exitActions.current.onClose();
        else if (previousDepth - nextDepth === 1) restoreScreen.current();
        else { setPicking(false); setPage('overview'); }
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // The overview starts one browser history stack for this mounted analytics session.
  }, [historyId]);
  const workoutTrigger = useRef('');
  const controls = useRef(new Map<string, View>());
  const refFor = (id: string) => (node: View | null) => {
    if (node) controls.current.set(id, node);
    else controls.current.delete(id);
  };
  const focusControl = (id: string) => requestAnimationFrame(() => {
    const node = controls.current.get(id);
    if (Platform.OS === 'web') node?.focus();
    else if (node) {
      const handle = findNodeHandle(node);
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    }
  });
  const [templateFilter, setTemplateFilter] = useState('');
  const [pointIndex, setPointIndex] = useState<number | null>(null);
  const [recordLimit, setRecordLimit] = useState(20), [activityDay, setActivityDay] = useState('');
  const [chartLayoutWidth, setChartLayoutWidth] = useState(600);
  const dragStart = useRef({ pageX: 0, localX: 0 });
  const fillId = 'analytics-' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const [today, setToday] = useState(() => localDay(new Date()));
  useEffect(() => {
    const update = () => setToday(localDay(new Date()));
    const timer = setInterval(update, 60000); const subscription = AppState.addEventListener('change', state => { if (state === 'active') update(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);
  const history = useMemo(() => prepareAnalyticsHistory({ logs, deleted: deletedWorkoutIds, unit, today }), [logs, deletedWorkoutIds, unit, today]);
  const data = useMemo(() => summarizeWorkoutAnalytics(history, range), [history, range]);
  const defaultLift = useMemo(() => defaultAnalyticsLift(data.points) ?? history.allPoints.at(-1), [data.points, history.allPoints]);
  const chosenLift = data.lifts.find(lift => lift.id === (savedLift?.id ?? defaultLift?.exerciseId));
  const chosenExercise = chosenLift?.name ?? savedLift?.name ?? '';
  const exercisePoints = useMemo(() => data.points.filter(point => point.exerciseId === chosenLift?.id), [data.points, chosenLift?.id]);
  const outsideBaseline = !savedLift && !data.points.length ? defaultLift : undefined;
  const defaultMetric = chosenLift?.metrics.includes('weight') &&
    (!chosenLift.bodyweight || (outsideBaseline ? (outsideBaseline.weight ?? 0) > 0 : exercisePoints.some(point => (point.weight ?? 0) > 0))) ? 'weight' : 'reps';
  const metric = metricChoice ?? defaultMetric;
  const setRange = (value: AnalyticsRange) => updateSelection({
    range: value,
    lift: savedLift ?? (chosenLift ? { id: chosenLift.id, name: chosenLift.name } : null),
    metric: chosenExercise ? metric : null,
  });
  const metricLabel = metric === 'weight' && chosenLift?.bodyweight ? 'Heaviest added load' : metricLabels[metric];
  const points = useMemo(() => metric === 'estimatedMax' ? [] : (outsideBaseline ? [outsideBaseline] : exercisePoints).filter(point => point[metric] !== null), [exercisePoints, outsideBaseline, metric]);
  const repProfile = useMemo(() => page === 'overview' && metric === 'estimatedMax' && chosenExercise ? repWeightProfile(data.selected, chosenExercise, unit) : null, [page, metric, data.selected, chosenExercise, unit]);
  const balanceClassifications = useMuscleClassifications();
  const muscleSummary = useMemo(() => page === 'overview' ? muscleBalance(data.selected, balanceClassifications) : null, [page, data.selected, balanceClassifications]);
  const templatesById = useMemo(() => new Map(templates.map(template => [template.id, template])), [templates]);
  const workoutDayFilters = useMemo(() => {
    const routines = new Map<string, AnalyticsTemplate>();
    for (const split of splits) {
      for (const id of split.days) {
        const template = templatesById.get(id);
        if (!template) continue;
        const exercises = [...new Set(template.rows.map(row => analyticsExerciseKey(exerciseName(row))))].sort();
        const key = JSON.stringify([analyticsExerciseKey(template.title), exercises]);
        routines.set(key, template);
      }
    }
    return [...routines.values()];
  }, [splits, templatesById]);
  const filteredTemplate = templatesById.get(templateFilter);
  const templateExercises = filteredTemplate ? new Set(filteredTemplate.rows.map(row => analyticsExerciseId(exerciseName(row)))) : null;
  const searchKey = analyticsExerciseKey(search);
  const exerciseMatches = picking ? data.lifts.filter(lift =>
    (!templateExercises || templateExercises.has(lift.id)) && analyticsExerciseKey(lift.name).includes(searchKey)) : [];
  function toggleLiftPicker() {
    if (picking) { back(); return; }
    pushScreen();
    setSearch('');
    setTemplateFilter('');
    setPicking(true);
  }
  useEffect(() => { setPointIndex(null); }, [range, chosenExercise, metric, unit]);
  useEffect(() => { setRecordLimit(20); setActivityDay(''); }, [range]);
  const index = Math.min(pointIndex ?? points.length - 1, points.length - 1), point = points[index];
  const values = useMemo(() => points.map(item => item[metric]!), [points, metric]);
  const maximum = values.reduce((best, value) => Math.max(best, value), 1), minimum = values.reduce((best, value) => Math.min(best, value), maximum);
  const low = Math.max(0, minimum - (maximum - minimum || maximum) * 0.2), high = maximum + (maximum - minimum || maximum) * 0.15;
  const positions = useMemo(() => {
    const counts = new Map<string, number>(), offsets = new Map<string, number>();
    for (const point of points) counts.set(point.date, (counts.get(point.date) ?? 0) + 1);
    const dates = points.map(item => {
      const offset = offsets.get(item.date) ?? 0;
      offsets.set(item.date, offset + 1);
      return dayNumber(item.date) + offset / counts.get(item.date)! * 0.35;
    });
    const span = dates.at(-1)! - dates[0];
    return dates.map((date, i) => dates.length === 1 ? chartWidth / 2 :
      left + (span ? (date - dates[0]) / span : i / (dates.length - 1)) * (right - left));
  }, [points]);
  const y = (i: number) => bottom - (values[i] - low) / (high - low) * (bottom - top);
  const line = useMemo(() => positions.map((x, i) => `${i ? 'L' : 'M'}${x},${bottom - (values[i] - low) / (high - low) * (bottom - top)}`).join(' '), [positions, values, low, high]);
  function inspectChart(localX: number) {
    const target = localX / chartLayoutWidth * chartWidth;
    let first = 0, last = positions.length - 1;
    while (first < last) {
      const mid = Math.floor((first + last) / 2);
      if (positions[mid] < target) first = mid + 1;
      else last = mid;
    }
    const previous = first - 1;
    setPointIndex(previous >= 0 && target - positions[previous] < positions[first] - target ? previous : first);
  }
  function startChartDrag({ nativeEvent }: GestureResponderEvent) {
    dragStart.current = { pageX: nativeEvent.pageX, localX: nativeEvent.locationX };
    inspectChart(nativeEvent.locationX);
  }
  function moveChartDrag({ nativeEvent }: GestureResponderEvent) {
    const { pageX, localX } = dragStart.current;
    inspectChart(localX + nativeEvent.pageX - pageX);
  }
  const change = points.length > 1 ? percentageChange(values.at(-1)!, values[0]) : null;
  const error = workoutStorageError || accountSyncError;
  const { bounds } = data;
  const scope = dateSpan(bounds.start, bounds.end);
  const heatEnd = bounds.end;
  const heatStart = bounds.start > shiftDay(heatEnd, -90) ? bounds.start : shiftDay(heatEnd, -90);
  const heatDays: string[] = [];
  for (let day = heatStart; day <= heatEnd; day = shiftDay(day, 1)) heatDays.push(day);
  const heatPadding = (dayDate(heatStart).getDay() + 6) % 7;
  const heatCells = [...Array.from({ length: heatPadding }, () => ''), ...heatDays];
  const columns = Array.from({ length: Math.ceil(heatCells.length / 7) }, (_, i) => heatCells.slice(i * 7, i * 7 + 7));
  const activitySessions = data.activity.get(activityDay) ?? [];
  const maxWeeklyCount = Math.max(1, ...data.weeks.map(item => item.count));
  const recordFeed = lifetime ? data.lifetimeBests : data.improvements;
  const logsById = useMemo(() => new Map(data.logs.map(log => [log.id, log])), [data.logs]);
  const volumeChange = data.hasVolume && data.hasPreviousVolume ? percentageChange(data.volume, data.previousVolume) : null;
  const workoutChange = range !== 'all' && data.previousWorkouts > 0 ? data.selected.length - data.previousWorkouts : null;
  const go = (next: Page, control = next as string) => {
    pushScreen();
    trigger.current = control;
    if (next === 'records') { setLifetime(false); setRecordLimit(20); }
    setPage(next); setInfo(false); setPicking(false);
  };
  function openWorkout(log: SessionLog, control: string, exerciseRowId?: string, setIndex?: number) {
    pushScreen();
    setInfo(false);
    workoutParent.current = page;
    workoutTrigger.current = control;
    setWorkout(log);
    setHighlightedExerciseId(exerciseRowId);
    setHighlightedSetIndex(setIndex);
    setPage('workout');
  }
  function scrollToHighlightedExercise(card: View) {
    const scroll = pageScroll.current;
    const content = scroll?.getInnerViewNode();
    if (content == null) return;
    card.measureLayout(content, (_x, y) => {
      if (pageScroll.current === scroll) scroll?.scrollTo({ y: Math.max(0, y - 12), animated: false });
    });
  }
  function openStrengthSource() {
    if (!point) return;
    const log = logsById.get(point.workoutId);
    if (!log) return;
    const rowId = point.source[metric]?.rowId ??
      log.exercises?.find(row => analyticsExerciseId(row.name) === point.exerciseId)?.id;
    openWorkout(log, 'strength-source', rowId, point.source[metric]?.setIndex);
  }
  restoreScreen.current = () => {
    if (picking) { setPicking(false); focusControl('lift'); return; }
    if (page === 'workout') {
      setPage(workoutParent.current);
      focusControl(workoutTrigger.current);
    } else if (page === 'overview') onClose();
    else {
      setPage('overview');
      setInfo(false);
      focusControl(trigger.current);
    }
  };
  const back = () => {
    if (Platform.OS !== 'web') { restoreScreen.current(); return; }
    if (pendingBack.current) return;
    pendingBack.current = true;
    window.history.back();
  };
  const logWorkout = () => {
    if (Platform.OS !== 'web' || depth.current === 0) { onLogWorkout(); return; }
    if (pendingBack.current) return;
    pendingBack.current = true;
    exitToLog.current = true;
    window.history.go(-depth.current);
  };
  const title = page === 'overview' ? 'Workout Analytics' : page === 'workout' ? workout?.title : destinations.find(item => item.id === page)?.title;
  const widen = () => setRange(range === 7 ? 30 : range === 30 ? 90 : 'all');
  const lifetimeScope = page === 'records' && lifetime;
  const estimateSource = repProfile?.attempt?.basis;
  const records = <Surface>
    <View style={styles.routineFilters}>
      <Button selected={!lifetime} onPress={() => { setLifetime(false); setRecordLimit(20); }}>PR improvements</Button>
      <Button selected={lifetime} onPress={() => { setLifetime(true); setRecordLimit(20); }}>Lifetime bests</Button>
    </View>
    <Text size={13}>{lifetime ? 'Grouped by lift' : `${data.recordsAchieved} improvements · ${scope}`}</Text>
    {recordFeed.slice(0, recordLimit).map((record, i) => {
      const sourceWorkout = logsById.get(record.workoutId);
      const control = 'record:' + record.key;
      const content = <>
        <View style={{ flex: 1, gap: 5 }}>
          {!lifetime ? <Text size={15} weight="semibold">{record.exercise}</Text> : null}
          <Text size={13}>{recordLabels[record.kind]}</Text>
          {lifetime ? <Text size={12}>{dateLabel(record.date)}{record.improved ? '' : ' · Baseline'}</Text> : null}
          {record.source ? <Text muted size={12}>{number(record.source.weight)} {unit} × {record.source.reps} reps</Text> : null}
          {sourceWorkout ? <Text muted size={12}>View workout</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text size={17} weight="semibold">{!lifetime && record.previous !== undefined ? number(record.previous) + ' → ' : ''}{number(record.value)} <Text size={12}>{metricUnit(record.kind, unit)}</Text></Text>
          {!lifetime && record.previous !== undefined ? <Text size={13} color={theme.colors.accent}>+{number(record.value - record.previous)} {metricUnit(record.kind, unit)}</Text> : null}
        </View>
      </>;
      return <View key={record.key}>
        {lifetime && recordFeed[i - 1]?.exerciseId !== record.exerciseId ? <Text size={17} weight="semibold" style={{ marginTop: 10, marginBottom: 6 }}>{record.exercise}</Text> : null}
        {!lifetime && recordFeed[i - 1]?.workoutId !== record.workoutId ? <View style={{ marginTop: 10, marginBottom: 8, gap: 2 }}>
          <Text accessibilityRole="header" size={17} weight="semibold">{sourceWorkout?.title ?? 'Workout'}</Text>
          <Text size={12}>{dateLabel(record.date)}</Text>
        </View> : null}
        {sourceWorkout ? <Pressable ref={refFor(control)} accessibilityRole="button" onPress={() => {
          const rowId = record.source?.rowId ?? sourceWorkout.exercises?.find(row => analyticsExerciseId(row.name) === record.exerciseId)?.id;
          openWorkout(sourceWorkout, control, rowId, record.source?.setIndex);
        }} style={[styles.record, { borderColor: p.border }]}>{content}</Pressable>
          : <View style={[styles.record, { borderColor: p.border }]}>{content}</View>}
      </View>;
    })}
    {!recordFeed.length ? <><Text muted>{lifetime ? 'No qualifying records yet.' : 'No PR improvements in this period. Your first result for each metric establishes a baseline.'}</Text>
      {!lifetime ? <Button onPress={() => setLifetime(true)}>See lifetime bests</Button> : null}</> : null}
    {recordFeed.length > recordLimit ? <Button onPress={() => setRecordLimit(limit => limit + 20)}>Show more records</Button> : null}
  </Surface>;

  return <Modal visible animationType="slide" onRequestClose={back}><SafeAreaView accessibilityViewIsModal style={{ flex: 1, backgroundColor: p.background }}>
    <View style={styles.header}><Button onPress={back} label={picking ? 'Back to lift' : page === 'overview' ? 'Back to Train' : page === 'workout' ? 'Back to analytics detail' : 'Back to Analytics'}><View style={[styles.row, { gap: 5 }]}><Glyph name="back" size={17} color={p.muted} /><Text muted size={13}>{page === 'overview' ? 'Train' : 'Analytics'}</Text></View></Button><Button label="About workout metrics" selected={info} onPress={() => setInfo(value => !value)}><Glyph name="info" size={21} color={p.muted} /></Button></View>
    <ScrollView key={page} ref={pageScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: width >= 700 ? 28 : 18, paddingBottom: 32, gap: 16, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
      <Text accessibilityRole="header" size={page === 'overview' ? 32 : 28} weight="semibold">{title}</Text>
      {lifetimeScope ? <Text size={13} weight="semibold">All history</Text> : page !== 'workout' && selection ? <>
      <View style={[styles.row, styles.range, { backgroundColor: p.surface }]}>{([7, 30, 90, 'all'] as const).map(value => <View key={value} style={{ flex: 1 }}><Button label={value === 'all' ? 'All time' : 'Last ' + value + ' days'} selected={range === value} onPress={() => setRange(value)}>{value === 'all' ? 'All time' : value + ' days'}</Button></View>)}</View>
      <Text size={13}>{scope}</Text>
      </> : null}
      {info ? <Surface><Text size={17} weight="semibold">About your metrics</Text>
        <Text muted size={13}>Dates use your local calendar. Comparisons use the immediately preceding period of equal length.</Text>
        <Text muted size={13}>Recorded-load volume adds up the recorded load × reps for each set, in {unit}. Bodyweight sets still count toward reps and consistency.</Text>
        <Text muted size={13}>Est. 1RM uses Epley: load × (1 + reps ÷ 30). A single uses its logged load. For higher-rep sets, the calculation uses at most 10 reps. Estimates from high-rep sets are less reliable.</Text>
        <Text muted size={13}>PR improvements beat a prior best. The first result sets a baseline, and a tie keeps the earlier result.</Text>
        <Text muted size={13}>Weekly goals count distinct workout days from Monday to Sunday. A current streak counts consecutive workout days through today or yesterday.</Text>
        {data.insights.map(insight => <Text key={insight} size={13}>{insight}</Text>)}
      </Surface> : null}
      {!accountUserId ? <Text muted>Sign in to see your analytics.</Text> : !selection || !foodJournalReady && !error ? <View style={styles.state}><ActivityIndicator color={theme.colors.accent} /><Text muted>Loading your training…</Text></View> : <>
        {error ? <Surface><Text accessibilityRole="alert">{foodJournalReady ? 'History may be out of date' : 'Could not load workout history'}</Text><Text muted size={12}>{error}</Text><Button onPress={retryAccountSync}>Retry sync</Button></Surface> : null}
        {foodJournalReady ? <>
        {saveFeedback.workouts?.phase === 'pending' ? <Text muted size={12}>Includes workouts waiting to sync.</Text> : null}
        {!(lifetimeScope ? data.logs.length : data.selected.length) && page !== 'workout' ? <Surface>
          <Text size={16} weight="semibold">{data.logs.length ? 'No workouts in this period' : 'No workout history yet'}</Text>
          {!data.logs.length ? <Text muted size={13}>Log your first workout with sets to start tracking progress.</Text> : null}
          <View style={styles.routineFilters}>
            {data.logs.length && range !== 'all' && (page !== 'overview' || !chosenExercise) ? <Button onPress={widen}>Widen range</Button> : null}
            <Button onPress={logWorkout}>Log a workout</Button>
          </View>
        </Surface> : null}
        {page === 'overview' ? <>
          <View accessibilityLabel="Workout overview metrics" style={[styles.row, { alignItems: 'stretch', gap: 6 }]}>
            <Stat label="Workouts" value={number(data.selected.length)} trend={workoutChange} suffix="" detail="Sessions" onPress={() => go('consistency', 'kpi-workouts')} buttonRef={refFor('kpi-workouts')} />
            <Stat label="Recorded-load volume" value={data.hasVolume ? number(data.volume) : '—'} trend={volumeChange} detail={unit + '·reps'} onPress={() => go('volume', 'kpi-volume')} buttonRef={refFor('kpi-volume')} />
            <Stat label="PR improvements" value={number(data.recordsAchieved)} detail="" onPress={() => go('records', 'kpi-records')} buttonRef={refFor('kpi-records')} />
          </View>
          {range !== 'all' && (workoutChange !== null || volumeChange !== null) ? <Text muted size={12}>Changes vs previous {range} days</Text> : null}
          <Surface>
            <Text accessibilityRole="header" size={18} weight="semibold">Strength Progression</Text>
            {chosenExercise ? <View accessibilityLabel="Strength metric" style={[styles.metricGroup, { borderColor: p.border }]}>
              {(['weight', 'estimatedMax', 'volume', 'reps'] as const).filter(value => value === metric || chosenLift?.metrics.includes(value)).map(value => (
                <Pressable key={value} accessibilityRole="button" {...webPressed(metric === value)} accessibilityState={{ selected: metric === value }} onPress={() => updateSelection({ metric: value, lift: savedLift ?? (chosenLift ? { id: chosenLift.id, name: chosenLift.name } : null) })}
                  style={state => [styles.button, styles.metricButton, { backgroundColor: metric === value ? p.field : 'transparent', opacity: state.pressed ? 0.65 : 1 }, focusRing(state, p.text)]}>
                  <Text size={12} weight={metric === value ? 'semibold' : 'medium'} color={metric === value ? theme.colors.accent : p.text}>{metricLabels[value]}</Text>
                </Pressable>
              ))}
            </View> : null}
            <View style={styles.row}>
              <Text size={15} weight="semibold" numberOfLines={2} style={{ flex: 1 }}>{chosenExercise || 'No logged exercises'}</Text>
              {data.lifts.length ? <Pressable ref={refFor('lift')} accessibilityRole="button" aria-expanded={picking} accessibilityState={{ expanded: picking }} onPress={toggleLiftPicker}
                style={({ pressed }) => [styles.button, { backgroundColor: p.field, opacity: pressed ? 0.65 : 1 }]}>
                <Text size={13} weight="semibold">{picking ? 'Close lift picker' : 'Change lift'}</Text>
              </Pressable> : null}
            </View>
            {picking && data.lifts.length ? <View style={styles.liftPicker}>
              {workoutDayFilters.length ? <View style={[styles.notice, { borderColor: p.border, backgroundColor: p.field }]}>
                <View style={[styles.row, { justifyContent: 'space-between' }]}>
                  <Text size={14} weight="semibold" accessibilityRole="header">Filter by workout day</Text>
                  <Pressable accessibilityRole="button" {...webPressed(!filteredTemplate)} accessibilityState={{ selected: !filteredTemplate }} onPress={() => setTemplateFilter('')}
                    style={({ pressed }) => [styles.button, styles.routineFilter, { backgroundColor: p.surface, borderColor: filteredTemplate ? p.border : theme.colors.accent, opacity: pressed ? 0.65 : 1 }]}>
                    <Text size={13} weight="semibold">All lifts</Text>
                  </Pressable>
                </View>
                <View style={styles.routineFilters}>
                  {workoutDayFilters.map(template => {
                    const selected = templateFilter === template.id;
                    return <Pressable key={template.id} accessibilityRole="button" {...webPressed(selected)} accessibilityState={{ selected }} onPress={() => setTemplateFilter(template.id)}
                      style={({ pressed }) => [styles.button, styles.routineFilter, { backgroundColor: p.surface, borderColor: selected ? theme.colors.accent : p.border, opacity: pressed ? 0.65 : 1 }]}>
                      <Text size={13} weight="semibold">{template.title}</Text>
                    </Pressable>;
                  })}
                </View>
              </View> : null}
              <View style={[styles.notice, { borderColor: p.border }]}>
                <View style={[styles.row, { justifyContent: 'space-between' }]}>
                  <Text size={14} weight="semibold" accessibilityRole="header" style={{ flex: 1 }}>{filteredTemplate ? filteredTemplate.title + ' lifts' : 'Logged lifts'}</Text>
                  <Text muted size={12}>{exerciseMatches.length} {exerciseMatches.length === 1 ? 'lift' : 'lifts'}</Text>
                </View>
                <Input accessibilityLabel="Search analytics exercises" placeholder="Search logged lifts" value={search} onChangeText={setSearch} />
                <ScrollView key={templateFilter} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ maxHeight: 220 }}>
                  {exerciseMatches.map(({ id, name, metrics }) => <Pressable key={id} accessibilityRole="button" accessibilityLabel={name} accessibilityHint={data.scopedLiftIds.has(id) ? 'Sessions in selected range' : 'Outside selected range'} {...webPressed(id === chosenLift?.id)} accessibilityState={{ selected: id === chosenLift?.id }}
                    onPress={() => { updateSelection({ lift: { id, name }, metric: metrics.includes(metric) ? metric : metrics.includes('weight') ? 'weight' : 'reps' }); back(); }}
                    style={({ pressed }) => [styles.button, styles.liftOption, { backgroundColor: name === chosenExercise ? p.field : 'transparent', opacity: pressed ? 0.65 : 1 }]}>
                    <Text size={14} weight={name === chosenExercise ? 'semibold' : 'medium'}>{name}</Text>
                    <Text size={12} muted>{data.scopedLiftIds.has(id) ? 'In selected range' : 'Outside selected range'}</Text>
                  </Pressable>)}
                  {!exerciseMatches.length ? <View style={{ gap: 6 }}>
                    <Text muted size={13}>{filteredTemplate ? `No matching logged lifts for ${filteredTemplate.title}.` : 'No matching logged lifts.'}</Text>
                    <View style={styles.routineFilters}>
                      {search.trim() ? <Button onPress={() => setSearch('')}>Clear search</Button> : null}
                      {filteredTemplate ? <Button onPress={() => { setTemplateFilter(''); setSearch(''); }}>Show all lifts</Button> : null}
                    </View>
                  </View> : null}
                </ScrollView>
              </View>
            </View> : null}
            {metric === 'estimatedMax' ? (
              repProfile && estimateSource ? <RepWeightDetail key={chosenExercise + range} profile={repProfile} unit={unit} sideBySide={width >= 620}
                sourceRef={refFor('strength-source')} onSource={() => {
                  const log = logsById.get(estimateSource.workoutId);
                  if (log) openWorkout(log, 'strength-source', estimateSource.rowId, estimateSource.setIndex);
                }} /> : null
            ) : <>
            {points.length > 1 ? <>
              <View style={styles.row}><Text muted size={13}>{metricLabel} · first to latest</Text>{change === null ? <Text muted size={13}>—</Text> : <Trend value={change} />}</View>
              <View accessible accessibilityLabel={`Strength chart. ${metricLabel} in ${metricUnit(metric, unit)}. ${points.length} sessions from ${dateSpan(points[0].date, points.at(-1)!.date)}. Use the previous and next buttons to inspect sessions.`}
                onStartShouldSetResponder={() => true} onResponderGrant={startChartDrag} onResponderMove={moveChartDrag}
                onLayout={event => setChartLayoutWidth(event.nativeEvent.layout.width)}
                style={[{ height: chartHeight }, Platform.OS === 'web' && ({ touchAction: 'pan-y', userSelect: 'none', cursor: 'ew-resize' } as unknown as ViewStyle)]}>
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                <Text size={11} style={{ position: 'absolute', left: 8, top: 0 }}>{number(high)} {metricUnit(metric, unit)}</Text><Text size={11} style={{ position: 'absolute', left: 8, bottom: 0 }}>{number(low)} {metricUnit(metric, unit)}</Text>
                <Svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
                  <Defs><LinearGradient id={fillId} x1="0%" y1="0%" x2="0%" y2="100%"><Stop offset="0" stopColor={theme.colors.accent} stopOpacity={0.2} /><Stop offset="1" stopColor={theme.colors.accent} stopOpacity={0.01} /></LinearGradient></Defs>
                  {[top, (top + bottom) / 2, bottom].map(level => <Line key={level} x1={left} x2={right} y1={level} y2={level} stroke={p.border} strokeDasharray="3 6" />)}
                  {points.length > 1 ? <Path d={`${line} L${positions.at(-1)},${bottom} L${positions[0]},${bottom} Z`} fill={'url(#' + fillId + ')'} /> : null}<Path d={line} fill="none" stroke={theme.colors.accent} strokeWidth={3} strokeLinejoin="round" />
                  {pointIndex !== null ? <Line x1={positions[index]} x2={positions[index]} y1={top} y2={bottom} stroke={p.muted} strokeDasharray="3 4" /> : null}<Circle cx={positions[index]} cy={y(index)} r={5} fill={theme.colors.accent} stroke={p.background} strokeWidth={2} />
                </Svg></View>
              </View>
              <View style={[styles.row, { justifyContent: 'space-between' }]}><Text size={12}>{dateLabel(points[0].date)}</Text><Text size={12}>{dateLabel(points.at(-1)!.date)}</Text></View>
            </> : null}
            {points.length === 1 ? <View style={{ gap: 4 }}>
              <Text size={14} weight="semibold">Session baseline</Text>
              <Text muted size={13}>{outsideBaseline ? 'Your most recent session is outside this range.' : 'Log another session for this lift to see a trend.'}</Text>
              <View style={styles.routineFilters}>
                {range !== 'all' ? <Button onPress={widen}>Widen range</Button> : null}
                {!picking && data.lifts.length > 1 ? <Button onPress={toggleLiftPicker}>Choose a lift</Button> : null}
              </View>
            </View> : null}
            {point ? <View style={[styles.row, { justifyContent: 'space-between', gap: 5 }]}>
              <View accessibilityLiveRegion="polite" style={{ flex: 1, gap: 4 }}>
                <Text size={20} weight="semibold">{number(point[metric]!)} <Text muted size={12}>{metricUnit(metric, unit)}</Text></Text>
                <Text muted size={12}>{dateLabel(point.date)} · {points.length === 1 ? '1 session' : `${index + 1} of ${points.length} sessions`}</Text>
                {point.source[metric] ? <Text muted size={12}>Source set · {number(point.source[metric]!.weight)} {unit} × {point.source[metric]!.reps} reps</Text>
                  : <Text muted size={12}>{point.sets} sets · {point.totalReps} reps in this session</Text>}
              </View>
              {points.length > 1 ? <>
                <Button label="Previous strength session" disabled={index <= 0} onPress={() => setPointIndex(index - 1)}><Glyph name="back" size={18} color={p.muted} /></Button>
                <Button label="Next strength session" disabled={index >= points.length - 1} onPress={() => setPointIndex(index + 1)}><Glyph name="next" size={18} color={p.muted} /></Button>
              </> : null}
            </View> : null}
            {point && logsById.has(point.workoutId) ? <Button buttonRef={refFor('strength-source')} onPress={openStrengthSource}>View source workout</Button> : null}
            </>}
            {chosenExercise && (metric === 'estimatedMax' ? !repProfile?.attempt : !point) ? <View style={{ gap: 8 }}>
              <Text muted size={14}>{exercisePoints.length ? `No qualifying result for ${metricLabel.toLowerCase()} in this period.` : `No ${chosenExercise} sets in ${range === 'all' ? 'your workout history' : 'the last ' + range + ' days'}.`}</Text>
              <View style={styles.routineFilters}>{range !== 'all' ? <Button onPress={widen}>Widen range</Button> : null}
                {!picking && data.lifts.length ? <Button onPress={toggleLiftPicker}>Choose a lift</Button> : null}</View>
            </View> : null}
          </Surface>
          <View style={styles.grid}>{destinations.map(item => {
            const value = item.id === 'records' ? `${data.recordsAchieved} improvements` : item.id === 'consistency' ? `${data.activity.size} workout days`
              : item.id === 'muscles' ? `${muscleSummary?.classifiedSets ?? 0} classified sets` : `${data.hasVolume ? number(data.volume) : '—'} ${unit}·reps`;
            return <Pressable ref={refFor(item.id)} key={item.id} accessibilityRole="button" accessibilityLabel={item.title} accessibilityHint={value} onPress={() => go(item.id)}
              style={({ pressed }) => [styles.destination, { backgroundColor: p.surface, opacity: pressed ? 0.65 : 1 }]}>
              <View style={[styles.row, { justifyContent: 'space-between' }]}><Glyph name={item.id} size={21} /><Glyph name="arrow" size={14} /></View>
              <View style={{ gap: 5 }}><Text size={15} weight="semibold">{item.title}</Text><Text muted size={12}>{value}</Text></View>
            </Pressable>;
          })}</View>
        </>
        : page === 'records' ? records : page === 'workout' && workout ? <Surface>
          <Text muted size={13}>{dateLabel(workout.date)}{workout.durationMinutes !== undefined ? ` · ${workout.durationMinutes} minutes` : ''}</Text>
          {workout.exercises?.length ? <WorkoutRecordedSets exercises={workout.exercises} highlightedExerciseId={highlightedExerciseId} highlightedSetIndex={highlightedSetIndex} onHighlightLayout={scrollToHighlightedExercise} /> : <Text muted>No set details were saved for this workout.</Text>}
        </Surface> : page === 'consistency' ? <>
          <Surface>
            <Text size={18} weight="semibold">Current week goal</Text>
            <Text muted size={13}>{dateSpan(data.currentWeek.start, data.currentWeek.end)} · Monday–Sunday</Text>
            <Text size={30} weight="semibold">{data.currentWeek.days}/{weeklyWorkoutGoal} <Text muted size={14}>workout days</Text></Text>
            <View accessibilityRole="progressbar" accessibilityLabel="Weekly workout goal" aria-valuetext={`${data.currentWeek.days} of ${weeklyWorkoutGoal} workout days`} accessibilityValue={{ text: `${data.currentWeek.days} of ${weeklyWorkoutGoal} workout days` }} style={{ height: 6, borderRadius: 3, backgroundColor: p.field }}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.accent, width: `${Math.min(100, data.currentWeek.days / Math.max(1, weeklyWorkoutGoal) * 100)}%` }} />
            </View>
          </Surface>
          <Surface>
            <Text size={18} weight="semibold">Weekly frequency</Text>
            <Text muted size={13}>{data.activity.size} workout days · {data.selected.length} sessions · {number(data.frequency)} days/week</Text>
            <Text muted size={12}>{dateSpan(data.weeks[0].start, data.weeks.at(-1)!.end)}{data.weeks.some(week => week.partial) ? ' · * Partial week' : ''}</Text>
            <View style={[styles.row, { alignItems: 'flex-end', gap: 4 }]}>{data.weeks.map((week, i) => <View key={week.date} accessible accessibilityLabel={`Week of ${dateLabel(week.date)}: ${week.count} workout days, ${week.sessions} sessions${week.partial ? ', partial week' : ''}`} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
              <Text muted size={11}>{week.count}</Text>
              <View style={{ width: '100%', height: Math.max(3, week.count / maxWeeklyCount * 55), backgroundColor: week.count ? theme.colors.accent : p.field, borderRadius: 3 }} />
              <Text muted size={10}>{data.weeks.length <= 6 || i % 3 === 0 ? week.date.slice(5).replace('-', '/') + (week.partial ? '*' : '') : week.partial ? '*' : ' '}</Text>
            </View>)}</View>
          </Surface>
          <Surface>
            <Text size={18} weight="semibold">Activity calendar</Text>
            <Text muted size={12}>{dateSpan(heatStart, heatEnd)}{columns.length * 44 + 30 > width - 70 ? ' · Scroll for more weeks' : ''}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator style={{ paddingBottom: 8 }}>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <View style={{ gap: 4 }}>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(label => <View key={label} style={{ height: 40, justifyContent: 'center', width: 30 }}><Text muted size={11}>{label}</Text></View>)}</View>
                {columns.map((column, i) => <View key={i} style={{ gap: 4 }}>
                  {column.map((day, j) => {
                    if (!day) return <View key={j} style={{ width: 40, height: 40 }} />;
                    const count = data.activity.get(day)?.length ?? 0;
                    return <Pressable key={day} accessibilityRole="button" {...webPressed(activityDay === day)} accessibilityState={{ selected: activityDay === day }}
                      accessibilityLabel={`${dateLabel(day)}: ${count} completed workouts`} onPress={() => setActivityDay(day)}
                      style={{ width: 40, height: 40, borderRadius: 7, justifyContent: 'center', alignItems: 'center', borderWidth: activityDay === day ? 2 : 1, borderColor: activityDay === day ? p.text : p.border, backgroundColor: count ? theme.colors.accent : p.field }}>
                      <Text size={12} weight={count ? 'semibold' : 'medium'} color={count ? '#10140a' : p.text}>{Number(day.slice(-2))}</Text>
                    </Pressable>;
                  })}
                </View>)}
              </View>
            </ScrollView>
            <Text muted size={13} accessibilityLiveRegion="polite">{activityDay ? `${dateLabel(activityDay)} · ${activitySessions.length ? `${activitySessions.length} completed ${activitySessions.length === 1 ? 'workout' : 'workouts'}` : 'No workouts logged'}` : 'Select a day to see its workouts.'}</Text>
            {activitySessions.map(log => {
              const matching = activitySessions.filter(item => item.title.trim().toLowerCase() === log.title.trim().toLowerCase());
              const time = log.loggedAt ? new Date(log.loggedAt) : null;
              const details = [
                time && Number.isFinite(time.getTime()) ? time.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : null,
                log.durationMinutes ? log.durationMinutes + ' min' : null,
                log.exercises?.length ? log.exercises.reduce((sum, row) => sum + (row.setDetails?.length ?? row.sets), 0) + ' sets' : null,
              ].filter(Boolean);
              return <Button key={log.id} buttonRef={refFor('activity:' + log.id)} onPress={() => openWorkout(log, 'activity:' + log.id)}>
                {matching.length > 1 ? [log.title, 'Session ' + (matching.indexOf(log) + 1), ...details].join(' · ') : log.title}
              </Button>;
            })}
          </Surface>
          <Surface>
            <View style={[styles.row, { alignItems: 'flex-start' }]}>
              <View style={{ flex: 1, gap: 5 }}><Text size={22} weight="semibold">{data.streaks.current} {data.streaks.current === 1 ? 'day' : 'days'}</Text><Text muted size={12}>Current streak</Text></View>
              <View style={{ flex: 1, gap: 5 }}><Text size={22} weight="semibold">{data.streaks.longest} {data.streaks.longest === 1 ? 'day' : 'days'}</Text><Text muted size={12}>Longest in period</Text></View>
            </View>
            <Text muted size={12}>Streaks count consecutive local workout days within this range. A current streak can end today or yesterday.</Text>
          </Surface>
        </> : page === 'volume' ? <VolumeDetail key={range} data={data} unit={unit} range={range} /> : <MuscleBalanceDetail key={range} logs={data.selected} />}
        </> : null}
      </>}
    </ScrollView>
  </SafeAreaView></Modal>;
}
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  button: { minHeight: 44, minWidth: 44, paddingHorizontal: 9, paddingVertical: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  metricGroup: { flexDirection: 'row', padding: 3, gap: 3, borderWidth: 1, borderRadius: 12 },
  metricButton: { flex: 1, paddingHorizontal: 3 },
  routineFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  routineFilter: { borderWidth: 1, paddingHorizontal: 12 },
  liftPicker: { gap: 12 },
  repDetail: { gap: 12, paddingVertical: 6 },
  repDetailWide: { flexDirection: 'row', alignItems: 'center' },
  repPlot: { gap: 6 },
  repBarRow: { gap: 5, paddingTop: 6 },
  repBar: { height: 6, borderRadius: 3 },
  repColumn: { flex: 1, minWidth: 0 },
  liftOption: { alignItems: 'flex-start', paddingHorizontal: 12 },
  breakdown: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  range: { padding: 3, gap: 2, borderRadius: 12 },
  surface: { padding: 17, borderRadius: 17, gap: 10 },
  stat: { flex: 1, minWidth: 0, paddingHorizontal: 10, paddingVertical: 11, borderRadius: 14, gap: 5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  destination: { width: '48.3%', borderRadius: 16, padding: 13, gap: 10, minHeight: 96, justifyContent: 'space-between' },
  notice: { padding: 13, borderRadius: 12, borderWidth: 1, gap: 8 },
  record: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, paddingVertical: 15 },
  state: { paddingVertical: 48, alignItems: 'center', gap: 16 },
});

