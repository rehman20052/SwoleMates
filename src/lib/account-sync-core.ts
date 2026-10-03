import type { ListStorage } from "./durable-list";

export type AccountRecord = { id: string; payload: unknown; deleted: boolean; revision: number };
export type RecordChange = { id: string; payload: unknown; deleted: boolean; expectedRevision: number };
export type AccountRemote = {
  read: (namespace: string) => Promise<AccountRecord[]>;
  import: (namespace: string, records: { id: string; payload: unknown }[]) => Promise<void>;
  save: (namespace: string, changes: RecordChange[]) => Promise<void>;
};
function serialized(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(serialized).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${serialized(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function createAccountList<T>(options: {
  userId: string; namespace: string; local: ListStorage; remote: AccountRemote;
  identify: (item: T) => string; validate: (value: unknown) => value is T;
  onCacheError?: () => void;
  allowRestore?: boolean;
}) {
  const { userId, namespace, local, remote, identify, validate } = options;
  const cacheKey = `swolemates.account-cache.${userId}.${namespace}`;
  const migrationKey = `swolemates.account-import.${userId}.${namespace}`;
  let queue: Promise<unknown> = Promise.resolve();
  let loaded = false;
  function enqueue(operation: () => Promise<T[]>): Promise<T[]> {
    const result = queue.then(operation); queue = result.catch(() => undefined); return result;
  }
  function validateItems(items: unknown): T[] {
    if (!Array.isArray(items) || !items.every(validate)) throw new Error(`Could not read saved ${namespace}. Stored data has been preserved.`);
    const ids = items.map(identify);
    if (ids.some((id) => !id || id.length > 200) || new Set(ids).size !== ids.length) throw new Error("Invalid saved record IDs.");
    return items;
  }
  async function cache(rows: AccountRecord[]) {
    const items = validateItems(rows.filter((row) => !row.deleted).map((row) => row.payload));
    // A cache failure cannot undo an acknowledged server save.
    await local.setItem(cacheKey, JSON.stringify(items)).catch(() => options.onCacheError?.());
    return items;
  }
  return {
    load(fallback: T[] = []) {
      return enqueue(async () => {
        if (!(await local.getItem(migrationKey))) {
          const imports = validateItems(fallback);
          if (imports.length) await remote.import(namespace, imports.map((payload) => ({ id: identify(payload), payload })));
          // Import is retried safely if this write fails or the phone closes here.
          await local.setItem(migrationKey, "1");
        }
        const items = await cache(await remote.read(namespace)); loaded = true; return items;
      });
    },
    refresh() {
      return enqueue(async () => { const items = await cache(await remote.read(namespace)); loaded = true; return items; });
    },
    change(edit: (current: T[]) => T[]) {
      return enqueue(async () => {
        if (!loaded) throw new Error("Your account data is still loading. Please try again.");
        const rows = await remote.read(namespace);
        const current = validateItems(rows.filter((row) => !row.deleted).map((row) => row.payload));
        const next = validateItems(edit(JSON.parse(JSON.stringify(current))));
        const prior = new Map(rows.map((row) => [row.id, row]));
        const after = new Map(next.map((item) => [identify(item), item]));
        const changes: RecordChange[] = [];
        for (const [id, payload] of after) {
          const old = prior.get(id);
          // IDs are unique per create. A stale edit must not resurrect a deletion.
          if (old?.deleted && !options.allowRestore) throw new Error("This record was deleted on another device. Refresh before adding it again.");
          if (!old || old.deleted || serialized(payload) !== serialized(old.payload)) changes.push({ id, payload, deleted: false, expectedRevision: old?.revision ?? 0 });
        }
        for (const row of rows) {
          if (!row.deleted && !after.has(row.id)) changes.push({ id: row.id, payload: null, deleted: true, expectedRevision: row.revision });
        }
        if (changes.length) await remote.save(namespace, changes);
        const committed = new Map(rows.map((row) => [row.id, row]));
        for (const change of changes) committed.set(change.id, { id: change.id, payload: change.payload, deleted: change.deleted, revision: change.expectedRevision + 1 });
        return cache([...committed.values()]);
      });
    },
    async cached() {
      const raw = await local.getItem(cacheKey);
      return raw === null ? null : validateItems(JSON.parse(raw));
    },
  };
}
