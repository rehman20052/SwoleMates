import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";

import { supabase } from "@/lib/supabase";

const PresenceContext = createContext<Set<string>>(new Set());

export function PresenceProvider({ children }: PropsWithChildren) {
  const [userId, setUserId] = useState<string | null>(null);
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => { if (active) setUserId(data.session?.user.id ?? null); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUserId(session?.user.id ?? null));
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!userId) { setOnline(new Set()); return; }
    const channel = supabase.channel("swolemates-online", { config: { presence: { key: userId } } });
    const sync = () => {
      const state = channel.presenceState() as Record<string, Array<{ userId?: string }>>;
      const next = new Set<string>();
      for (const presences of Object.values(state)) for (const presence of presences) if (presence.userId) next.add(presence.userId);
      setOnline(next);
    };
    channel.on("presence", { event: "sync" }, sync).subscribe(async (status) => {
      if (status === "SUBSCRIBED" && AppState.currentState === "active") await channel.track({ userId, onlineAt: new Date().toISOString() });
    });
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void channel.track({ userId, onlineAt: new Date().toISOString() });
      else void channel.untrack();
    });
    return () => { appState.remove(); void channel.untrack(); void supabase.removeChannel(channel); };
  }, [userId]);

  return <PresenceContext.Provider value={online}>{children}</PresenceContext.Provider>;
}

export function useOnlineUsers() {
  return useContext(PresenceContext);
}
