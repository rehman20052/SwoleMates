import type { SessionLog } from "@/state/app-data";

export function workoutLogKey(log: SessionLog) {
  return log.plannedWorkoutId ? `planned:${log.plannedWorkoutId}` : log.id;
}

export function mergeVerifiedLogs(current: SessionLog[], incoming: SessionLog[], deleted: string[]) {
  const hidden = new Set(deleted);
  const allowed = (log: SessionLog) => !hidden.has(workoutLogKey(log));
  const saved = new Map(current.filter(allowed).map((log) => [workoutLogKey(log), log]));
  const remoteKeys = new Set(incoming.map(workoutLogKey));
  const verified = incoming.filter(allowed).map((log) => ({ ...log, ...saved.get(workoutLogKey(log)) }));
  const local = current.filter((log) => !remoteKeys.has(workoutLogKey(log)) && allowed(log));
  return [...verified, ...local];
}
