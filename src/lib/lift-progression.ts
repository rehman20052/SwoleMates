import { createDurableList, type ListStorage } from "./durable-list";

export type LiftEntry = { date: string; weight: number; minReps: number; maxReps: number };
export type TrackedLift = {
  id: string; name: string; unit: "lb" | "kg"; currentWeight: number;
  minReps: number; maxReps: number; goalWeight: number; history: LiftEntry[];
};
export type LiftDetails = Omit<TrackedLift, "id" | "history">;
export function validLiftDetails(value: LiftDetails) {
  return typeof value.name === "string" && value.name.trim().length > 0 && value.name.length <= 100
    && (value.unit === "lb" || value.unit === "kg")
    && Number.isFinite(value.currentWeight) && value.currentWeight >= 0
    && Number.isFinite(value.goalWeight) && value.goalWeight > 0
    && Number.isInteger(value.minReps) && value.minReps >= 1
    && Number.isInteger(value.maxReps) && value.maxReps >= value.minReps && value.maxReps <= 100;
}
export function isLift(value: unknown): value is TrackedLift {
  if (!value || typeof value !== "object") return false;
  const lift = value as TrackedLift;
  return typeof lift.id === "string" && validLiftDetails(lift) && Array.isArray(lift.history)
    && lift.history.every((entry) => entry && typeof entry.date === "string"
      && Number.isFinite(entry.weight) && entry.weight >= 0
      && Number.isInteger(entry.minReps) && entry.minReps >= 1
      && Number.isInteger(entry.maxReps) && entry.maxReps >= entry.minReps && entry.maxReps <= 100);
}
export function saveLiftDetails(current: TrackedLift[], id: string, details: LiftDetails, date: string) {
  if (!validLiftDetails(details)) throw new Error("Enter a lift, valid weights, and a rep range from 1 to 100.");
  const existing = current.find((lift) => lift.id === id);
  // Convert past entries when changing units so history keeps its meaning.
  const factor = existing && existing.unit !== details.unit ? details.unit === "kg" ? 1 / 2.2046226218 : 2.2046226218 : 1;
  const history = (existing?.history ?? []).map((entry) => ({ ...entry, weight: Math.round(entry.weight * factor * 100) / 100 }));
  const last = history.at(-1);
  if (!last || last.weight !== details.currentWeight || last.minReps !== details.minReps || last.maxReps !== details.maxReps) {
    history.push({ date, weight: details.currentWeight, minReps: details.minReps, maxReps: details.maxReps });
  }
  const next: TrackedLift = { ...details, name: details.name.trim(), id, history };
  return existing ? current.map((lift) => lift.id === id ? next : lift) : [...current, next];
}
export function liftProgress(lift: Pick<TrackedLift, "currentWeight" | "goalWeight">) {
  return Math.max(0, Math.min(1, lift.currentWeight / lift.goalWeight));
}
export function createLiftStore(storage: ListStorage, userId: string) {
  if (!userId) throw new Error("Sign in to track your lifts.");
  return createDurableList(storage, `swolemates.lift-progression.${userId}`, isLift);
}
