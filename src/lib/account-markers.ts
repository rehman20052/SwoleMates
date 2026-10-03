import AsyncStorage from "@react-native-async-storage/async-storage";
import { accountList } from "./account-sync";

type ReadMarker = { id: string; at: string };
function isMarker(value: unknown): value is ReadMarker {
  if (!value || typeof value !== "object") return false;
  const entry = value as ReadMarker;
  return typeof entry.id === "string" && typeof entry.at === "string" && Number.isFinite(Date.parse(entry.at));
}
const readStores = new Map<string, ReturnType<typeof accountList<ReadMarker>>>();
const hiddenStores = new Map<string, ReturnType<typeof accountList<string>>>();
const pendingKey = (userId: string, namespace: string) => `swolemates.pending-reads.${userId}.${namespace}`;
const markerQueue = new Map<string, Promise<unknown>>();
async function enqueueMarker<T>(userId: string, namespace: string, operation: () => Promise<T>): Promise<T> {
  const key = `${userId}:${namespace}`;
  const result = (markerQueue.get(key) ?? Promise.resolve()).then(operation);
  markerQueue.set(key, result.catch(() => undefined)); return result;
}
function markerStore(userId: string, namespace: "chat_reads" | "friend_reads") {
  const key = `${userId}:${namespace}`;
  let store = readStores.get(key);
  if (!store) { store = accountList(userId, namespace, (item: ReadMarker) => item.id, isMarker); readStores.set(key, store); }
  return store;
}
export async function readAccountMarkers(userId: string, namespace: "chat_reads" | "friend_reads", legacy: Record<string, string> = {}) {
  return enqueueMarker(userId, namespace, async () => {
    const fallback = Object.entries(legacy).map(([id, at]) => ({ id, at })).filter(isMarker);
    const store = markerStore(userId, namespace);
    let items = await store.load(fallback);
    const raw = await AsyncStorage.getItem(pendingKey(userId, namespace));
    const pending = raw ? JSON.parse(raw) as Record<string, string> : {};
    const entries = Object.entries(pending).map(([id, at]) => ({ id, at })).filter(isMarker);
    if (entries.length) {
      items = await store.change((current) => {
        const merged = new Map(current.map((item) => [item.id, item]));
        for (const entry of entries) {
          const old = merged.get(entry.id);
          if (!old || Date.parse(entry.at) > Date.parse(old.at)) merged.set(entry.id, entry);
        }
        return [...merged.values()];
      });
      await AsyncStorage.setItem(pendingKey(userId, namespace), "{}");
    }
    return Object.fromEntries(items.map((item) => [item.id, item.at]));
  });
}
export async function markAccountRead(userId: string, namespace: "chat_reads" | "friend_reads", id: string, at: string, legacy: Record<string, string> = {}) {
  // Keep an outbox before contacting the server. Read receipts retry when the
  // inbox/feed next loads, unlike edits which require a confirmed server save.
  await enqueueMarker(userId, namespace, async () => {
    const raw = await AsyncStorage.getItem(pendingKey(userId, namespace));
    const pending = raw ? JSON.parse(raw) as Record<string, string> : {};
    if (!pending[id] || Date.parse(pending[id]) < Date.parse(at)) pending[id] = at;
    await AsyncStorage.setItem(pendingKey(userId, namespace), JSON.stringify(pending));
  });
  return readAccountMarkers(userId, namespace, legacy);
}
function hiddenStore(userId: string) {
  let store = hiddenStores.get(userId);
  if (!store) { store = accountList(userId, "hidden_chats", (item: string) => item, (value): value is string => typeof value === "string"); hiddenStores.set(userId, store); }
  return store;
}
export async function loadAccountHiddenChats(userId: string) {
  const raw = await AsyncStorage.getItem(`swolemates.hidden-chats.${userId}`);
  const fallback: unknown = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(fallback) || !fallback.every((id) => typeof id === "string")) throw new Error("Could not read hidden chats. Stored data has been preserved.");
  return new Set(await hiddenStore(userId).load(fallback));
}
export async function setAccountChatHidden(userId: string, id: string, hidden: boolean) {
  await loadAccountHiddenChats(userId);
  const items = await hiddenStore(userId).change((current) => hidden ? [...new Set([...current, id])] : current.filter((item) => item !== id));
  return new Set(items);
}
