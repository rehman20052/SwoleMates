import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppData } from '@/state/app-data';
import { partnerWorkoutHasProgress, type DraftRecord } from './workout-draft-progress';

export function usePartnerWorkoutProgress(planIds: string[], refreshKey: string | null) {
  const { accountUserId, foodJournalReady, workspaceSettings, logs } = useAppData();
  const [result, setResult] = useState<{ owner: string; ids: Set<string> } | null>(null);
  const idsKey = JSON.stringify(planIds);
  useEffect(() => {
    if (!accountUserId || !foodJournalReady) return;
    let active = true;
    const owner = accountUserId;
    void (async () => {
      const ids: string[] = JSON.parse(idsKey);
      const keys = ids.map(id => `swolemates.draft.${owner}.draft:partner-log:${id}`);
      const local = new Map<string, DraftRecord>();
      try {
        for (const [key, raw] of await AsyncStorage.multiGet(keys)) {
          try { const value = raw ? JSON.parse(raw) : null; if (value && typeof value.content === 'string' && Number.isFinite(value.updatedAt)) local.set(key, value); } catch { /* Fall back to the synced draft. */ }
        }
      } catch { /* Synced progress remains available without local storage. */ }
      const progress = new Set(ids.filter((id, i) => {
        const remote = workspaceSettings.find(item => item.id === `draft:partner-log:${id}`)?.value;
        const cloud = remote && typeof remote === 'object' && typeof remote.content === 'string' && Number.isFinite(remote.updatedAt) ? remote : null;
        return partnerWorkoutHasProgress(local.get(keys[i]) ?? null, cloud, logs.some(log => log.plannedWorkoutId === id && !!log.exercises?.length));
      }));
      if (active) setResult({ owner, ids: progress });
    })();
    return () => { active = false; };
  }, [accountUserId, foodJournalReady, workspaceSettings, logs, idsKey, refreshKey]);
  return result?.owner === accountUserId ? result.ids : new Set<string>();
}
