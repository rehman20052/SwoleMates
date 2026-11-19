import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from './ui';
import { useTrainPalette } from './train-ui';
import { useAppTheme } from '@/theme';
import { daysFromToday, useAppData } from '@/state/app-data';
import { maintenanceCalories } from '@/lib/macro-calculator';
import { dietPeriod, energyWeightLabel } from '@/lib/diet-recap';
import { weekBounds } from '@/lib/progress-recap';

const short = (date: string) => { const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
const number = (value: number) => Math.round(value).toLocaleString();

export function DietRecap({ weekStart, onOpenFuel }: { weekStart: string; onOpenFuel: () => void }) {
  const { foodEntries, foodJournalReady, nutritionProfile } = useAppData();
  const palette = useTrainPalette(), theme = useAppTheme();
  const [unit, setUnit] = useState<'lb' | 'kg'>('lb');
  const [offset, setOffset] = useState(0);
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const today = daysFromToday(0);
  const maintenance = nutritionProfile ? maintenanceCalories(nutritionProfile) : null;
  const [anchor, setAnchor] = useState(() => weekBounds(today).start === weekStart ? today : weekStart);
  const selected = dietPeriod(today, anchor, offset, period, foodEntries, maintenance);
  const next = dietPeriod(today, anchor, offset + 1, period, [], null);
  const current = dietPeriod(today, today, 0, period, [], null);
  const size = period === 'week' ? 1 : 7;
  const bars = Array.from({ length: Math.ceil(selected.days.length / size) }, (_, index) => {
    const days = selected.days.slice(index * size, (index + 1) * size);
    const logged = days.filter(day => day.totals !== null);
    return { date: days[0].date, end: days.at(-1)!.date, count: logged.length, total: days.length,
      calories: logged.length ? logged.reduce((sum, day) => sum + day.totals!.calories, 0) / logged.length : null };
  });
  const max = Math.max(1, maintenance ?? 0, ...bars.map(bar => bar.calories ?? 0)) * 1.1;
  const text = palette.text, muted = palette.muted, accent = theme.colors.accent;
  const button = { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' as const, borderRadius: 8, borderWidth: 1, borderColor: palette.border };
  return <View style={{ backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, borderRadius: 12, padding: 20, gap: 20 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
      <View style={{ flex: 1, minWidth: 160, gap: 5 }}><AppText size={23} weight="bold" color={text}>Diet recap</AppText><AppText size={12} color={muted}>{short(selected.start)} – {short(selected.end)} · {selected.start.slice(0, 4)}{selected.start.slice(0, 4) !== selected.end.slice(0, 4) ? `–${selected.end.slice(0, 4)}` : ''}</AppText></View>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 6 }}>{(['lb', 'kg'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: unit === value }} accessibilityLabel={`Show weight in ${value}`} onPress={() => setUnit(value)} style={[button, { backgroundColor: unit === value ? theme.colors.primaryTint : 'transparent' }]}><AppText size={13} color={unit === value ? accent : muted}>{value}</AppText></Pressable>)}</View>
    </View>
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 8 }}>{(['week', 'month'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityLabel={`Diet recap by ${value}`} accessibilityState={{ selected: period === value }} onPress={() => { setPeriod(value); setOffset(0); }} style={[button, { flex: 1, alignItems: 'center', backgroundColor: period === value ? theme.colors.primaryTint : 'transparent' }]}><AppText size={13} color={period === value ? accent : muted}>{value === 'week' ? 'Week' : 'Month'}</AppText></Pressable>)}</View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Previous ${period}`} onPress={() => setOffset(value => value - 1)} style={button}><AppText size={13} color={text}>‹ Previous</AppText></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Current ${period}`} onPress={() => { setAnchor(today); setOffset(0); }} style={[button, { flexGrow: 1, alignItems: 'center' }]}><AppText size={13} color={accent}>This {period}</AppText></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Next ${period}`} disabled={next.start > current.start} onPress={() => setOffset(value => value + 1)} style={[button, { opacity: next.start > current.start ? 0.4 : 1 }]}><AppText size={13} color={text}>Next ›</AppText></Pressable>
    </View>
    {!foodJournalReady ? <AppText color={muted}>Loading your food history…</AppText> : <>
      <View style={{ gap: 6 }}><AppText size={13} weight="bold" color={text}>{period === 'week' ? 'Daily calories' : 'Daily average calories · 7-day groups'}</AppText><AppText size={12} color={muted}>{selected.loggedDays}/{selected.days.length} days logged. Missing days have no bar.</AppText></View>
      <View style={{ height: 190, flexDirection: 'row', gap: 6 }}>
        {bars.map((bar, index) => <View key={bar.date} accessible accessibilityLabel={`${short(bar.date)}${period === 'month' ? ` to ${short(bar.end)}` : ''}: ${bar.calories === null ? 'no food logged' : `${number(bar.calories)} calories per logged day`}`} style={{ flex: 1, gap: 8 }}>
          <AppText size={11} color={text} style={{ textAlign: 'center' }}>{bar.calories === null ? '—' : number(bar.calories)}</AppText>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: palette.field, borderRadius: 6, overflow: 'hidden' }}>
            {bar.calories !== null ? <View style={{ height: `${Math.max(1, bar.calories / max * 100)}%`, backgroundColor: theme.colors.primaryTint, borderTopWidth: 3, borderTopColor: accent }} /> : null}
            {maintenance !== null ? <View pointerEvents="none" style={{ position: 'absolute', bottom: `${maintenance / max * 100}%`, width: '100%', borderTopWidth: 1, borderStyle: 'dashed', borderColor: muted }} /> : null}
          </View>
          <AppText size={10} color={muted} style={{ textAlign: 'center' }}>{period === 'week' ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'][index] : `${Number(bar.date.slice(-2))}–${Number(bar.end.slice(-2))}`}</AppText>
        </View>)}
      </View>
      <AppText size={12} color={muted}>{maintenance === null ? 'Set up your macro plan in Fuel to estimate maintenance.' : `Dashed line: current maintenance estimate · ${number(maintenance)} kcal/day`}</AppText>
      {selected.loggedDays ? <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
          <View style={{ flex: 1, minWidth: 120, gap: 4 }}><AppText size={26} weight="bold" color={text}>{number(selected.totals.calories)}</AppText><AppText size={12} color={muted}>Calories logged in this {period}</AppText></View>
          <View style={{ flex: 1, minWidth: 120, gap: 4 }}><AppText size={26} weight="bold" color={text}>{number(selected.averageCalories!)}</AppText><AppText size={12} color={muted}>Average per logged day</AppText></View>
        </View>
        <AppText size={13} color={muted}>Daily averages: {number(selected.averageProtein!)}g protein · {number(selected.averageCarbs!)}g carbs · {number(selected.averageFats!)}g fat</AppText>
      </> : <AppText color={muted}>No food logged for this {period} yet.</AppText>}
      {selected.balance !== null ? <View style={{ backgroundColor: theme.colors.primaryTint, padding: 16, borderRadius: 10, gap: 8 }}>
        <AppText size={13} weight="bold" color={accent}>{selected.balance < 0 ? 'Estimated deficit' : selected.balance > 0 ? 'Estimated surplus' : 'Estimated balance'} · {number(Math.abs(selected.balance))} kcal</AppText>
        <AppText size={22} weight="bold" color={text}>≈ {energyWeightLabel(selected.equivalentLb!, unit)}</AppText>
        <AppText size={12} color={muted}>Energy equivalent across {selected.balanceDays} logged past {selected.balanceDays === 1 ? 'day' : 'days'}, not a full-{period} prediction.</AppText>
      </View> : <AppText size={13} color={muted}>{maintenance === null ? 'A calorie target is not maintenance. Add your macro profile to calculate a deficit or surplus.' : 'The balance estimate appears after a past day has food logged.'}</AppText>}
      <AppText size={12} color={muted}>Missing days are excluded. Today is included in intake stats, but excluded from the balance while in progress. Past days may also have incomplete logs.</AppText>
      <AppText size={12} color={muted}>Uses your current maintenance estimate for all periods and roughly 3,500 kcal per lb (7,700 per kg). Actual weight changes vary with water, activity and metabolic adaptation.</AppText>
      <Pressable accessibilityRole="button" onPress={onOpenFuel} style={[button, { alignSelf: 'flex-start' }]}><AppText size={13} color={accent}>Open Fuel</AppText></Pressable>
    </>}
  </View>;
}
