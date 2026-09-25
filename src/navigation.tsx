import { createContext, useContext } from "react";

export type Tab = "Discover" | "Chat" | "Dashboard" | "Plans" | "Profile";

// Screens opened on top of the current tab. Chat and the scheduled
// confirmation hide the bottom nav; the rest keep it visible.
export type Route =
  | { name: "partner"; id: string }
  | { name: "chat"; id: string }
  | { name: "request-profile"; userId: string }
  | { name: "schedule"; partnerId?: string }
  | { name: "scheduled"; workoutId: string };

export const fullScreenRoutes: Route["name"][] = ["chat", "request-profile", "scheduled"];

type Navigation = {
  push: (route: Route) => void;
  replace: (route: Route) => void;
  back: () => void;
  setTab: (tab: Tab) => void;
  signOut: () => void;
};

export const NavigationContext = createContext<Navigation | null>(null);

export function useNavigation() {
  const context = useContext(NavigationContext);

  if (!context) {
    throw new Error("useNavigation must be used within the app's NavigationContext");
  }

  return context;
}
