import type { ListStorage } from "./durable-list";

export const commonExercises = [
  "Barbell squat", "Bench press", "Deadlift", "Romanian deadlift", "Overhead press", "Incline bench press",
  "Dumbbell bench press", "Dumbbell shoulder press", "Barbell row", "Dumbbell row", "Seated cable row",
  "Lat pulldown", "Pull-up", "Chin-up", "Leg press", "Hack squat", "Front squat", "Bulgarian split squat",
  "Lunge", "Leg extension", "Leg curl", "Hip thrust", "Calf raise", "Biceps curl", "Hammer curl",
  "Preacher curl", "Triceps pushdown", "Triceps extension", "Lateral raise", "Rear delt fly", "Face pull",
  "Chest fly", "Cable fly", "Dip", "Push-up", "Cable crunch", "Shrug", "Good morning", "Sumo deadlift",
];
export function exerciseOptions(names: string[], search = "") {
  const seen = new Set<string>();
  const options = [...commonExercises, ...names].filter((name) => {
    const key = name.trim().toLowerCase();
    if (!key || key === "other" || seen.has(key)) return false;
    seen.add(key); return true;
  }).filter((name) => name.toLowerCase().includes(search.trim().toLowerCase()));
  return [...options, "Other"];
}
export function englishExerciseNames(results: unknown[]): string[] {
  return results.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as { translations?: { name?: unknown; language?: number }[] };
    return (Array.isArray(item.translations) ? item.translations : [])
      .filter((entry) => entry.language === 2 && typeof entry.name === "string")
      .map((entry) => (entry.name as string).trim()).filter(Boolean);
  });
}
const cacheKey = "swolemates.exercise-catalog.v1";
export async function loadExerciseCatalog(storage: ListStorage, request: typeof fetch = fetch) {
  let cached: string[] = [];
  try {
    const raw = await storage.getItem(cacheKey);
    const value = raw ? JSON.parse(raw) : null;
    if (value && Array.isArray(value.names) && value.names.every((name: unknown) => typeof name === "string")) {
      cached = value.names;
      if (typeof value.savedAt === "number" && Date.now() - value.savedAt < 7 * 86400000) return { names: cached, offline: false };
    }
  } catch { /* A missing catalog never blocks tracking a lift. */ }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const names: string[] = [];
  try {
    let url: string | null = "https://wger.de/api/v2/exerciseinfo/?limit=100";
    const visited = new Set<string>();
    while (url && visited.size < 20) {
      if (!url.startsWith("https://wger.de/api/v2/exerciseinfo/") || visited.has(url)) throw new Error("Invalid exercise page.");
      visited.add(url);
      const response: Response = await request(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Exercise catalog unavailable.");
      const page: { results: unknown[]; next?: unknown } = await response.json();
      if (!Array.isArray(page.results)) throw new Error("Invalid exercise catalog.");
      names.push(...englishExerciseNames(page.results));
      url = typeof page.next === "string" ? page.next : null;
    }
    if (!names.length || url) throw new Error("Incomplete exercise catalog.");
    const unique = [...new Set(names)].sort((a, b) => a.localeCompare(b));
    await storage.setItem(cacheKey, JSON.stringify({ names: unique, savedAt: Date.now() })).catch(() => undefined);
    return { names: unique, offline: false };
  } catch {
    return { names: [...new Set([...cached, ...names])], offline: true };
  } finally { clearTimeout(timeout); }
}
