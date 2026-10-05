import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { useAppData } from "@/state/app-data";

// Account-scoped local recovery plus individually synchronized cloud records.
export function useSavedDraft(id: string, restore: (content: string) => void) {
  const { accountUserId, foodJournalReady, workspaceSettings, saveWorkspaceSetting } = useAppData();
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("");
  const restoreRef = useRef(restore); restoreRef.current = restore;
  const saveRef = useRef(saveWorkspaceSetting); saveRef.current = saveWorkspaceSetting;
  const pending = useRef<{ content: string; updatedAt: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localWrites = useRef<Promise<unknown>>(Promise.resolve());
  const key = accountUserId ? `swolemates.draft.${accountUserId}.${id}` : null;
  useEffect(() => {
    if (!key || !foodJournalReady) return;
    let active = true;
    setReady(false); pending.current = null;
    const remote = workspaceSettings.find(item => item.id === id)?.value;
    void localWrites.current.catch(() => undefined).then(() => AsyncStorage.getItem(key)).then(raw => {
      let local: { content: string; updatedAt: number } | null = null;
      try { local = raw ? JSON.parse(raw) : null; } catch { /* Recover from cloud. */ }
      const cloud = typeof remote === "object" ? remote : null;
      const latest = local && typeof local.content === "string" && Number.isFinite(local.updatedAt) && (!cloud || local.updatedAt > cloud.updatedAt) ? local : cloud;
      if (!active) return;
      if (latest?.content) restoreRef.current(latest.content);
      if (latest) pending.current = latest;
      if (latest && accountUserId && (!cloud || latest.updatedAt > cloud.updatedAt)) {
        void saveRef.current(id, latest.content, accountUserId, latest.updatedAt);
      }
      setStatus(latest?.content ? "Draft restored" : "");
      setReady(true);
    }).catch(() => { if (active) { setReady(true); setStatus("Local draft storage unavailable"); } });
    return () => { active = false; };
  }, [key, foodJournalReady]);
  useEffect(() => {
    if (!accountUserId || !key) return;
    const owner = accountUserId;
    const flush = () => {
      const item = pending.current;
      if (item) void saveRef.current(id, item.content, owner, item.updatedAt);
    };
    const subscription = AppState.addEventListener("change", flush);
    const hide = () => flush();
    if (typeof window !== "undefined") window.addEventListener("pagehide", hide);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      flush(); subscription.remove();
      if (typeof window !== "undefined") window.removeEventListener("pagehide", hide);
    };
  }, [id, accountUserId, key]);
  function save(content: string) {
    if (!ready || !key || !accountUserId) return;
    const item = { content, updatedAt: Date.now() };
    pending.current = item;
    setStatus(content ? "Saving draft..." : "");
    localWrites.current = localWrites.current.catch(() => undefined).then(() => AsyncStorage.setItem(key, JSON.stringify(item))).catch(() => setStatus("Could not save draft on this device"));
    if (timer.current) clearTimeout(timer.current);
    const owner = accountUserId;
    timer.current = setTimeout(() => {
      void saveRef.current(id, content, owner, item.updatedAt).then(saved => {
        if (pending.current === item) setStatus(content ? saved ? "Draft saved" : "Draft on this device; account sync pending" : "");
      });
    }, 800);
  }
  return { ready, save, clear: () => save(""), status };
}
