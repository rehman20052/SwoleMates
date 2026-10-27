import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path } from 'react-native-svg';
import { AppText, Avatar, Input, ScrollBody } from './ui';
import { useAppTheme } from '@/theme';
import { exerciseOptions, loadExerciseCatalog } from '@/lib/exercise-catalog';
import { draftSets, exerciseName, lastPerformance, prefillExercise, validDraftSet, workoutStats, type PerformanceLog } from '@/lib/workout-logging';
import type { DraftExercise, DraftSet } from '@/lib/workout-drafts';
import type { WorkoutExercise } from '@/lib/workout-session';

export function useWorkoutLogPalette() {
  const { colors } = useAppTheme();
  return {
    background: colors.background,
    surface: colors.surface,
    field: colors.surfaceRaised,
    border: colors.border,
    text: colors.text,
    muted: colors.muted,
    complete: colors.primaryTint,
    accent: colors.accent,
    primary: colors.primary,
    onPrimary: colors.primaryText,
    danger: colors.danger,
  };
}

const iconPaths = {
  plus: 'M10 4v12M4 10h12',
  close: 'm5 5 10 10M15 5 5 15',
  minus: 'M4 10h12',
  check: 'm4 10 4 4 8-8',
  more: 'M4 10h.01M10 10h.01M16 10h.01',
  trash: 'M4 6h12M8 3h4l1 3M6 6l1 11h6l1-11M9 9v5M11 9v5',
  chevron: 'm7 5 5 5-5 5',
  down: 'm6 8 4 4 4-4',
  up: 'm6 12 4-4 4 4',
  search: 'M13 13l4 4M14 8.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0',
  clock: 'M10 6v4l3 2M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  dumbbell: 'm7 13 6-6M3 10l7 7M10 3l7 7M2 13l5 5M13 2l5 5M4 9l-2 2 7 7 2-2M9 4l2-2 7 7-2 2',
};
export function WorkoutLogIcon({ name, color, size = 20 }: { name: keyof typeof iconPaths; color: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 20 20" aria-hidden={true} focusable={false}><Path d={iconPaths[name]} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

export function WorkoutLogButton({ children, onPress, disabled, primary, accessibilityLabel }: { children: ReactNode; onPress: () => void; disabled?: boolean; primary?: boolean; accessibilityLabel?: string }) {
  const palette = useWorkoutLogPalette();
  const withPlus = typeof children === 'string' && /^[＋+]\s*/.test(children);
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={[styles.button, { borderColor: primary ? palette.primary : palette.border, backgroundColor: primary ? palette.primary : 'transparent', opacity: disabled ? 0.4 : 1 }]}>
    {withPlus ? <WorkoutLogIcon name="plus" size={17} color={primary ? palette.onPrimary : palette.text} /> : null}
    <AppText display={false} size={14} weight="semibold" color={primary ? palette.onPrimary : palette.text}>{withPlus ? (children as string).replace(/^[＋+]\s*/, '') : children}</AppText>
  </Pressable>;
}

export function WorkoutLogHeader({ title, onTitleChange, date, minutes, onMinutesChange, disabled, partnerName, partnerPhoto, onDiscard, discardLabel = 'Discard workout', hideTitle = false, fixedTitle = false }: {
  title: string; onTitleChange: (value: string) => void; date: string; minutes?: string; onMinutesChange?: (value: string) => void; disabled?: boolean; partnerName?: string; partnerPhoto?: string | null; onDiscard?: () => void; discardLabel?: string; hideTitle?: boolean; fixedTitle?: boolean;
}) {
  const palette = useWorkoutLogPalette();
  const theme = useAppTheme();
  return <View style={{ gap: 20 }}>
    {onDiscard ? <View style={styles.row}><AppText display={false} size={13} weight="medium" color={palette.muted}>Workout session</AppText><Pressable accessibilityRole="button" accessibilityLabel={discardLabel} disabled={disabled} onPress={onDiscard} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}><AppText display={false} size={13} weight="medium" color={palette.danger}>Discard</AppText></Pressable></View> : null}
    {partnerName ? <View style={[styles.partner, { borderColor: palette.border }]}>
      {partnerPhoto ? <Avatar source={{ uri: partnerPhoto }} size={36} /> : <View accessibilityLabel={`${partnerName} profile icon`} style={[styles.avatar, { backgroundColor: palette.field }]}><AppText size={13} weight="semibold" color={palette.text}>{partnerName.split(/\s+/).map(part => part[0]).slice(0, 2).join('')}</AppText></View>}
      <View style={{ flex: 1, gap: 3 }}><AppText display={false} size={14} weight="medium" color={palette.text}>With {partnerName}</AppText><AppText size={12} color={palette.muted}>Checked in · Personal workout log</AppText></View>
    </View> : null}
    <View style={{ gap: 12 }}>
      {!hideTitle ? <View style={{ minWidth: 0, ...(Platform.OS === 'web' ? { fontSize: 28 } : {}) }}>
        {fixedTitle ? <AppText display={false} size={28} weight="semibold" color={palette.text} accessibilityRole="header">{title}</AppText> :
        <Input accessibilityLabel="Workout name" placeholder="Untitled workout" value={title} maxLength={100} onChangeText={onTitleChange} editable={!disabled} style={{ height: 44, paddingHorizontal: 0, backgroundColor: 'transparent', fontFamily: theme.fonts.semibold, fontSize: 28, color: palette.text }} />
        }
      </View> : null}
      <View style={[styles.row, { paddingBottom: 18, borderBottomWidth: 1, borderColor: palette.border }]}>
        <AppText size={12} color={palette.muted}>{new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</AppText>
        {onMinutesChange ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><WorkoutLogIcon name="clock" color={palette.muted} size={14} /><Input accessibilityLabel="Minutes" keyboardType="number-pad" editable={!disabled} value={minutes} onChangeText={onMinutesChange} style={{ width: 46, height: 44, minHeight: 44, paddingHorizontal: 0, paddingVertical: 4, backgroundColor: 'transparent', color: palette.text, textAlign: 'center', fontSize: 13 }} /><AppText size={12} color={palette.muted}>min</AppText></View> : null}
      </View>
    </View>
  </View>;
}

/** Shared compact set table for every entry point. Persistence stays with each caller. */
export function WorkoutSetEditor({ rows, setRows, disabled, onChange, preserveCompletionOnEdit = false, history = [] }: {
  rows: DraftExercise[]; setRows: Dispatch<SetStateAction<DraftExercise[]>>; disabled: boolean; onChange?: () => void; preserveCompletionOnEdit?: boolean; history?: PerformanceLog[];
}) {
  const palette = useWorkoutLogPalette();
  const theme = useAppTheme();
  const [picking, setPicking] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [unit, setUnit] = useState<'lb' | 'kg'>(rows[0]?.unit ?? 'lb');
  const [unitOpen, setUnitOpen] = useState(false);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState<string | null>(null);
  const stats = workoutStats(rows);
  const displayedUnit = rows[0]?.unit ?? unit;
  useEffect(() => { let active = true; void loadExerciseCatalog(AsyncStorage).then(data => { if (active) setCatalog(data.names); }); return () => { active = false; }; }, []);
  function change(update: SetStateAction<DraftExercise[]>) { onChange?.(); setError(''); setRows(update); }
  function replaceSets(row: DraftExercise, sets: DraftSet[]) {
    change(current => sets.length ? current.map(item => item.id === row.id ? { ...item, sets: String(sets.length), reps: sets[0].reps, weight: sets[0].weight, setValues: sets } : item) : current.filter(item => item.id !== row.id));
  }
  function editSet(row: DraftExercise, index: number, patch: Partial<DraftSet>) {
    replaceSets(row, draftSets(row).map((set, i) => i === index ? { ...set, ...patch, completed: patch.completed ?? (preserveCompletionOnEdit ? set.completed : false) } : set));
  }
  function changeUnit(next: 'lb' | 'kg') {
    setUnit(next); setUnitOpen(false);
    change(current => current.map(row => {
      if (row.unit === next) return row;
      const factor = next === 'kg' ? 0.45359237 : 1 / 0.45359237;
      const convert = (v: string) => v.trim() && Number.isFinite(Number(v)) ? String(Math.round(Number(v) * factor * 100) / 100) : v;
      return { ...row, unit: next, weight: convert(row.weight), setValues: draftSets(row).map(set => ({ ...set, weight: convert(set.weight) })) };
    }));
  }
  function choose(name: string) {
    const id = picking === 'new' ? `exercise-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : picking!;
    const customName = name === 'Other' ? search.trim().slice(0, 100) : '';
    if (name === 'Other' && !customName) { setError('Enter an exercise name.'); return; }
    const previous = lastPerformance(history, customName || name);
    const row: DraftExercise = { id, exercise: name, customName, sets: '3', reps: '', weight: '', unit: displayedUnit };
    const next = previous ? prefillExercise(row, previous) : row;
    change(current => picking === 'new' ? [...current, next] : current.map(item => item.id === id ? next : item));
    setPicking(null); setSearch(''); setMenu(null);
  }
  function toggleSelection(name: string) {
    setSelected(current => current.includes(name) ? current.filter(item => item !== name) : [...current, name]);
  }
  function addSelected() {
    if (!selected.length || disabled) return;
    if (rows.length + selected.length > 30) { setError('Use up to 30 exercises in a workout.'); return; }
    const additions = selected.map(name => {
      const row: DraftExercise = { id: `exercise-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, exercise: name, customName: '', sets: '3', reps: '', weight: '', unit: displayedUnit };
      const previous = lastPerformance(history, name);
      return previous ? prefillExercise(row, previous) : row;
    });
    change(current => [...current, ...additions]);
    setPicking(null); setSearch(''); setSelected([]); setMenu(null);
  }
  const candidates = exerciseOptions([...selected, ...history.flatMap(log => log.exercises?.map(e => e.name) ?? []), ...catalog], search).filter(name => !['Choose exercise', 'Other'].includes(name)).slice(0, 40);
  return <View style={{ gap: 16 }}>
    <View style={{ gap: 10 }}>
      <View style={styles.row}>
        <View style={{ gap: 3 }}><AppText display={false} size={14} weight="semibold" color={palette.text}>Exercises</AppText><AppText size={12} color={palette.muted} accessibilityLiveRegion="polite">{stats.sets} of {stats.plannedSets} sets completed</AppText></View>
        <View style={{ width: 76 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Weight unit ${displayedUnit}`} accessibilityState={{ expanded: unitOpen, disabled }} disabled={disabled} onPress={() => setUnitOpen(!unitOpen)} style={[styles.unit, { backgroundColor: palette.field, borderColor: palette.border }]}><AppText size={12} weight="medium" color={palette.muted}>{displayedUnit}</AppText><WorkoutLogIcon name="down" size={13} color={palette.muted} /></Pressable>
          {unitOpen ? <View style={{ borderWidth: 1, borderColor: palette.border, borderRadius: 10, backgroundColor: palette.surface }}>{(['lb', 'kg'] as const).map(next => <Pressable key={next} accessibilityRole="button" accessibilityLabel={`Use ${next} for all exercises`} disabled={disabled} onPress={() => changeUnit(next)} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><AppText size={14} color={palette.text}>{next}</AppText></Pressable>)}</View> : null}
        </View>
      </View>
      <View accessibilityRole="progressbar" accessibilityLabel="Workout set progress" accessibilityValue={{ min: 0, max: Math.max(1, stats.plannedSets), now: stats.sets }} style={{ height: 2, backgroundColor: palette.border, borderRadius: 4, overflow: 'hidden' }}><View style={{ height: 2, backgroundColor: palette.accent, width: `${stats.plannedSets ? stats.sets / stats.plannedSets * 100 : 0}%` }} /></View>
    </View>
    {!rows.length ? <View style={[styles.empty, { backgroundColor: palette.surface }]}><WorkoutLogIcon name="dumbbell" size={28} color={palette.muted} /><AppText display={false} size={17} weight="semibold" color={palette.text}>No exercises yet</AppText><AppText size={13} color={palette.muted}>Add your first exercise to begin.</AppText></View> : null}
    {rows.map((row, index) => {
      const name = exerciseName(row), sets = draftSets(row);
      return <View key={row.id} testID="workout-exercise-card" style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View style={styles.row}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Change exercise ${index + 1}`} disabled={disabled} onPress={() => { setPicking(row.id); setSearch(''); setError(''); }} style={{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center' }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><AppText size={12} color={palette.muted}>{String(index + 1).padStart(2, '0')}</AppText><AppText display={false} size={17} weight="semibold" color={palette.text} style={{ flex: 1 }}>{name || 'Choose exercise'}</AppText></View></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Options for ${name}`} accessibilityState={{ expanded: menu === row.id }} disabled={disabled} onPress={() => setMenu(menu === row.id ? null : row.id)} style={styles.icon}><WorkoutLogIcon name="more" color={palette.muted} /></Pressable>

        </View>
        {menu === row.id ? <View style={[styles.exerciseMenu, { backgroundColor: palette.field }]}>{[-1, 1].map(direction => <Pressable key={direction} accessibilityRole="button" accessibilityLabel={`Move ${name} ${direction < 0 ? 'up' : 'down'}`} disabled={disabled || index + direction < 0 || index + direction >= rows.length} onPress={() => change(current => { const next = [...current]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; return next; })} style={styles.menuItem}><WorkoutLogIcon name={direction < 0 ? 'up' : 'down'} color={palette.muted} size={16} /><AppText size={13} color={palette.muted}>Move {direction < 0 ? 'up' : 'down'}</AppText></Pressable>)}<Pressable accessibilityRole="button" accessibilityLabel={`Remove ${name}`} disabled={disabled} onPress={() => change(current => current.filter(item => item.id !== row.id))} style={styles.menuItem}><WorkoutLogIcon name="trash" color={palette.danger} size={16} /><AppText size={13} color={palette.danger}>Remove exercise</AppText></Pressable></View> : null}
        <View style={[styles.setRow, { marginTop: 10, marginBottom: 2 }]}><AppText size={11} color={palette.muted} style={styles.setNumber}>Set</AppText><AppText size={11} color={palette.muted} style={styles.column}>Weight ({row.unit})</AppText><AppText size={11} color={palette.muted} style={styles.column}>Reps</AppText><AppText size={11} color={palette.muted} style={styles.done}>Done</AppText><View style={styles.remove} /></View>
        {row.repRange?.includes('–') ? <AppText size={12} color={palette.muted}>{`Target: ${row.repRange} reps per set`}</AppText> : null}
        {sets.map((set, si) => <View key={si} style={styles.setRow}>
          <AppText size={12} color={palette.muted} style={styles.setNumber}>{si + 1}</AppText>
          <Input accessibilityLabel={`${name} set ${si + 1} weight`} value={set.weight} onChangeText={weight => editSet(row, si, { weight })} keyboardType="decimal-pad" editable={!disabled} placeholder="—" style={[styles.input, styles.column, { backgroundColor: set.completed ? palette.complete : palette.field, borderColor: 'transparent', color: set.completed ? palette.muted : palette.text }]} />
          <Input accessibilityLabel={`${name} set ${si + 1} reps`} value={set.reps} onChangeText={reps => editSet(row, si, { reps })} keyboardType="number-pad" editable={!disabled} placeholder="—" style={[styles.input, styles.column, { backgroundColor: set.completed ? palette.complete : palette.field, borderColor: 'transparent', color: set.completed ? palette.muted : palette.text }]} />
          <Pressable accessibilityRole="checkbox" aria-checked={!!set.completed} accessibilityState={{ checked: !!set.completed, disabled }} accessibilityLabel={`${set.completed ? 'Undo' : 'Complete'} ${name} set ${si + 1}`} disabled={disabled} onPress={() => { if (!set.completed && (!name || !validDraftSet(set) || Number(set.weight) > 10000)) { setError('Enter an exercise name, 1–100 reps and a valid weight (0 for bodyweight).'); return; } editSet(row, si, { completed: !set.completed }); }} style={styles.check}><View style={[styles.checkMark, { borderColor: set.completed ? palette.accent : palette.border, backgroundColor: set.completed ? palette.complete : 'transparent' }]}>{set.completed ? <WorkoutLogIcon name="check" color={palette.accent} size={17} /> : null}</View></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${name} set ${si + 1}`} disabled={disabled} onPress={() => replaceSets(row, sets.filter((_, i) => i !== si))} style={styles.remove}><WorkoutLogIcon name="minus" color={palette.muted} size={15} /></Pressable>
        </View>)}
        <Pressable accessibilityRole="button" accessibilityLabel="Add set" disabled={disabled || sets.length >= 100} onPress={() => replaceSets(row, [...sets, { ...sets.at(-1)!, completed: false }])} style={[styles.addSet, { opacity: disabled || sets.length >= 100 ? 0.4 : 1 }]}><WorkoutLogIcon name="plus" size={15} color={palette.muted} /><AppText display={false} size={13} weight="semibold" color={palette.muted}>Add set</AppText></Pressable>
      </View>;
    })}
    {error ? <AppText size={13} color={theme.colors.danger} accessibilityRole="alert">{error}</AppText> : null}
    <WorkoutLogButton accessibilityLabel="Add exercise" disabled={disabled || rows.length >= 30} onPress={() => { setPicking('new'); setSearch(''); setSelected([]); setError(''); }}>＋ Add exercise</WorkoutLogButton>
    <Modal transparent visible={!!picking} animationType="fade" onRequestClose={() => setPicking(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.overlay, { backgroundColor: theme.colors.modalOverlay }]}>
        <View accessibilityViewIsModal style={[styles.picker, { backgroundColor: palette.background, borderColor: palette.border }]}>
          <View style={[styles.row, { paddingHorizontal: 18, paddingTop: 14 }]}><AppText display={false} size={20} weight="semibold" color={palette.text}>{picking === 'new' ? 'Add exercise' : 'Change exercise'}</AppText><Pressable accessibilityRole="button" accessibilityLabel="Cancel search" onPress={() => { setPicking(null); setError(''); }} style={styles.icon}><WorkoutLogIcon name="close" color={palette.muted} size={19} /></Pressable></View>
          <ScrollBody contentContainerStyle={{ padding: 18, gap: 12 }}>
            <Input autoFocus accessibilityLabel="Search exercises" placeholder="Search or add your own" value={search} onChangeText={value => setSearch(value.slice(0, 100))} style={[styles.search, { backgroundColor: palette.field, borderColor: palette.border, color: palette.text }]} />
            <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={{ maxHeight: 340 }}>{candidates.map(name => <Pressable key={name} accessibilityRole={picking === 'new' ? 'checkbox' : 'button'} accessibilityLabel={`Select ${name}`} accessibilityState={picking === 'new' ? { checked: selected.includes(name) } : undefined} disabled={disabled} onPress={() => picking === 'new' ? toggleSelection(name) : choose(name)} style={[styles.result, { borderColor: palette.border }]}><AppText size={15} color={palette.text} style={{ flex: 1 }}>{name}</AppText>{picking === 'new' ? <View style={[styles.checkMark, { borderColor: selected.includes(name) ? palette.accent : palette.border, backgroundColor: selected.includes(name) ? palette.complete : 'transparent' }]}>{selected.includes(name) ? <WorkoutLogIcon name="check" size={17} color={palette.accent} /> : null}</View> : <WorkoutLogIcon name="plus" size={17} color={palette.muted} />}</Pressable>)}
              {search.trim() && !candidates.some(name => name.toLowerCase() === search.trim().toLowerCase()) ? <Pressable accessibilityRole="button" accessibilityLabel={`Add custom exercise ${search.trim()}`} disabled={disabled} onPress={() => { if (picking === 'new') { const name = search.trim(); setSelected(current => current.includes(name) ? current : [...current, name]); setSearch(''); } else choose('Other'); }} style={[styles.result, { borderColor: palette.border }]}><AppText size={15} color={palette.text}>Add “{search.trim()}”</AppText><WorkoutLogIcon name="plus" size={17} color={palette.muted} /></Pressable> : null}
            </ScrollView>
            {picking === 'new' ? <><AppText size={12} color={palette.muted} accessibilityLiveRegion="polite">{selected.length} selected</AppText>{error ? <AppText size={13} color={palette.danger} accessibilityRole="alert">{error}</AppText> : null}<WorkoutLogButton primary disabled={disabled || !selected.length || rows.length + selected.length > 30} onPress={addSelected}>{selected.length ? `Add ${selected.length} ${selected.length === 1 ? 'exercise' : 'exercises'}` : 'Choose exercises to add'}</WorkoutLogButton></> : null}
          </ScrollBody>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}

export function WorkoutRecordedSets({ exercises }: { exercises: WorkoutExercise[] }) {
  const palette = useWorkoutLogPalette();
  return <View style={{ gap: 16 }}>{exercises.map(exercise => <View key={exercise.id} style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}><AppText display={false} size={17} weight="semibold" color={palette.text}>{exercise.name}</AppText><View style={[styles.row, { paddingTop: 14 }]}><AppText size={12} color={palette.muted} style={{ width: 28 }}>Set</AppText><AppText size={12} color={palette.muted} style={styles.column}>Weight ({exercise.unit})</AppText><AppText size={12} color={palette.muted} style={styles.column}>Reps</AppText><AppText size={12} color={palette.muted}>Done</AppText></View>{(exercise.setDetails ?? Array.from({ length: exercise.sets }, () => ({ reps: exercise.reps, weight: exercise.weight }))).map((set, i) => <View key={i} style={[styles.row, { minHeight: 44 }]}><AppText size={12} color={palette.muted} style={{ width: 28 }}>{i + 1}</AppText><AppText size={17} color={palette.text} style={styles.column}>{set.weight}</AppText><AppText size={17} color={palette.text} style={styles.column}>{set.reps}</AppText><WorkoutLogIcon name="check" size={16} color={palette.accent} /></View>)}</View>)}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  partner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 14, borderBottomWidth: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  empty: { borderRadius: 12, paddingVertical: 32, paddingHorizontal: 16, alignItems: 'center', gap: 12 },
  button: { minHeight: 48, borderWidth: 1, borderRadius: 10, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  unit: { minHeight: 44, borderWidth: 0, borderRadius: 8, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  column: { flex: 1, minWidth: 0, textAlign: 'center' },
  input: { height: 46, minHeight: 46, borderWidth: 1, borderRadius: 7, paddingHorizontal: 4, paddingVertical: 8, fontSize: 16, textAlign: 'center' },
  setNumber: { width: 20, textAlign: 'center' },
  done: { width: 44, textAlign: 'center' },
  check: { width: 44, height: 46, alignItems: 'center', justifyContent: 'center' },
  checkMark: { width: 28, height: 28, borderWidth: 1, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  exerciseMenu: { paddingHorizontal: 12, borderRadius: 8 },
  menuItem: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  remove: { width: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  addSet: { minHeight: 44, marginTop: 4, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 12 },
  picker: { width: '100%', maxWidth: 440, maxHeight: '85%', borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  search: { height: 48, fontSize: 16, borderWidth: 1, borderRadius: 10 },
  result: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 52, borderBottomWidth: 1, paddingVertical: 12 },
});
