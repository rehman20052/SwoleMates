import { createContext, createElement, PropsWithChildren, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { supabase } from "@/lib/supabase";

export type AppTheme = typeof darkTheme;
export type ColorScheme = "dark" | "light";

const THEME_KEY = "swolemates.color-scheme";

// Tokens from the SwoleMates Figma file. Dark is the default.
const darkTheme = {
  isDark: true,
  colors: {
    background: "#0A0A0C",
    surface: "#151518",
    surfaceRaised: "#202025",
    border: "#28282D",
    text: "#FFFFFF",
    muted: "#8E8E93",
    primary: "#CCFF00",
    accent: "#CCFF00",
    primaryText: "#0A0A0C",
    primaryTint: "rgba(204, 255, 0, 0.16)",
    primaryDeep: "#1A2400",
    danger: "#FF3B30",
    scrim: "rgba(0, 0, 0, 0.7)",
    glass: "rgba(255, 255, 255, 0.13)",
    canvas: "#141416",
  },
  fonts: {
    regular: "Inter_400Regular",
    medium: "Inter_500Medium",
    semibold: "Inter_600SemiBold",
    bold: "Inter_700Bold",
    extrabold: "Inter_800ExtraBold",
    black: "Inter_900Black",
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
  },
  radius: {
    sm: 8,
    md: 10,
    lg: 14,
    xl: 20,
  },
};

const lightTheme: AppTheme = {
  ...darkTheme,
  isDark: false,
  colors: {
    ...darkTheme.colors,
    background: "#F3F3F5",
    surface: "#FFFFFF",
    surfaceRaised: "#E7E7EC",
    border: "#D5D5DB",
    text: "#121214",
    muted: "#5E5E66",
    primary: "#4E7C00",
    accent: "#365800",
    primaryText: "#FFFFFF",
    primaryTint: "rgba(78, 124, 0, 0.16)",
    primaryDeep: "#E4EEC2",
    glass: "rgba(0, 0, 0, 0.06)",
    canvas: "#D7D7DC",
  },
};

const ThemeContext = createContext<{
  theme: AppTheme;
  scheme: ColorScheme;
  setScheme: (scheme: ColorScheme) => Promise<boolean>;
  schemeError: string | null;
  savingScheme: boolean;
}>({
  theme: darkTheme,
  scheme: "dark",
  setScheme: async () => false,
  schemeError: null,
  savingScheme: false,
});

function readStoredScheme(): ColorScheme {
  if (typeof localStorage === "undefined") return "dark";
  try { return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark"; } catch { return "dark"; }
}

function storeScheme(scheme: ColorScheme) {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(THEME_KEY, scheme); } catch { /* The account remains authoritative. */ }
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [scheme, setSchemeState] = useState<ColorScheme>(readStoredScheme);
  const [schemeError, setSchemeError] = useState<string | null>(null);
  const [savingScheme, setSavingScheme] = useState(false);
  const saving = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (saving.current) return;
      const version = ++generation.current;
      const { data, error } = await supabase.auth.getUser();
      if (!active || saving.current || version !== generation.current || error) return;
      const saved = data.user?.user_metadata?.colorScheme;
      if (saved !== "light" && saved !== "dark") return;
      setSchemeState(saved); storeScheme(saved);
    };
    void refresh();
    const { data: auth } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { generation.current++; setSchemeState("dark"); setSchemeError(null); }
      if (event === "SIGNED_IN" || event === "USER_UPDATED") setTimeout(() => void refresh(), 0);
    });
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void refresh(); });
    const focus = () => void refresh();
    if (typeof window !== "undefined") window.addEventListener("focus", focus);
    return () => {
      active = false;
      generation.current++; auth.subscription.unsubscribe(); subscription.remove();
      if (typeof window !== "undefined") window.removeEventListener("focus", focus);
    };
  }, []);

  async function setScheme(next: ColorScheme) {
    if (saving.current) return false;
    saving.current = true; setSavingScheme(true); setSchemeError(null);
    const version = ++generation.current;
    try {
      const { data: session } = await supabase.auth.getSession();
      if (session.session) {
        const { error } = await supabase.auth.updateUser({ data: { colorScheme: next } });
        if (error) throw error;
      }
      if (version !== generation.current) return false;
      setSchemeState(next); storeScheme(next); return true;
    } catch {
      setSchemeError("Could not save your appearance setting. Check your connection and try again."); return false;
    } finally { saving.current = false; setSavingScheme(false); }
  }

  return createElement(
    ThemeContext.Provider,
    { value: { theme: scheme === "light" ? lightTheme : darkTheme, scheme, setScheme, schemeError, savingScheme } },
    children,
  );
}

export function useAppTheme() {
  return useContext(ThemeContext).theme;
}

export function useColorScheme() {
  const { scheme, setScheme, schemeError, savingScheme } = useContext(ThemeContext);
  return { scheme, setScheme, schemeError, savingScheme };
}
