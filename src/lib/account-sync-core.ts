import type { ListStorage } from "./durable-list";
export type AccountRecord = { id: string; payload: unknown; deleted: boolean; revision: number };
export type RecordChange = { id: string; payload: unknown; deleted: boolean; expectedRevision: number };
export type AccountRemote = {
  read: (namespace: string) => Promise<AccountRecord[]>;
  readRecords?: (namespace: string, ids: string[]) => Promise<AccountRecord[]>;
  import: (namespace: string, records: { id: string; payload: unknown }[]) => Promise<void>;
  save: (namespace: string, changes: RecordChange[], operationId?: string) => Promise<void>;
};
export type SyncPhase = "saved" | "pending" | "conflict" | "error";
type Operation = { id: string; changes: RecordChange[]; phase: SyncPhase; attempts: number; retryAt: number; message?: string };
type Cache = { version: 2; rows: AccountRecord[]; operations: Operation[] };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function serialized(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(serialized).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${serialized(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function failure(error: unknown): SyncPhase {
  const { code, message } = error as { code?: string; message?: string };
  if (code === "40001" || /newer version|conflict/i.test(message ?? "")) return "conflict";
  if (code && !["08000", "08001", "08006", "57014", "PGRST000", "PGRST001", "PGRST002"].includes(code)) return "error";
  if (/account changed|sign in|permission|still loading/i.test(message ?? "")) return "error";
  return "pending";
}
const newOperationId = () => `op-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export function createAccountList<T>(options: {
  userId: string; namespace: string; local: ListStorage; remote: AccountRemote;
  identify: (item: T) => string; validate: (value: unknown) => value is T;
  onCacheError?: () => void; allowRestore?: boolean;
}) {
  const { userId, namespace, local, remote, identify, validate } = options;
  const cacheKey = `swolemates.account-cache.${userId}.${namespace}`;
  const migrationKey = `swolemates.account-import.${userId}.${namespace}`;
  let queue: Promise<unknown> = Promise.resolve();
  let state: Cache = { version: 2, rows: [], operations: [] };
  let loaded = false;
  function enqueue(operation: () => Promise<T[]>): Promise<T[]> {
    const result = queue.then(operation); queue = result.catch(() => undefined); return result;
  }
  function validateItems(items: unknown): T[] {
    if (!Array.isArray(items) || !items.every(validate)) throw new Error(`Could not read saved ${namespace}. Stored data has been preserved.`);
    const ids = items.map(identify);
    if (ids.some(id => !id || id.length > 200) || new Set(ids).size !== ids.length) throw new Error("Invalid saved record IDs.");
    return items;
  }
  function projected(snapshot = state) {
    const rows = new Map(snapshot.rows.map(row => [row.id, row]));
    for (const op of snapshot.operations) for (const change of op.changes) rows.set(change.id,
      { id: change.id, payload: change.payload, deleted: change.deleted, revision: change.expectedRevision + 1 });
    return [...rows.values()];
  }
  function visible(snapshot = state) { return validateItems(projected(snapshot).filter(row => !row.deleted).map(row => row.payload)); }
  async function persist(next: Cache) {
    visible(next); await local.setItem(cacheKey, JSON.stringify(next)); state = next;
  }
  async function restore() {
    const raw = await local.getItem(cacheKey);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) state = { version: 2, rows: validateItems(parsed).map(payload => ({ id: identify(payload), payload, revision: 0, deleted: false })), operations: [] };
    else {
      if (parsed.version !== 2 || !Array.isArray(parsed.rows) || !Array.isArray(parsed.operations)) throw new Error("Invalid account cache. Stored data has been preserved.");
      state = parsed; visible();
    }
    return true;
  }
  async function flush(force = false) {
    while (state.operations.length) {
      const op = state.operations[0];
      if (op.phase === "conflict" || op.phase === "error" || (!force && op.retryAt > Date.now())) break;
      let savedRows: AccountRecord[] | undefined;
      try {
        await remote.save(namespace, op.changes, op.id);
        savedRows = await remote.readRecords?.(namespace, op.changes.map(change => change.id));
      }
      catch (error) {
        await persist({ ...state, operations: [{ ...op, phase: failure(error), attempts: op.attempts + 1,
          retryAt: Date.now() + Math.min(60000, 1000 * 2 ** Math.min(op.attempts, 6)),
          message: (error as { message?: string }).message ?? "Waiting for connection" }, ...state.operations.slice(1)] });
        break;
      }
      const rows = new Map(state.rows.map(row => [row.id, row]));
      for (const change of op.changes) rows.set(change.id, { id: change.id, payload: change.payload, deleted: change.deleted, revision: change.expectedRevision + 1 });
      for (const row of savedRows ?? []) rows.set(row.id, row);
      // Lost local acknowledgments retain the operation; server receipts make retry safe.
      await persist({ ...state, rows: [...rows.values()], operations: state.operations.slice(1) });
    }
  }
  async function pull() { await persist({ ...state, rows: await remote.read(namespace) }); }
  async function refresh(force = false) {
    if (!loaded) { await restore(); loaded = true; }
    await flush(force);
    try { await pull(); } catch (error) { if (failure(error) !== "pending") throw error; }
    return copy(visible());
  }
  return {
    load(fallback: T[] = []) {
      return enqueue(async () => {
        const hasCache = await restore();
        if (!(await local.getItem(migrationKey))) {
          const imports = validateItems(fallback);
          try {
            if (imports.length) await remote.import(namespace, imports.map(payload => ({ id: identify(payload), payload })));
            await local.setItem(migrationKey, "1");
          } catch (error) {
            if (failure(error) !== "pending") throw error;
            if (!hasCache && imports.length) await persist({ ...state, operations: [{ id: newOperationId(), changes: imports.map(payload => ({ id: identify(payload), payload, deleted: false, expectedRevision: 0 })), phase: "pending", attempts: 0, retryAt: 0 }] });
          }
        }
        loaded = true; return refresh();
      });
    },
    refresh() { return enqueue(() => refresh()); },
    retry() { return enqueue(() => refresh(true)); },
    change(edit: (current: T[]) => T[], restoreIds: string[] = []) {
      return enqueue(async () => {
        if (!loaded) throw new Error("Your account data is still loading. Please try again.");
        if (!state.operations.length) {
          try { await pull(); } catch (error) { if (failure(error) !== "pending") throw error; }
        }
        const next = validateItems(edit(copy(visible())));
        const prior = new Map(projected().map(row => [row.id, row]));
        const after = new Map(next.map(item => [identify(item), item])); const changes: RecordChange[] = [];
        for (const [id, payload] of after) {
          const old = prior.get(id);
          if (old?.deleted && !options.allowRestore && !restoreIds.includes(id)) throw new Error("This record was deleted on another device. Refresh before adding it again.");
          if (!old || old.deleted || serialized(payload) !== serialized(old.payload)) changes.push({ id, payload, deleted: false, expectedRevision: old?.revision ?? 0 });
        }
        for (const row of prior.values()) if (!row.deleted && !after.has(row.id)) changes.push({ id: row.id, payload: null, deleted: true, expectedRevision: row.revision });
        if (!changes.length) return copy(visible());
        await persist({ ...state, operations: [...state.operations, { id: newOperationId(), changes: copy(changes), phase: "pending", attempts: 0, retryAt: 0 }] });
        await flush(); return copy(visible());
      });
    },
    status(): { phase: SyncPhase; message?: string; pending: number } {
      const op = state.operations.find(op => op.phase === "conflict" || op.phase === "error") ?? state.operations[0];
      return { phase: op?.phase ?? "saved", message: op?.message, pending: state.operations.length };
    },
    resolve(choice: "server" | "reapply") {
      return enqueue(async () => {
        const rows = await remote.read(namespace);
        if (choice === "server") await persist({ ...state, rows, operations: [] });
        else {
          const revisions = new Map(rows.map(row => [row.id, row.revision]));
          const operations = state.operations.map(op => ({ ...op, id: newOperationId(), phase: "pending" as const, attempts: 0, retryAt: 0,
            changes: op.changes.map(change => { const revision = revisions.get(change.id) ?? 0; revisions.set(change.id, revision + 1); return { ...change, expectedRevision: revision }; }) }));
          await persist({ ...state, rows, operations }); await flush(true);
        }
        return copy(visible());
      });
    },
    async cached() { return (await restore()) ? copy(visible()) : null; },
  };
}
