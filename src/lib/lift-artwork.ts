import catalog from "./exercise-artwork-catalog.json";

export type LiftArtworkKind = "bench" | "cable" | "barbell" | "dumbbell" | "kettlebell" | "legs" | "bodyweight" | "other";
export const liftArtworkChoices: { key: LiftArtworkKind; label: string }[] = [
  { key: "bench", label: "Bench" }, { key: "cable", label: "Cable" }, { key: "barbell", label: "Barbell" },
  { key: "dumbbell", label: "Dumbbell" }, { key: "kettlebell", label: "Kettlebell" },
  { key: "legs", label: "Leg machine" }, { key: "bodyweight", label: "Bodyweight" }, { key: "other", label: "Other" },
];
export function normalizeExerciseName(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/benchpress/g, "bench press")
    .replace(/pull[ -]?ups?/g, "pull up").replace(/push[ -]?ups?/g, "push up").replace(/chin[ -]?ups?/g, "chin up")
    .replace(/dumbbells/g, "dumbbell").replace(/curls/g, "curl").replace(/squats/g, "squat").replace(/deadlifts/g, "deadlift")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
const aliases: Record<string, string> = {
  "barbell squat": "Squats", "dumbbell bench press": "Benchpress Dumbbells", "incline bench press": "Incline Bench Press - Barbell",
  "dumbbell shoulder press": "Shoulder Press, Dumbbells", "overhead press": "Shoulder Press, Barbell",
  "front squat": "Front Squats", "hack squat": "Leg Press on Hackenschmidt Machine", "biceps curl": "Biceps Curls With Dumbbell",
  "preacher curl": "Preacher Curls", "seated cable row": "Seated Cable Row",
};
const byName = new Map<string, typeof catalog[number]>();
for (const entry of catalog) for (const name of entry.names) {
  const key = normalizeExerciseName(name);
  const previous = byName.get(key);
  if (!previous || (!previous.image && entry.image)) byName.set(key, entry);
}
export function catalogLiftArtwork(name: string) {
  const key = normalizeExerciseName(name);
  // Exact names and explicit aliases only: fuzzy matching can show a different exercise.
  return byName.get(key) ?? byName.get(normalizeExerciseName(aliases[key] ?? ""));
}
export function liftArtworkKind(name: string): LiftArtworkKind {
  const text = normalizeExerciseName(name);
  if (/\b(leg press|hack squat|leg extension|leg curl|calf|adduct|abduct)/.test(text)) return "legs";
  if (/\b(kettlebell|kb)\b/.test(text)) return "kettlebell";
  if (/\b(cable|pulldown|pull down|pushdown|push down|face pull)\b/.test(text)) return "cable";
  if (/\b(dumbbell|db|hammer|lateral raise)\b/.test(text)) return "dumbbell";
  if (/\b(bench|chest press)\b/.test(text)) return "bench";
  if (/\b(pull up|chin up|push up|dip|plank|sit up|crunch)\b/.test(text)) return "bodyweight";
  if (/\b(barbell|deadlift|squat|overhead|military|rdl|good morning)\b/.test(text)) return "barbell";
  const equipment = catalogLiftArtwork(name)?.equipment.join(" ").toLowerCase() ?? "";
  if (equipment.includes("kettlebell")) return "kettlebell";
  if (equipment.includes("dumbbell")) return "dumbbell";
  if (equipment.includes("barbell")) return "barbell";
  if (equipment.includes("body")) return "bodyweight";
  return "other";
}
