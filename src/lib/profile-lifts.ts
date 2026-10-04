export type ProfileLift = { name: string; weight: number; unit: "lb" | "kg" };
type LegacyLifts = { bench?: string; squat?: string; deadlift?: string; customLiftName?: string; customLift?: string; displayLifts?: unknown };

export function profileLifts(profile: LegacyLifts): ProfileLift[] {
  const source: unknown[] = Array.isArray(profile.displayLifts) ? profile.displayLifts : [
    { name: "Bench press", weight: Number.parseFloat(profile.bench ?? ""), unit: "lb" },
    { name: "Barbell squat", weight: Number.parseFloat(profile.squat ?? ""), unit: "lb" },
    { name: "Deadlift", weight: Number.parseFloat(profile.deadlift ?? ""), unit: "lb" },
    { name: profile.customLiftName, weight: Number.parseFloat(profile.customLift ?? ""), unit: "lb" },
  ];
  const seen = new Set<string>();
  return source.flatMap(value => {
    if (!value || typeof value !== "object") return [];
    const row = value as Partial<ProfileLift>;
    const name = typeof row.name === "string" ? row.name.trim().slice(0, 100) : "";
    if (!name || seen.has(name.toLowerCase()) || typeof row.weight !== "number" || !Number.isFinite(row.weight) || row.weight < 0 || row.weight > 10000 || (row.unit !== "lb" && row.unit !== "kg")) return [];
    seen.add(name.toLowerCase());
    return [{ name, weight: row.weight, unit: row.unit }];
  }).slice(0, 12);
}

export function legacyLiftFields(lifts: ProfileLift[]) {
  const weight = (lift?: ProfileLift) => lift ? `${Math.round(lift.weight * (lift.unit === "kg" ? 2.2046226218 : 1) * 100) / 100} lbs` : "N/A";
  const find = (name: string) => lifts.find(lift => lift.name.toLowerCase() === name);
  const custom = lifts.find(lift => !["bench press", "barbell squat", "deadlift"].includes(lift.name.toLowerCase()));
  return { bench: weight(find("bench press")), squat: weight(find("barbell squat")), deadlift: weight(find("deadlift")), customLiftName: custom?.name ?? "", customLift: weight(custom) };
}
