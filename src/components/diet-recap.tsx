import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from './ui';
import { useTrainPalette } from './train-ui';
import { useAppTheme } from '@/theme';
import { daysFromToday, useAppData } from '@/state/app-data';
import { useWeightUnit } from '@/state/weight-unit';
import { maintenanceCalories } from '@/lib/macro-calculator';
import { dietPeriod, energyWeightLabel } from '@/lib/diet-recap';
import { weekBounds } from '@/lib/progress-recap';

const short = (date: string) => { const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
const number = (value: number) => Math.round(value).toLocaleString();

export function DietRecap({ weekStart, onOpenFuel }: { weekStart: string; onOpenFuel: () => void }) {
  const { foodEntries, foodJournalReady, foodJournalError, nutritionProfile } = useAppData();
  const palette = useTrainPalette(), theme = useAppTheme();
  const { unit } = useWeightUnit();
  const [offset, setOffset] = useState(0);
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [details, setDetails] = useState(false);
  const today = daysFromToday(0);
  const maintenance = nutritionProfile ? maintenanceCalories(nutritionProfile) : null;
  const [anchor, setAnchor] = useState(() => weekBounds(today).start === weekStart ? today : weekStart);
  const selected = dietPeriod(today, anchor, offset, period, foodEntries, maintenance);
  const next = dietPeriod(today, anchor, offset + 1, period, [], null);
  const current = dietPeriod(today, today, 0, period, [], null);
  const isCurrent = selected.start === current.start;
  const size = period === 'week' ? 1 : 7;
  const bars = Array.from({ length: Math.ceil(selected.days.length / size) }, (_, index) => {
    const days = selected.days.slice(index * size, (index + 1) * size);
    const elapsed = days.filter(day => !day.future);
    const logged = elapsed.filter(day => day.totals !== null);
    const missing = elapsed.filter(day => day.date < today && day.totals === null).length;
    return { date: days[0].date, end: days.at(-1)!.date, count: logged.length, elapsed: elapsed.length, missing,
      future: !elapsed.length, inProgress: days.some(day => day.date === today),
      calories: logged.length ? logged.reduce((sum, day) => sum + day.totals!.calories, 0) / logged.length : null };
  });
  const max = Math.max(1, maintenance ?? 0, ...bars.map(bar => bar.calories ?? 0)) * 1.15;
  const text = palette.text, muted = palette.muted, accent = theme.colors.accent;
  const consistent = selected.pastDays > 0 && selected.missingDays === 0;
  const estimateAvailable = selected.canEstimate && !foodJournalError;
  const iconButton = { minWidth: 44, minHeight: 44, alignItems: 'center' as const, justifyContent: 'center' as const };
  return <View style={{ backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, borderRadius: 12, padding: 20, gap: 20 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
      <AppText size={23} weight="bold" color={text}>Diet recap</AppText>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: palette.field, borderRadius: 8, padding: 3 }}>
        {(['week', 'month'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityLabel={`Diet recap by ${value}`} accessibilityState={{ selected: period === value }} onPress={() => { setPeriod(value); setOffset(0); }} style={{ minHeight: 38, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 6, backgroundColor: period === value ? theme.colors.primaryTint : 'transparent' }}><AppText size={12} weight="semibold" color={period === value ? accent : muted}>{value === 'week' ? 'Week' : 'Month'}</AppText></Pressable>)}
      </View>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: palette.border, paddingBottom: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Previous ${period}`} onPress={() => setOffset(value => value - 1)} style={iconButton}><AppText size={24} color={text}>‹</AppText></Pressable>
      <View style={{ flex: 1, alignItems: 'center', gap: 2 }}><AppText size={13} weight="semibold" color={text}>{short(selected.start)} – {short(selected.end)}, {selected.start.slice(0, 4)}{selected.start.slice(0, 4) !== selected.end.slice(0, 4) ? `–${selected.end.slice(0, 4)}` : ''}</AppText>
        {!isCurrent ? <Pressable accessibilityRole="button" accessibilityLabel={`Return to this ${period}`} onPress={() => { setAnchor(today); setOffset(0); }} style={{ minHeight: 32, justifyContent: 'center' }}><AppText size={11} color={accent}>Back to this {period}</AppText></Pressable> : <AppText size={11} color={muted}>This {period} · in progress</AppText>}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Next ${period}`} disabled={next.start > current.start} onPress={() => setOffset(value => value + 1)} style={[iconButton, { opacity: next.start > current.start ? 0.3 : 1 }]}><AppText size={24} color={text}>›</AppText></Pressable>
    </View>
    {!foodJournalReady ? <AppText color={muted}>Loading your food history…</AppText> : <>
      {foodJournalError ? <AppText size={12} color={theme.colors.danger}>Food history could not fully refresh. These are your saved entries; coverage may be incomplete.</AppText> : null}
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><AppText size={13} weight="semibold" color={consistent ? accent : text}>{consistent ? 'Consistent logging' : selected.loggedDays ? 'Partial logging' : 'No entries yet'}</AppText><AppText size={12} color={muted}>{selected.loggedDays}/{selected.elapsedDays} days so far</AppText></View>
        <View accessibilityLabel={`${selected.loggedDays} of ${selected.elapsedDays} elapsed days have food entries`} style={{ flexDirection: 'row', gap: 3, height: 5 }}>{selected.days.map(day => <View key={day.date} style={{ flex: 1, borderRadius: 3, backgroundColor: day.totals ? accent : palette.field, opacity: day.future ? 0.35 : day.date === today ? 0.6 : 1, borderWidth: !day.future && !day.totals ? 1 : 0, borderColor: palette.border }} />)}</View>
        <AppText size={12} color={muted}>{selected.missingDays ? `${selected.missingDays} past ${selected.missingDays === 1 ? 'day has' : 'days have'} no food data. Averages reflect only days with entries.` : consistent ? 'Food entries on every past day. Individual meals may still be missing.' : 'Start logging in Fuel to build your food history.'}</AppText>
      </View>
      <View style={{ gap: 10 }}><AppText size={12} weight="semibold" color={muted}>{period === 'week' ? 'DAILY CALORIES' : 'CALORIES / LOGGED DAY · 7-DAY GROUPS'}</AppText>
        <View style={{ height: 184, flexDirection: 'row', gap: 6 }}>
          {bars.map((bar, index) => <View key={bar.date} accessible accessibilityLabel={`${short(bar.date)}${period === 'month' ? ` to ${short(bar.end)}` : ''}: ${bar.future ? 'upcoming' : bar.calories === null ? bar.inProgress ? 'today, no entries yet' : 'missing food data' : `${number(bar.calories)} calories per logged day, ${bar.count} of ${bar.elapsed} elapsed days logged${bar.missing ? ', incomplete coverage' : ''}${bar.inProgress ? ', today in progress' : ''}`}`} style={{ flex: 1, gap: 6 }}>
            <AppText size={10} color={text} style={{ textAlign: 'center' }}>{bar.calories === null ? '—' : number(bar.calories)}</AppText>
            <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: palette.field, borderRadius: 5, overflow: 'hidden', opacity: bar.future ? 0.3 : 1, borderWidth: bar.missing && !bar.count ? 1 : 0, borderStyle: 'dashed', borderColor: palette.border }}>
              {bar.calories !== null ? <View style={{ height: `${Math.max(1, bar.calories / max * 100)}%`, backgroundColor: theme.colors.primaryTint, opacity: bar.missing || bar.inProgress ? 0.6 : 1, borderTopWidth: 3, borderTopColor: accent }} /> : null}
              {maintenance !== null && !bar.future ? <View pointerEvents="none" style={{ position: 'absolute', bottom: `${maintenance / max * 100}%`, width: '100%', borderTopWidth: 1, borderStyle: 'dashed', borderColor: muted }} /> : null}
            </View>
            <AppText size={11} color={muted} style={{ textAlign: 'center' }}>{period === 'week' ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'][index] : `${Number(bar.date.slice(-2))}–${Number(bar.end.slice(-2))}`}</AppText>
            <AppText size={9} color={muted} style={{ textAlign: 'center' }}>{bar.future ? 'Soon' : period === 'month' ? `${bar.count}/${bar.elapsed} days` : bar.inProgress ? 'Today*' : bar.count ? 'Logged' : 'No data'}</AppText>
          </View>)}
        </View>
        <AppText size={11} color={muted}>No data ≠ zero calories{selected.days.some(day => day.date === today) ? ' · *Today is still in progress' : ''}{maintenance !== null ? `\nDashed line: maintenance estimate, ${number(maintenance)} kcal/day` : ''}</AppText>
      </View>
      {selected.loggedDays ? <View style={{ flexDirection: 'row', gap: 16 }}>
        <View style={{ flex: 1, gap: 4 }}><AppText size={26} weight="bold" color={text}>{number(selected.averageCalories!)}</AppText><AppText size={12} color={muted}>kcal / day with entries</AppText></View>
        <View style={{ flex: 1, gap: 4 }}><AppText size={26} weight="bold" color={text}>{number(selected.totals.calories)}</AppText><AppText size={12} color={muted}>kcal recorded{consistent ? '' : ' · partial'}</AppText></View>
      </View> : null}
      {estimateAvailable && selected.balance !== null ? <View style={{ backgroundColor: theme.colors.primaryTint, padding: 14, borderRadius: 8, gap: 5 }}>
        <AppText size={13} weight="bold" color={accent}>Estimated {selected.balance < 0 ? 'deficit' : selected.balance > 0 ? 'surplus' : 'balance'} · {number(Math.abs(selected.balance))} kcal</AppText>
        <AppText size={20} weight="bold" color={text}>≈ {energyWeightLabel(selected.equivalentLb!, unit)}</AppText>
        <AppText size={11} color={muted}>Energy equivalent from recorded intake, assuming all meals were entered. Not measured weight change.</AppText>
      </View> : <AppText size={12} color={muted}>{selected.missingDays ? 'Not enough coverage for a weight-change estimate.' : isCurrent ? 'Weight-change estimates appear after the period ends, with entries on every day.' : 'Set up your macro profile in Fuel for an energy-balance estimate.'}</AppText>}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: details }} accessibilityLabel="How diet recap is calculated" onPress={() => setDetails(value => !value)} style={{ minHeight: 44, justifyContent: 'center' }}><AppText size={12} color={muted}>{details ? 'Hide details' : 'About this data'} {details ? '−' : '+'}</AppText></Pressable>
        <Pressable accessibilityRole="button" onPress={onOpenFuel} style={{ minHeight: 44, justifyContent: 'center' }}><AppText size={13} weight="semibold" color={accent}>Open Fuel ↗</AppText></Pressable>
      </View>
      {details ? <View style={{ gap: 8 }}>
        {selected.loggedDays ? <AppText size={12} color={muted}>Per day with entries: {number(selected.averageProtein!)}g protein · {number(selected.averageCarbs!)}g carbs · {number(selected.averageFats!)}g fat.</AppText> : null}
        <AppText size={12} color={muted}>Missing days are unknown and excluded, never counted as zero. Today is included in recorded intake and averages while in progress. Month bars average only days with entries; each shows its logging coverage. A logged day may still omit meals.</AppText>
        <AppText size={12} color={muted}>Energy estimates require a finished period with entries on every day. They use your current maintenance estimate and roughly 3,500 kcal per lb (7,700 per kg). Water, activity and metabolism affect actual weight.</AppText>
      </View> : null}
    </>}
  </View>;
}
