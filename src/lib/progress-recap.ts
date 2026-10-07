import type { FoodLogEntry, SessionLog } from "@/state/app-data";
import type { TrackedLift } from "./lift-progression";

const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function weekBounds(today: string, offset = 0) {
  const [y, m, d] = today.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  start.setDate(start.getDate() - (start.getDay() + 6) % 7 + offset * 7);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  return { start: iso(start), end: iso(end) };
}

export function liftMilestones(lift: TrackedLift) {
  let best = 0;
  let hasBaseline = false;
  const records: { date: string; weight: number; increase: number }[] = [];
  for (const entry of [...lift.history].sort((a, b) => a.date.localeCompare(b.date))) {
    if (hasBaseline && entry.weight > best) records.push({ date: entry.date, weight: entry.weight, increase: Math.round((entry.weight - best) * 100) / 100 });
    best = Math.max(best, entry.weight); hasBaseline = true;
  }
  return { best: Math.max(best, lift.currentWeight), records, reached: lift.currentWeight >= lift.goalWeight };
}

export function weeklyRecap(today: string, offset: number, logs: SessionLog[], food: FoodLogEntry[], lifts: TrackedLift[], completedDates: string[] = []) {
  const bounds = weekBounds(today, offset);
  const inside = (date: string) => date >= bounds.start && date <= bounds.end && date <= today;
  const days = new Map<string, { calories: number; protein: number }>();
  for (const row of food.filter(row => inside(row.date))) {
    const totals = days.get(row.date) ?? { calories: 0, protein: 0 };
    totals.calories += row.calories; totals.protein += row.protein; days.set(row.date, totals);
  }
  const values = [...days.values()];
  const complete = [...new Set(completedDates)].filter(inside);
  const completedTotals = complete.map(date => days.get(date) ?? { calories: 0, protein: 0 });
  const bests = lifts.flatMap(lift => liftMilestones(lift).records.filter(record => inside(record.date)).map(record => ({ ...record, name: lift.name, unit: lift.unit })));
  const workoutRows = logs.filter(log => inside(log.date));
  return { ...bounds, workoutDays: new Set(workoutRows.map(log => log.date)).size, sessions: workoutRows.length,
    completedDays: complete.length, completedAverageCalories: completedTotals.length ? Math.round(completedTotals.reduce((sum,row) => sum + row.calories,0)/completedTotals.length) : null,
    completedAverageProtein: completedTotals.length ? Math.round(completedTotals.reduce((sum,row) => sum + row.protein,0)/completedTotals.length) : null,
    nutritionDays: days.size, averageCalories: values.length ? Math.round(values.reduce((sum, row) => sum + row.calories, 0) / values.length) : null,
    averageProtein: values.length ? Math.round(values.reduce((sum, row) => sum + row.protein, 0) / values.length) : null,
    bests: bests.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

export function trainingHistory(today: string, weeks: 4 | 8 | 12, logs: SessionLog[], lifts: TrackedLift[]) {
  const [y,m,d] = today.split("-").map(Number); const start = new Date(y,m-1,d);
  start.setDate(start.getDate() - weeks*7 + 1); const from = iso(start);
  const inside = (date: string) => date >= from && date <= today;
  const records = logs.filter(log => inside(log.date));
  const days = new Set(records.map(log => log.date));
  const activeWeeks = new Set([...days].map(date => weekBounds(date).start));
  return { start: from, end: today, days: days.size, sessions: records.length, activeWeeks: activeWeeks.size,
    lifts: lifts.map(lift => ({ name: lift.name, unit: lift.unit, entries: lift.history.filter(entry => inside(entry.date)).sort((a,b) => a.date.localeCompare(b.date)) })) };
}
