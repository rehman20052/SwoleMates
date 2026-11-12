import type { FoodLogEntry } from "@/state/app-data";

type MealGroup = {
  latest: FoodLogEntry;
  proteinPortion: FoodLogEntry | null;
  count: number;
  dates: Map<string, number>;
};

const newestFirst = (a: FoodLogEntry, b: FoodLogEntry) =>
  b.date.localeCompare(a.date) || b.id.localeCompare(a.id);

export function nutritionSnapshot(today: string, entries: readonly FoodLogEntry[]) {
  // Shift local calendar labels without applying elapsed-hour arithmetic across DST.
  const firstDate = new Date(`${today}T00:00:00Z`);
  firstDate.setUTCDate(firstDate.getUTCDate() - 6);
  const start = firstDate.toISOString().slice(0, 10);
  const groups = new Map<string, MealGroup>();
  let meals = 0;
  let latestDate: string | null = null;
  const days = new Map<string, { date: string; meals: number; calories: number }>();
  const totals = { calories: 0, protein: 0, carbs: 0, fats: 0 };
  const missing = { protein: false, carbs: false, fats: false };

  for (const entry of entries) {
    if (entry.date < start || entry.date > today) continue;
    meals += 1;
    const day = days.get(entry.date) ?? { date: entry.date, meals: 0, calories: 0 };
    day.meals += 1;
    day.calories += entry.calories;
    days.set(entry.date, day);
    totals.calories += entry.calories;
    for (const key of ["protein", "carbs", "fats"] as const) {
      const valid = Number.isFinite(entry[key]) && entry[key] >= 0;
      if (valid) totals[key] += entry[key];
      if (!valid || entry.incompleteNutrients?.includes(key)) missing[key] = true;
    }
    if (latestDate === null || entry.date > latestDate) latestDate = entry.date;
    const name = entry.name.trim().replace(/\s+/g, " ").toLowerCase();
    const group = groups.get(name) ?? { latest: entry, proteinPortion: null, count: 0, dates: new Map<string, number>() };
    group.count += 1;
    group.dates.set(entry.date, (group.dates.get(entry.date) ?? 0) + 1);
    if (newestFirst(entry, group.latest) < 0) group.latest = entry;
    const knownProtein = Number.isFinite(entry.protein) && entry.protein > 0
      && !entry.incompleteNutrients?.includes("protein");
    if (knownProtein && (group.proteinPortion === null
      || entry.protein > group.proteinPortion.protein
      || (entry.protein === group.proteinPortion.protein && newestFirst(entry, group.proteinPortion) < 0))) {
      group.proteinPortion = entry;
    }
    groups.set(name, group);
  }

  const distinctMeals = [...groups.values()];
  const proteinPicks = distinctMeals
    .filter((group): group is MealGroup & { proteinPortion: FoodLogEntry } => group.proteinPortion !== null)
    .sort((a, b) => b.proteinPortion.protein - a.proteinPortion.protein
      || newestFirst(a.proteinPortion, b.proteinPortion))
    .slice(0, 3)
    .map(group => ({ entry: group.latest, protein: group.proteinPortion.protein }));
  const repeat = [...groups.entries()]
    .filter(([, group]) => group.count >= 2)
    .sort(([nameA, a], [nameB, b]) => b.count - a.count
      || b.latest.date.localeCompare(a.latest.date) || nameA.localeCompare(nameB))[0]?.[1];
  const recentMeals = distinctMeals.sort((a, b) => newestFirst(a.latest, b.latest))
    .slice(0, 3).map(group => group.latest);
  const repeatDays = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(firstDate);
    date.setUTCDate(date.getUTCDate() + offset);
    const label = date.toISOString().slice(0, 10);
    return { date: label, count: repeat?.dates.get(label) ?? 0 };
  });

  return {
    start, end: today, meals, latestDate, proteinPicks, recentMeals, totals, missing,
    loggedDays: days.size,
    averages: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, days.size ? value / days.size : 0])) as typeof totals,
    days: repeatDays.map(({ date }) => days.get(date) ?? { date, meals: 0, calories: 0 }),
    repeatMeal: repeat ? {
      entry: repeat.latest, count: repeat.count, days: repeatDays,
      maxDailyCount: Math.max(...repeatDays.map(day => day.count)),
    } : null,
  };
}
