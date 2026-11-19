import { weekBounds } from './progress-recap';

type Food = { date: string; calories: number; protein: number; carbs: number; fats: number };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function dietWeek(today: string, anchor: string, offset: number, food: Food[], maintenance: number | null) {
  const { start, end } = weekBounds(anchor, offset);
  return dietRange(today, start, end, food, maintenance);
}

export function dietPeriod(today: string, anchor: string, offset: number, period: 'week' | 'month', food: Food[], maintenance: number | null) {
  if (period === 'week') return dietWeek(today, anchor, offset, food, maintenance);
  const [y, m] = anchor.split('-').map(Number);
  return dietRange(today, iso(new Date(y, m - 1 + offset, 1)), iso(new Date(y, m + offset, 0)), food, maintenance);
}

function dietRange(today: string, start: string, end: string, food: Food[], maintenance: number | null) {
  const daily = new Map<string, { calories: number; protein: number; carbs: number; fats: number }>();
  for (const row of food) {
    if (row.date < start || row.date > end || row.date > today) continue;
    if (![row.calories, row.protein, row.carbs, row.fats].every(value => Number.isFinite(value) && value >= 0)) continue;
    const total = daily.get(row.date) ?? { calories: 0, protein: 0, carbs: 0, fats: 0 };
    for (const key of ['calories', 'protein', 'carbs', 'fats'] as const) total[key] += row[key];
    daily.set(row.date, total);
  }
  const [endYear, endMonth, endDay] = end.split('-').map(Number);
  const [startYear, startMonth, startDay] = start.split('-').map(Number);
  const dayCount = Math.round((Date.UTC(endYear, endMonth - 1, endDay) - Date.UTC(startYear, startMonth - 1, startDay)) / 86400000) + 1;
  const days = Array.from({ length: dayCount }, (_, i) => {
    const [y, m, d] = start.split('-').map(Number);
    const date = iso(new Date(y, m - 1, d + i));
    return { date, totals: daily.get(date) ?? null, future: date > today };
  });
  const totals = [...daily.values()].reduce((sum, row) => ({ calories: sum.calories + row.calories, protein: sum.protein + row.protein, carbs: sum.carbs + row.carbs, fats: sum.fats + row.fats }), { calories: 0, protein: 0, carbs: 0, fats: 0 });
  // Today's unfinished intake must not look like a large daily deficit.
  const past = [...daily.entries()].filter(([date]) => date < today);
  const baseline = maintenance !== null && Number.isFinite(maintenance) && maintenance > 0 ? maintenance : null;
  const balance = baseline !== null && past.length ? past.reduce((sum, [, row]) => sum + row.calories - baseline, 0) : null;
  return { start, end, days, totals, loggedDays: daily.size, balanceDays: past.length,
    averageCalories: daily.size ? totals.calories / daily.size : null,
    averageProtein: daily.size ? totals.protein / daily.size : null,
    averageCarbs: daily.size ? totals.carbs / daily.size : null,
    averageFats: daily.size ? totals.fats / daily.size : null,
    balance, equivalentLb: balance === null ? null : balance / 3500 };
}

export function energyWeightLabel(pounds: number, unit: 'lb' | 'kg') {
  const value = Math.abs(pounds) * (unit === 'kg' ? 0.45359237 : 1);
  return `${value.toFixed(2)} ${unit} ${pounds < 0 ? 'loss' : pounds > 0 ? 'gain' : 'change'}`;
}
