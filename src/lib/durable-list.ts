export type ListStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

// Commit to storage before publishing a new list, and keep writes in order.
export function createDurableList<T>(storage: ListStorage, key: string, validate: (value: unknown) => value is T, clean = (items: T[]) => items) {
  let items: T[] | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue(operation: () => Promise<T[]>) {
    const result = queue.then(operation);
    queue = result.catch(() => undefined);
    return result;
  }
  return {
    load(fallback: T[]) {
      return enqueue(async () => {
        const raw = await storage.getItem(key);
        const parsed: unknown = raw == null ? fallback : JSON.parse(raw);
        if (!Array.isArray(parsed) || !parsed.every(validate)) throw new Error("Saved data could not be read.");
        const next = clean(parsed);
        await storage.setItem(key, JSON.stringify(next));
        items = next;
        return next;
      });
    },
    change(edit: (current: T[]) => T[]) {
      return enqueue(async () => {
        if (!items) throw new Error("Saved data is still loading. Please try again.");
        const next = edit(items);
        await storage.setItem(key, JSON.stringify(next));
        items = next;
        return next;
      });
    },
  };
}
