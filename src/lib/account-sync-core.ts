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
  if (code === "PT409" || code === "40001" || /newer version|conflict/i.test(message ?? "")) return "conflict";
  if (code && !["REQUEST_TIMEOUT", "08000", "08001", "08006", "57014", "PGRST000", "PGRST001", "PGRST002"].includes(code)) return "error";
  if (/account changed|sign in|permission|still loading/i.test(message ?? "")) return "error";
  return "pending";
}
const newOperationId = () => `op-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export function createAccountList<T>(options: {
  userId: string; namespace: string; local: ListStorage; remote: AccountRemote;
  identify: (item: T) => string; validate: (value: unknown) => value is T;
  onCacheError?: () => void; allowRestore?: boolean;
  // Lets a list settle a rejected save on its own instead of waiting for the user, e.g. drafts
  // keep whichever copy was edited last. "local" re-sends the change on top of the server copy;
  // "server" drops it.
  resolveConflict?: (local: RecordChange, server: AccountRecord | undefined) => "local" | "server";
  localFirst?: boolean;
  onChange?: () => void;
}) {
  const { userId, namespace, local, remote, identify, validate } = options;
  const cacheKey = `swolemates.account-cache.${userId}.${namespace}`;
  const migrationKey = `swolemates.account-import.${userId}.${namespace}`;
  let queue: Promise<unknown> = Promise.resolve();
  let state: Cache = { version: 2, rows: [], operations: [] };
  let loaded = false;
  let disposed = false;
  function enqueue<U>(operation: () => Promise<U>): Promise<U> {
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
    if (disposed) throw new Error("Your account changed. Reopen this screen before saving.");
    visible(next); await local.setItem(cacheKey, JSON.stringify(next)); state = next;
    options.onChange?.();
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
  // Settles a rejected save once using options.resolveConflict. Returns false when it can't,
  // so the operation stays a conflict and is never re-sent automatically.
  async function settleConflict(op: Operation) {
    if (!options.resolveConflict) return false;
    let rows: AccountRecord[];
    try { rows = await remote.read(namespace); } catch { return false; }
    return options.localFirst ? enqueue(() => applyConflictResolution(op, rows)) : applyConflictResolution(op, rows);
  }
  async function applyConflictResolution(op: Operation, rows: AccountRecord[]) {
    if (disposed || state.operations[0]?.id !== op.id || !options.resolveConflict) return false;
    const server = new Map(rows.map(row => [row.id, row]));
    const revisions = new Map(rows.map(row => [row.id, row.revision]));
    const kept = op.changes.filter(change => options.resolveConflict!(change, server.get(change.id)) === "local");
    // Every queued change is rebased on the server's current revisions.
    const rebase = (change: RecordChange) => {
      const revision = revisions.get(change.id) ?? 0; revisions.set(change.id, revision + 1);
      return { ...change, expectedRevision: revision };
    };
    const operations = [
      ...(kept.length ? [{ ...op, id: newOperationId(), phase: "pending" as const, attempts: 0, retryAt: 0, message: undefined, changes: kept.map(rebase) }] : []),
      ...state.operations.slice(1).map(next => ({ ...next, changes: next.changes.map(rebase) })),
    ];
    await persist({ ...state, rows, operations });
    return true;
  }
  async function flush(force = false) {
    const settled = new Set<string>();
    while (state.operations.length) {
      const op = state.operations[0];
      if (op.phase === "conflict" || (op.phase === "error" && !force) || (!force && op.retryAt > Date.now())) break;
      let savedRows: AccountRecord[] | undefined;
      try {
        await remote.save(namespace, op.changes, op.id);
        savedRows = await remote.readRecords?.(namespace, op.changes.map(change => change.id));
      }
      catch (error) {
        const phase = failure(error);
        // Each rejected save is settled at most once per flush, so a second rejection stops here.
        if (phase === "conflict" && !settled.has(op.id) && await settleConflict(op).catch(() => false)) {
          settled.add(op.id);
          if (state.operations[0]) settled.add(state.operations[0].id);
          continue;
        }
        const next: Cache = { ...state, operations: [{ ...op, phase, attempts: op.attempts + 1,
          retryAt: Date.now() + Math.min(60000, 1000 * 2 ** Math.min(op.attempts, 6)),
          message: (error as { message?: string }).message ?? "Waiting for connection" }, ...state.operations.slice(1)] };
        // If the device can't store the failure (e.g. its storage is full), still remember it in
        // memory. Otherwise the same rejected save stays "pending" and is re-sent on every change,
        // which is how one stale draft ended up hitting the database every second.
        try { await persist(next); } catch { state = next; }
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
  // Only local persistence runs in `queue` in local-first mode. Network work
  // has one independent worker, so an offline/slow server cannot hold edits.
  let worker: Promise<T[]> | null = null;
  let pullRequested = false;
  let syncRequested = false;
  function synchronize(pull = false, force = false): Promise<T[]> {
    if (disposed) return Promise.resolve(copy(visible()));
    pullRequested ||= pull; syncRequested = true;
    if (worker) return worker;
    worker = (async () => {
      const settled = new Set<string>();
      do {
        syncRequested = false;
        while (state.operations.length) {
          const op = copy(state.operations[0]);
          if (op.phase === "conflict" || (!force && (op.phase === "error" || op.retryAt > Date.now()))) break;
          let savedRows: AccountRecord[] | undefined;
          try {
            await remote.save(namespace, op.changes, op.id);
            savedRows = await remote.readRecords?.(namespace, op.changes.map(change => change.id));
          } catch (error) {
            if (disposed) return copy(visible());
            const phase = failure(error);
            if (phase === "conflict" && !settled.has(op.id) && await settleConflict(op).catch(() => false)) {
              settled.add(op.id);
              if (state.operations[0]) settled.add(state.operations[0].id);
              continue;
            }
            await enqueue(async () => {
              if (disposed) return copy(visible());
              const next: Cache = { ...state, operations: state.operations.map(item => item.id !== op.id ? item : { ...item, phase, attempts: item.attempts + 1,
                retryAt: Date.now() + Math.min(60000, 1000 * 2 ** Math.min(item.attempts, 6)), message: (error as { message?: string }).message ?? "Waiting for connection" }) };
              try { await persist(next); } catch { state = next; }
              return copy(visible());
            });
            break;
          }
          if (disposed) return copy(visible());
          await enqueue(async () => {
            const rows = new Map(state.rows.map(row => [row.id, row]));
            for (const change of op.changes) rows.set(change.id, { id: change.id, payload: change.payload, deleted: change.deleted, revision: change.expectedRevision + 1 });
            for (const row of savedRows ?? []) rows.set(row.id, row);
            await persist({ ...state, rows: [...rows.values()], operations: state.operations.filter(item => item.id !== op.id) });
            return copy(visible());
          });
        }
        if (pullRequested) {
          pullRequested = false;
          try {
            const rows = await remote.read(namespace);
            if (disposed) return copy(visible());
            await enqueue(async () => { await persist({ ...state, rows }); return copy(visible()); });
          } catch (error) { if (failure(error) !== "pending") throw error; }
        }
      } while (syncRequested || pullRequested);
      return copy(visible());
    })().finally(() => { worker = null; });
    return worker;
  }
  const startSync = () => { void synchronize().catch(() => options.onCacheError?.()); };
  async function loadCachedThenRefresh(fallback: T[]) {
    let hasCache = false;
    await enqueue(async () => { hasCache = await restore(); if (hasCache) loaded = true; return copy(visible()); });
    if (hasCache) return synchronize(true);
    return loadLegacy(fallback);
  }
  function loadLegacy(fallback: T[]) {
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
  }
  return {
    load(fallback: T[] = []) {
      return options.localFirst ? loadCachedThenRefresh(fallback) : loadLegacy(fallback);
    },
    refresh() { return options.localFirst ? synchronize(true) : enqueue(() => refresh()); },
    retry() { return options.localFirst ? synchronize(true, true) : enqueue(() => refresh(true)); },
    change(edit: (current: T[]) => T[], restoreIds: string[] = []) {
      return enqueue(async () => {
        if (disposed) throw new Error("Your account changed. Reopen this screen before saving.");
        if (!loaded) throw new Error("Your account data is still loading. Please try again.");
        if (!options.localFirst && !state.operations.length) {
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
        if (options.localFirst) setTimeout(startSync, 0); else await flush();
        return copy(visible());
      });
    },
    status(): { phase: SyncPhase; message?: string; pending: number } {
      const op = state.operations.find(op => op.phase === "conflict" || op.phase === "error") ?? state.operations[0];
      return { phase: op?.phase ?? "saved", message: op?.message, pending: state.operations.length };
    },
    async resolve(choice: "server" | "reapply") {
      if (options.localFirst && worker) await worker.catch(() => undefined);
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
    async cached() {
      if (options.localFirst && loaded) return copy(visible());
      return enqueue(async () => { const found = await restore(); if (found && options.localFirst) loaded = true; return found ? copy(visible()) : null; });
    },
    dispose() { disposed = true; },
  };
}
