import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { createAccountList, type AccountRemote, type AccountRecord } from "./account-sync-core";

export function accountSyncError(error: unknown) {
  const value = error as { code?: string; message?: string };
  if (["42P01", "PGRST202", "PGRST205"].includes(value?.code ?? "")) return "Account sync needs the Supabase migration in supabase/account-sync.sql. Existing local data is preserved.";
  if (value?.code === "40001") return "This record changed on another device. Refresh and try again.";
  return value?.message || "Could not sync with your account. Check your connection and try again.";
}
export function accountRemote(userId: string): AccountRemote {
  const snapshots = new Map<string, { rows: Map<string, AccountRecord>; sequence: number }>();
  async function checkOwner() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session?.user.id !== userId) throw new Error("Your account changed. Reopen this screen before saving.");
  }
  return {
    async readRecords(namespace, ids) {
      await checkOwner();
      const rows: AccountRecord[] = [];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const { data, error } = await supabase.from("account_records").select("record_id,payload,deleted,revision")
          .eq("user_id", userId).eq("namespace", namespace).in("record_id", ids.slice(offset, offset + 100));
        if (error) throw error;
        rows.push(...(data ?? []).map(row => ({ id: row.record_id, payload: row.payload, deleted: row.deleted, revision: Number(row.revision) })));
      }
      return rows;
    },
    async read(namespace) {
      await checkOwner();
      const snapshot = snapshots.get(namespace) ?? { rows: new Map<string, AccountRecord>(), sequence: 0 };
      while (true) {
        const result = await supabase.rpc("account_read_delta", { p_namespace: namespace, p_after: snapshot.sequence, p_limit: 500 });
        if (result.error) {
          if (result.error.code !== "PGRST202") throw result.error;
          break; // Read-only compatibility with installations awaiting the additive migration.
        }
        for (const row of result.data ?? []) {
          snapshot.rows.set(row.record_id, { id: row.record_id, payload: row.payload, deleted: row.deleted, revision: Number(row.revision) });
          snapshot.sequence = Math.max(snapshot.sequence, Number(row.change_sequence));
        }
        snapshots.set(namespace, snapshot);
        if (!result.data || result.data.length < 500) return [...snapshot.rows.values()];
      }
      const rows: AccountRecord[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from("account_records").select("record_id,payload,deleted,revision")
          .eq("user_id", userId).eq("namespace", namespace).order("record_id").range(offset, offset + 499);
        if (error) throw error;
        rows.push(...(data ?? []).map((row) => ({ id: row.record_id, payload: row.payload, deleted: row.deleted, revision: Number(row.revision) })));
        if (!data || data.length < 500) return rows;
      }
    },
    async import(namespace, records) {
      await checkOwner();
      for (let offset = 0; offset < records.length; offset += 500) {
        const { error } = await supabase.rpc("account_import_records", { p_namespace: namespace, p_records: records.slice(offset, offset + 500) });
        if (error) throw error;
      }
    },
    async save(namespace, changes, operationId) {
      await checkOwner();
      const { error } = await supabase.rpc("account_commit_operation", { p_namespace: namespace, p_changes: changes, p_operation_id: operationId });
      if (error) throw error;
    },
  };
}
// Workouts live in real tables (workout_logs, workout_exercise, workout_set, see
// supabase/workout-tables.sql) but sync exactly like account_records: same revisions, same
// conflict checks, same offline queue. Until that script has been run, the functions are
// missing (PGRST202) and workouts keep using account_records.
export function workoutRemote(userId: string): AccountRemote {
  const fallback = accountRemote(userId);
  let snapshot = { rows: new Map<string, AccountRecord>(), sequence: 0 };
  let tables: boolean | null = null; // null until we know whether the new functions exist
  const missing = (error: { code?: string } | null) => error?.code === "PGRST202" || error?.code === "42883";
  async function checkOwner() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session?.user.id !== userId) throw new Error("Your account changed. Reopen this screen before saving.");
  }
  const toRecord = (row: { record_id: string; payload: unknown; deleted: boolean; revision: number | string }): AccountRecord =>
    ({ id: row.record_id, payload: row.payload, deleted: row.deleted, revision: Number(row.revision) });
  return {
    async read(namespace) {
      if (tables === false) return fallback.read(namespace);
      await checkOwner();
      while (true) {
        const result = await supabase.rpc("workout_read_delta", { p_after: snapshot.sequence, p_limit: 500 });
        if (result.error) {
          if (!missing(result.error)) throw result.error;
          tables = false;
          return fallback.read(namespace);
        }
        tables = true;
        for (const row of result.data ?? []) {
          snapshot.rows.set(row.record_id, toRecord(row));
          snapshot.sequence = Math.max(snapshot.sequence, Number(row.change_sequence));
        }
        if (!result.data || result.data.length < 500) return [...snapshot.rows.values()];
      }
    },
    async readRecords(namespace, ids) {
      if (tables === false) return fallback.readRecords!(namespace, ids);
      await checkOwner();
      const rows: AccountRecord[] = [];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const { data, error } = await supabase.rpc("workout_read_records", { p_ids: ids.slice(offset, offset + 100) });
        if (error) {
          if (!missing(error)) throw error;
          tables = false;
          return fallback.readRecords!(namespace, ids);
        }
        rows.push(...(data ?? []).map(toRecord));
      }
      return rows;
    },
    async import(namespace, records) {
      if (tables === false) return fallback.import(namespace, records);
      await checkOwner();
      for (let offset = 0; offset < records.length; offset += 500) {
        const { error } = await supabase.rpc("workout_import_records", { p_records: records.slice(offset, offset + 500) });
        if (error) {
          if (!missing(error)) throw error;
          tables = false;
          return fallback.import(namespace, records.slice(offset));
        }
      }
    },
    async save(namespace, changes, operationId) {
      if (tables === false) return fallback.save(namespace, changes, operationId);
      await checkOwner();
      const { error } = await supabase.rpc("workout_commit_operation", { p_changes: changes, p_operation_id: operationId });
      if (error) {
        if (!missing(error)) throw error;
        tables = false;
        return fallback.save(namespace, changes, operationId);
      }
    },
  };
}
export function accountList<T>(userId: string, namespace: string, identify: (item: T) => string, validate: (value: unknown) => value is T) {
  const remote = namespace === "workout_logs" ? workoutRemote(userId) : accountRemote(userId);
  return createAccountList({ userId, namespace, identify, validate, local: AsyncStorage, remote, allowRestore: namespace === "hidden_chats" });
}
// Legacy nutrition/calendar keys were not account-scoped. Only their first owner
// may import them; signing into a second account never inherits the first one's data.
export async function mayImportLegacy(userId: string) {
  const key = "swolemates.legacy-data-owner";
  const existing = await AsyncStorage.getItem(key);
  if (existing) return existing === userId;
  await AsyncStorage.setItem(key, userId);
  return true;
}
