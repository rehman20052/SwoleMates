import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions, type ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppText, Input, ScrollBody } from './ui';
import { WorkoutLogIcon } from './workout-log-editor';
import { useAppTheme } from '@/theme';
import { useAppData } from '@/state/app-data';
import { exerciseOptions, loadExerciseCatalog } from '@/lib/exercise-catalog';
import type { DraftExercise, WorkoutDraft } from '@/lib/workout-drafts';
import { exerciseName } from '@/lib/workout-logging';
import { normalizeTemplateRows, validTemplateRows } from '@/lib/workout-template';

type Template = WorkoutDraft & { id: string };
type Split = { id?: string; title: string; days: string[] };
type Tab = 'template' | 'split' | 'saved';
const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const meta = (plan: Template, compact = false) => `${plan.rows.length} ${plan.rows.length === 1 ? 'exercise' : 'exercises'}${compact && plan.durationMinutes ? '' : ` · ${plan.rows.reduce((sum, row) => sum + Number(row.sets || 0), 0)} sets`}${plan.durationMinutes ? ` · ${plan.durationMinutes} min` : ''}`;

export function WorkoutPlanner({ templates, splits, onClose }: { templates: Template[]; splits: Split[]; onClose: () => void }) {
  const theme = useAppTheme(), c = theme.colors;
  const { width } = useWindowDimensions();
  const narrow = width < 480;
  const { accountUserId, saveWorkspaceSetting, foodJournalReady } = useAppData();
  const currentSplit = splits.at(-1);
  const [tab, setTab] = useState<Tab>('template');
  const [title, setTitle] = useState(''), [minutes, setMinutes] = useState('');
  const [rows, setRows] = useState<DraftExercise[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [splitTitle, setSplitTitle] = useState(currentSplit?.title ?? '');
  const [days, setDays] = useState<string[]>(currentSplit?.days ?? Array(7).fill(''));
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [picking, setPicking] = useState(false), [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]), [catalog, setCatalog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(false);
  const locked = useRef(false), splitDirty = useRef(false);
  const templateId = useRef(`workout-plan:${uid()}`), splitId = useRef(`workout-split:${uid()}`);
  const scrollRef = useRef<ScrollView>(null);
  const disabled = busy || !foodJournalReady;
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [tab, picking]);
  useEffect(() => { let active = true; void loadExerciseCatalog(AsyncStorage).then(data => { if (active) setCatalog(data.names); }); return () => { active = false; }; }, []);
  useEffect(() => { if (currentSplit && !splitDirty.current) { setSplitTitle(currentSplit.title); setDays(currentSplit.days); } }, [currentSplit?.id, currentSplit?.title, JSON.stringify(currentSplit?.days)]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && (picking || openDay !== null)) { event.stopPropagation(); event.preventDefault(); if (picking) setPicking(false); else setOpenDay(null); } };
    window.addEventListener('keyup', escape, true);
    return () => window.removeEventListener('keyup', escape, true);
  }, [picking, openDay]);

  function say(value: string, failed = false) { setMessage(value); setError(failed); }
  function changeTab(value: Tab) { setTab(value); setPicking(false); setOpenDay(null); say(''); }
  function freshTemplate() { setTitle(''); setMinutes(''); setRows([]); setEditing(null); templateId.current = `workout-plan:${uid()}`; changeTab('template'); }
  function edit(plan: Template) {
    setTitle(plan.title); setMinutes(plan.durationMinutes === undefined ? '' : String(plan.durationMinutes));
    setRows(plan.rows.map(row => ({ ...row, id: uid(), setValues: row.setValues?.map(set => ({ ...set, completed: false })) })));
    setEditing(plan.id); changeTab('template');
  }
  function useInSplit(plan: Template) {
    const day = days.findIndex(id => !id || !templates.some(t => t.id === id));
    changeTab('split');
    if (day < 0) { say('Your week is full. Choose a day to change its routine.'); return; }
    splitDirty.current = true; setDays(current => current.map((id, i) => i === day ? plan.id : id));
    say(`${plan.title} added to ${daysOfWeek[day]}. Save your weekly split when you’re ready.`);
  }
  function addSelected() {
    if (rows.length + selected.length > 30) { say('Use up to 30 exercises in a template.', true); return; }
    setRows(current => [...current, ...selected.map(name => ({ id: uid(), exercise: name, customName: '', sets: '3', reps: '8', repRange: '8–12', weight: '', unit: 'lb' as const }))]);
    setPicking(false); setSelected([]); say('');
  }
  async function save(kind: 'template' | 'split') {
    if (locked.current || !foodJournalReady) return;
    if (!accountUserId) { say('Sign in to save your workout plan.', true); return; }
    if (kind === 'template' && (!title.trim() || !validTemplateRows(rows) || (minutes.trim() && (!Number.isInteger(Number(minutes)) || Number(minutes) < 1 || Number(minutes) > 1440)))) {
      say(!title.trim() ? 'Give your template a name.' : !rows.length ? 'Choose at least one exercise.' : 'Use 1–100 sets and reps, or a rep range such as 8–12. Minutes are optional (1–1440).', true); return;
    }
    const knownDays = days.map(id => templates.some(plan => plan.id === id) ? id : '');
    if (kind === 'split' && (!splitTitle.trim() || !knownDays.some(Boolean))) { say('Name your split and choose a template for at least one day.', true); return; }
    locked.current = true; setBusy(true); say('');
    const id = kind === 'template' ? editing ?? templateId.current : currentSplit?.id ?? splitId.current;
    const value = kind === 'template'
      ? { title: title.trim(), notes: templates.find(plan => plan.id === editing)?.notes ?? '', rows: normalizeTemplateRows(rows), ...(minutes.trim() ? { durationMinutes: Number(minutes) } : {}) }
      : { title: splitTitle.trim(), days: knownDays };
    try {
      const saved = await saveWorkspaceSetting(id, JSON.stringify(value), accountUserId, Date.now());
      if (!saved) { say('Could not save your plan. Your entries are still here; try again.', true); return; }
      if (kind === 'template') { setEditing(id); setTab('saved'); say(`“${title.trim()}” saved to your template library.`); }
      else { setDays(knownDays); splitDirty.current = false; say(`“${splitTitle.trim()}” saved. Your week is ready.`); }
    } catch { say('Could not save your plan. Your entries are still here; try again.', true); }
    finally { locked.current = false; setBusy(false); }
  }
  function Text({ children, muted, size = 14, strong = false }: { children: ReactNode; muted?: boolean; size?: number; strong?: boolean }) {
    return <AppText display={false} size={size} weight={strong ? 'semibold' : 'regular'} color={muted ? c.muted : c.text}>{children}</AppText>;
  }
  function Button({ children, onPress, primary = false, label, unavailable = false }: { children: string; onPress: () => void; primary?: boolean; label?: string; unavailable?: boolean }) {
    return <Pressable accessibilityRole="button" accessibilityLabel={label ?? children} disabled={disabled || unavailable} onPress={onPress} style={[s.button, { backgroundColor: primary ? c.primary : c.surface, borderColor: primary ? c.primary : c.border, opacity: disabled || unavailable ? 0.45 : 1 }]}><AppText display={false} size={14} weight="semibold" color={primary ? c.primaryText : c.text}>{children}</AppText></Pressable>;
  }
  const inputStyle = { backgroundColor: c.surfaceRaised, borderColor: c.border, color: c.text, fontFamily: theme.fonts.regular };
  const plans = exerciseOptions([...templates.flatMap(plan => plan.rows.map(exerciseName)), ...catalog], search).filter(name => name !== 'Other').slice(0, search ? 40 : 8);
  const cardStyle = { backgroundColor: c.surface, borderColor: c.border };
  const footer = (children: ReactNode) => <View style={[s.footer, { borderColor: c.border }]}>{children}</View>;
  return <Modal transparent visible animationType="fade" onRequestClose={() => { if (!busy) { if (picking) setPicking(false); else if (openDay !== null) setOpenDay(null); else onClose(); } }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.overlay, { backgroundColor: c.modalOverlay }]}>
      <View accessibilityViewIsModal style={[s.sheet, { backgroundColor: c.background, borderColor: c.border }]}>
        <View style={[s.header, { borderColor: c.border }]}>
          <View style={s.headerRow}><View style={{ flex: 1, gap: 8 }}><AppText size={11} weight="semibold" color={c.muted} style={{ letterSpacing: 1.2 }}>SWOLEMATES · TRAINING PLANNER</AppText><AppText size={28} color={c.text}>Create workout plan</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="Close create workout plan" disabled={busy} onPress={onClose} style={s.iconButton}><WorkoutLogIcon name="close" color={c.muted} /></Pressable></View>
          <Text muted>Build your templates. Organize your week.</Text>
          <View accessibilityRole="tablist" style={[s.tabs, { borderColor: c.border }]}>{([['template', 'Workout template'], ['split', 'Weekly split'], ['saved', 'View saved templates']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} disabled={disabled} onPress={() => changeTab(value)} style={[s.tab, { borderBottomColor: tab === value ? c.primary : 'transparent' }]}><AppText display={false} size={narrow ? 12 : 14} weight="medium" color={tab === value ? c.text : c.muted} style={{ textAlign: 'center' }}>{label}</AppText></Pressable>)}</View>
        </View>
        <ScrollBody ref={scrollRef} contentContainerStyle={[s.content, narrow && { padding: 18 }]}>
          {message ? <View style={[s.notice, { backgroundColor: c.surfaceRaised }]}><AppText size={14} color={error ? c.danger : c.text} accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite">{message}</AppText></View> : null}
          {picking ? <>
            <Button onPress={() => { setPicking(false); say(''); }}>Back to template</Button>
            <View style={{ gap: 5 }}><Text size={18} strong>Choose exercises</Text><Text muted>Pick a few to build your workout.</Text></View>
            <Input accessibilityLabel="Search exercises" value={search} onChangeText={value => setSearch(value.slice(0, 100))} placeholder="Search or add your own" style={[s.input, inputStyle]} />
            <View>{plans.map(name => { const added = rows.some(row => exerciseName(row).toLowerCase() === name.toLowerCase()), checked = selected.includes(name); return <Pressable key={name} accessibilityRole="checkbox" accessibilityLabel={name} accessibilityState={{ checked: added || checked, disabled: added || disabled }} disabled={added || disabled} onPress={() => setSelected(current => checked ? current.filter(value => value !== name) : [...current, name])} style={[s.option, { borderBottomColor: c.border }]}><View style={[s.check, { borderColor: added || checked ? c.accent : c.border, backgroundColor: added || checked ? c.primaryTint : 'transparent' }]}>{added || checked ? <WorkoutLogIcon name="check" color={c.accent} size={16} /> : null}</View><View style={{ flex: 1 }}><Text>{name}</Text>{added ? <Text muted size={12}>Already in your template</Text> : null}</View></Pressable>; })}</View>
            {search.trim() && !plans.some(name => name.toLowerCase() === search.trim().toLowerCase()) ? <Button onPress={() => { const name = search.trim(); if (rows.some(row => exerciseName(row).toLowerCase() === name.toLowerCase())) { say('That exercise is already in your template.', true); return; } setSelected(current => current.includes(name) ? current : [...current, name]); setSearch(''); say('Custom exercise selected. Add it when you’re ready.'); }}>{`Add “${search.trim()}” as a custom exercise`}</Button> : null}
            {!search ? <Text muted>Search for more exercises.</Text> : null}
            {footer(<Button primary onPress={addSelected} unavailable={!selected.length}>{selected.length ? `Add ${selected.length} ${selected.length === 1 ? 'exercise' : 'exercises'}` : 'Choose exercises to add'}</Button>)}
          </> : tab === 'template' ? <>
            <View style={s.between}><Text size={18} strong>{editing ? 'Edit template' : 'Workout details'}</Text>{editing ? <Button onPress={freshTemplate}>New template</Button> : null}</View>
            <View style={s.details}><View style={{ flex: 1, gap: 8 }}><Text strong>Template name</Text><Input accessibilityLabel="Template name" value={title} maxLength={100} onChangeText={setTitle} editable={!disabled} placeholder="e.g. Upper body" style={[s.input, inputStyle]} /></View><View style={{ width: narrow ? 100 : 125, gap: 8 }}><Text strong>Minutes</Text><Input accessibilityLabel="Minutes (optional)" value={minutes} maxLength={4} onChangeText={setMinutes} editable={!disabled} placeholder="Optional" keyboardType="number-pad" style={[s.input, inputStyle]} /></View></View>
            <View style={s.between}><Text size={18} strong>Exercises</Text><Text muted>{`${rows.length} added`}</Text></View>
            {!rows.length ? <View style={[s.empty, cardStyle]}><WorkoutLogIcon name="dumbbell" size={30} color={c.muted} /><Text size={18} strong>Start with your exercises</Text><Text muted>Choose your movements, then set your sets and reps.</Text><Button onPress={() => { setPicking(true); setSearch(''); setSelected([]); say(''); }}>Choose exercises</Button></View> : rows.map((row, i) => <View key={row.id} style={[s.card, cardStyle]}><View style={s.headerRow}><Text muted size={12}>{String(i + 1).padStart(2, '0')}</Text><View style={{ flex: 1 }}><Text size={16} strong>{exerciseName(row)}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Remove ${exerciseName(row)}`} disabled={disabled} onPress={() => setRows(current => current.filter(item => item.id !== row.id))} style={s.iconButton}><WorkoutLogIcon name="close" color={c.muted} size={18} /></Pressable></View><View style={s.details}>{(['sets', 'reps'] as const).map(key => <View key={key} style={{ flex: 1, gap: 8 }}><Text>{key === 'sets' ? 'Sets' : 'Reps'}</Text><Input accessibilityLabel={`${exerciseName(row)} ${key}`} editable={!disabled} keyboardType={key === 'sets' ? 'number-pad' : 'default'} value={key === 'sets' ? row.sets : row.repRange ?? row.reps} maxLength={key === 'sets' ? 3 : 12} onChangeText={value => setRows(current => current.map(item => item.id === row.id ? { ...item, ...(key === 'sets' ? { sets: value } : { repRange: value }), setValues: undefined } : item))} style={[s.input, inputStyle]} /></View>)}</View></View>)}
            {rows.length ? <Button unavailable={rows.length >= 30} onPress={() => { setPicking(true); setSearch(''); setSelected([]); say(''); }}>Add exercises</Button> : null}
            {footer(<><Button primary onPress={() => void save('template')}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save template'}</Button><Text muted size={12}>Set your weights when you log your workout.</Text></>)}
          </> : tab === 'saved' ? <>
            <View style={{ gap: 5 }}><Text size={18} strong>Your workout library</Text><Text muted>{`${templates.length} reusable templates`}</Text></View>
            {!templates.length ? <View style={[s.empty, cardStyle]}><Text strong>No saved templates yet</Text><Text muted>Create your first template to plan your training week.</Text></View> : templates.map(plan => <View key={plan.id} style={[s.card, cardStyle]}><View style={{ gap: 5 }}><Text size={18} strong>{plan.title}</Text><Text muted>{meta(plan)}</Text></View><Text muted>{plan.rows.map(exerciseName).join(' · ')}</Text><View style={s.details}><View style={{ flex: 1 }}><Button label={`Edit ${plan.title}`} onPress={() => edit(plan)}>Edit</Button></View><View style={{ flex: 1 }}><Button label={`Use ${plan.title} in split`} onPress={() => useInSplit(plan)}>Use in split</Button></View></View></View>)}
            <Button primary onPress={freshTemplate}>Create a new template</Button>
          </> : <>
            <View style={{ gap: 5 }}><Text size={18} strong>Your training week</Text><Text muted>Choose a template for each training day.</Text></View>
            <View style={{ gap: 8 }}><Text strong>Split name</Text><Input accessibilityLabel="Split name" value={splitTitle} maxLength={100} onChangeText={value => { splitDirty.current = true; setSplitTitle(value); }} editable={!disabled} placeholder="e.g. Push / Pull / Legs" style={[s.input, inputStyle]} /></View>
            <View style={{ gap: 12 }}><View style={s.between}><Text size={18} strong>Weekly schedule</Text><Text muted size={12}>{`${days.filter(id => templates.some(t => t.id === id)).length} training · ${days.filter(id => !templates.some(t => t.id === id)).length} rest`}</Text></View>
              {!templates.length ? <Text muted>Create a template first, then assign it to a training day.</Text> : null}
              {daysOfWeek.map((day, i) => { const plan = templates.find(t => t.id === days[i]), opened = openDay === i; return <View key={day} style={s.day}><View style={{ width: narrow ? 59 : 82, gap: 3, paddingTop: 13 }}><Text strong size={narrow ? 13 : 14}>{narrow ? day.slice(0, 3) : day}</Text><Text muted size={12}>{plan ? 'Training' : 'Recovery'}</Text></View><View style={{ flex: 1, minWidth: 0 }}><Pressable accessibilityRole="button" accessibilityLabel={`${day} routine: ${plan?.title ?? 'Rest day'}`} accessibilityState={{ expanded: opened }} disabled={disabled} onPress={() => setOpenDay(opened ? null : i)} style={[s.dayTrigger, { ...cardStyle, borderColor: opened ? c.accent : c.border, borderBottomLeftRadius: opened ? 0 : 10, borderBottomRightRadius: opened ? 0 : 10 }]}><View style={[s.symbol, { backgroundColor: plan ? c.primaryTint : c.surfaceRaised }]}><WorkoutLogIcon name={plan ? 'dumbbell' : 'clock'} size={18} color={plan ? c.accent : c.muted} /></View><View style={{ flex: 1, minWidth: 0, gap: 3 }}><Text strong>{plan?.title ?? 'Rest day'}</Text><Text muted size={12}>{plan ? meta(plan, true) : 'Recovery & rest'}</Text></View><WorkoutLogIcon name={opened ? 'up' : 'down'} color={c.muted} size={16} /></Pressable>
                {opened ? <View accessibilityRole="radiogroup" accessibilityLabel={`${day} templates`} style={[s.dayOptions, { backgroundColor: c.surface, borderColor: c.accent }]}><AppText size={11} color={c.muted} style={{ padding: 9, letterSpacing: 1 }}>{`ASSIGN TO ${day.toUpperCase()}`}</AppText>{[{ id: '', title: 'Rest day' }, ...templates].map(option => <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={`Assign ${option.title} to ${day}`} accessibilityState={{ checked: (plan?.id ?? '') === option.id }} disabled={disabled} onPress={() => { splitDirty.current = true; setDays(current => current.map((id, index) => index === i ? option.id : id)); setOpenDay(null); say(''); }} style={[s.dayOption, { backgroundColor: (plan?.id ?? '') === option.id ? c.surfaceRaised : 'transparent' }]}><View style={[s.radio, { borderColor: (plan?.id ?? '') === option.id ? c.accent : c.border }]}>{(plan?.id ?? '') === option.id ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.accent }} /> : null}</View><View style={{ flex: 1, gap: 3 }}><Text strong>{option.title}</Text><Text muted size={12}>{'rows' in option ? meta(option) : 'No workout scheduled'}</Text></View></Pressable>)}</View> : null}
              </View></View>; })}</View>
            <View style={s.between}><Text muted size={12}>Repeat this schedule each week</Text><Button onPress={() => changeTab('saved')}>View templates</Button></View>
            {footer(<Button primary onPress={() => void save('split')}>{busy ? 'Saving…' : 'Save weekly split'}</Button>)}
          </>}
        </ScrollBody>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const s = StyleSheet.create({
  overlay: { flex: 1, padding: 12, alignItems: 'center', justifyContent: 'center' },
  sheet: { width: '100%', maxWidth: 650, height: '92%', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  header: { padding: 18, paddingBottom: 0, gap: 12 }, headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tabs: { flexDirection: 'row', gap: 10, borderBottomWidth: 1 }, tab: { flex: 1, minHeight: 56, justifyContent: 'center', borderBottomWidth: 2, paddingVertical: 12 },
  content: { padding: 28, gap: 24 }, between: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  details: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, input: { height: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 16 },
  button: { minHeight: 46, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, card: { padding: 16, borderWidth: 1, borderRadius: 12, gap: 14 },
  empty: { padding: 24, borderWidth: 1, borderRadius: 12, gap: 12, alignItems: 'center' }, footer: { borderTopWidth: 1, paddingTop: 18, gap: 12 },
  notice: { padding: 14, borderRadius: 10 }, option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 52, borderBottomWidth: 1 },
  check: { width: 22, height: 22, borderWidth: 1, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  day: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, dayTrigger: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 10, minHeight: 70, padding: 10 },
  symbol: { width: 30, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, dayOptions: { padding: 7, borderWidth: 1, borderTopWidth: 0, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
  dayOption: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, padding: 10, borderRadius: 7 }, radio: { width: 17, height: 17, borderWidth: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
