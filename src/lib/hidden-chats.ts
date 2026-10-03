type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export function createHiddenChatStore(storage: Storage) {
  let queue: Promise<unknown> = Promise.resolve();
  const key = (userId: string) => `swolemates.hidden-chats.${userId}`;
  async function load(userId: string): Promise<Set<string>> {
    const raw = await storage.getItem(key(userId));
    const ids: unknown = raw == null ? [] : JSON.parse(raw);
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) throw new Error("Could not read hidden chats.");
    return new Set(ids);
  }
  return {
    load,
    setHidden(userId: string, requestId: string, hidden: boolean) {
      const operation = queue.then(async () => {
        const ids = await load(userId);
        if (hidden) ids.add(requestId);
        else ids.delete(requestId);
        await storage.setItem(key(userId), JSON.stringify([...ids]));
        return ids;
      });
      queue = operation.catch(() => undefined);
      return operation;
    },
  };
}
