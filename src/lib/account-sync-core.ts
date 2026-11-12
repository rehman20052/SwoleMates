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
type EditBase = { payload: unknown; restore?: boolean };
type Operation = { id: string; changes: RecordChange[]; bases?: Record<string, EditBase>; phase: SyncPhase; attempts: number; retryAt: number; message?: string };
type Cache = { version: 2; rows: AccountRecord[]; operations: Operation[] };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function serialized(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(serialized).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${serialized(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function mergeEdit(base: unknown, edit: unknown, latest: unknown): unknown {
  if (serialized(base) === serialized(edit)) return latest;
  if (!isObject(base) || !isObject(edit) || !isObject(latest)) return edit;
  return Object.fromEntries([...new Set([...Object.keys(latest), ...Object.keys(base), ...Object.keys(edit)])]
    .map(key => [key, mergeEdit(Object.hasOwn(base, key) ? base[key] : undefined,
      Object.hasOwn(edit, key) ? edit[key] : undefined, Object.hasOwn(latest, key) ? latest[key] : undefined)])
    .filter(([, value]) => value !== undefined));
}
const retryDelay = (attempts: number) => Math.min(60000, 1000 * 2 ** Math.min(attempts, 6));
const isReceiptRejection = (message?: string) => /^operation id (?:reused|refused)\.?$/i.test(message?.trim() ?? "");
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
  localFirst?: boolean; reconcileConflicts?: boolean;
  mergeConflict?: (base: T, edit: T, latest: T, mergeFields: typeof mergeEdit) => T;
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
  async function flush(force = false) {
    while (state.operations.length) {
      const op = state.operations[0];
      if (op.phase === "conflict" || (op.phase === "error" && !force) || (!force && op.retryAt > Date.now())) break;
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
  async function reconcile(op: Operation) {
    const ids = new Set(op.changes.map(change => change.id));
    const latest = remote.readRecords ? await remote.readRecords(namespace, [...ids]) : await remote.read(namespace);
    if (disposed) return;
    await enqueue(async () => {
      const rows = new Map(state.rows.map(row => [row.id, row]));
      const original = new Map(rows);
      for (const id of ids) rows.delete(id);
      for (const row of latest) if (ids.has(row.id)) rows.set(row.id, row);
      const working = new Map(rows);
      // Rebuild later edits to these rows against the merged queue, even if
      // dropping a redundant write makes the next revision happen to match.
      const operations = state.operations.flatMap(item => {
        const bases = new Map(Object.entries(item.bases ?? {}));
        const changes = item.changes.flatMap(change => {
          if (!ids.has(change.id)) return [change];
          const prior = original.get(change.id);
          original.set(change.id, { ...change, revision: change.expectedRevision + 1 });
          const base = bases.get(change.id) ?? (prior && !prior.deleted && prior.revision === change.expectedRevision ? { payload: prior.payload } : undefined);
          const current = working.get(change.id);
          if (change.deleted ? !current || current.deleted : current?.deleted && !base?.restore) return [];
          // Old offline imports are insert-only. They have no edit base.
          if (!base && current && change.expectedRevision === 0) return [];
          // Older queued edits without a recoverable base can only replay
          // their original payload.
          let merged = change.payload;
          if (!change.deleted && base && current && !current.deleted) {
            merged = options.mergeConflict && validate(base.payload) && validate(change.payload) && validate(current.payload)
              ? options.mergeConflict(base.payload, change.payload, current.payload, mergeEdit)
              : mergeEdit(base.payload, change.payload, current.payload);
          }
          const payload = change.deleted || validate(merged) ? merged : change.payload;
          if (!change.deleted && current && !current.deleted && serialized(payload) === serialized(current.payload)) return [];
          const expectedRevision = current?.revision ?? 0;
          bases.set(change.id, { payload: current?.deleted ? null : current?.payload ?? null, restore: base?.restore });
          working.set(change.id, { id: change.id, payload, deleted: change.deleted, revision: expectedRevision + 1 });
          return [{ ...change, payload, expectedRevision }];
        });
        if (!changes.length) return [];
        const next = { ...item, changes, bases: Object.fromEntries(bases) };
        // A receipt binds an ID to the exact batch, including its revisions.
        // Another tab may already have submitted an operation from this cache.
        if (item.id === op.id) return [{ ...next, id: newOperationId(), phase: "pending" as const, retryAt: 0, message: undefined }];
        return [serialized(changes) === serialized(item.changes) ? next : { ...next, id: newOperationId() }];
      });
      await persist({ ...state, rows: [...rows.values()], operations });
    });
  }
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
      do {
        syncRequested = false;
        while (state.operations.length) {
          const op = copy(state.operations[0]);
          const rejectedReceipt = op.phase === "error" && isReceiptRejection(op.message);
          if (op.phase === "conflict" && !options.reconcileConflicts) break;
          const backingOff = op.retryAt > Date.now() && (op.phase === "conflict" || rejectedReceipt || !force);
          if (backingOff || (op.phase === "error" && !rejectedReceipt && !force)) break;
          let savedRows: AccountRecord[] | undefined;
          try {
            if (op.phase === "conflict" || (rejectedReceipt && options.reconcileConflicts)) {
              await reconcile(op);
              if (disposed) return copy(visible());
              continue;
            }
            if (rejectedReceipt) {
              await enqueue(() => persist({ ...state, operations: state.operations.map(item => item.id === op.id
                ? { ...item, id: newOperationId(), phase: "pending", retryAt: 0, message: undefined } : item) }));
              continue;
            }
            await remote.save(namespace, op.changes, op.id);
            savedRows = await remote.readRecords?.(namespace, op.changes.map(change => change.id));
          } catch (error) {
            if (disposed) return copy(visible());
            const failed = failure(error);
            const message = (error as { message?: string }).message ?? "Waiting for connection";
            const receiptMismatch = isReceiptRejection(message);
            const retryRecovery = rejectedReceipt && failed === "pending";
            const phase = receiptMismatch || retryRecovery ? "error" : op.phase === "conflict" && failed === "pending" ? "conflict" : failed;
            const reconcileNow = op.attempts === 0 && !rejectedReceipt &&
              (receiptMismatch || (options.reconcileConflicts && phase === "conflict" && op.phase !== "conflict"));
            await enqueue(async () => {
              await persist({ ...state, operations: state.operations.map(item => item.id !== op.id ? item : { ...item, phase, attempts: item.attempts + 1,
                retryAt: reconcileNow ? 0 : Date.now() + retryDelay(item.attempts), message: retryRecovery ? op.message : message }) });
              return copy(visible());
            });
            if (reconcileNow) continue;
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
        const bases = options.reconcileConflicts ? Object.fromEntries(changes.map(({ id }) => {
          const row = prior.get(id);
          return [id, { payload: row?.deleted ? null : row?.payload ?? null, restore: restoreIds.includes(id) }];
        })) : undefined;
        await persist({ ...state, operations: [...state.operations, { id: newOperationId(), changes: copy(changes), bases, phase: "pending", attempts: 0, retryAt: 0 }] });
        if (options.localFirst) setTimeout(startSync, 0); else await flush();
        return copy(visible());
      });
    },
    status(): { phase: SyncPhase; message?: string; pending: number } {
      const op = state.operations.find(op => op.phase === "conflict" || op.phase === "error") ?? state.operations[0];
      const resolvingConflict = options.reconcileConflicts && op?.phase === "conflict";
      const recoveringReceipt = options.localFirst && op?.phase === "error" && isReceiptRejection(op.message);
      if (resolvingConflict || recoveringReceipt) {
        return { phase: "pending", pending: state.operations.length };
      }
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
