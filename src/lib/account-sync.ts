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
export function accountList<T>(userId: string, namespace: string, identify: (item: T) => string, validate: (value: unknown) => value is T) {
  return createAccountList({ userId, namespace, identify, validate, local: AsyncStorage, remote: accountRemote(userId), allowRestore: namespace === "hidden_chats" });
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
