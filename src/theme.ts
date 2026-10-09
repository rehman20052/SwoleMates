import { createContext, createElement, PropsWithChildren, useContext, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";

import { supabase } from "@/lib/supabase";

export type AppTheme = typeof darkTheme;
export type ColorScheme = "dark" | "light";

const THEME_KEY = "swolemates.color-scheme";

// Tokens from the SwoleMates Figma file. Dark is the default.
export const BRAND_LIME = "#D4FF00";

const darkTheme = {
  displayFont: "BebasNeue_400Regular" as string | undefined,
  isDark: true,
  colors: {
    background: "#000000",
    surface: "#151518",
    surfaceRaised: "#202025",
    border: "#28282D",
    text: "#FFFFFF",
    muted: "#8E8E93",
    primary: BRAND_LIME,
    accent: BRAND_LIME,
    primaryText: "#0A0A0C",
    primaryTint: "rgba(212, 255, 0, 0.16)",
    primaryDeep: "#1A2400",
    danger: "#FF3B30",
    scrim: "rgba(0, 0, 0, 0.7)",
    glass: "rgba(255, 255, 255, 0.13)",
    canvas: "#000000",
    panelBorder: "#344148",
    borderStrong: "#46535A",
    segmentSurface: "#0E1519",
    actionSurface: "#111A20",
    rowSurface: "rgba(16,25,28,0.75)",
    insetSurface: "rgba(9,17,20,0.5)",
    planSurface: "rgba(5,10,12,0.5)",
    progressTrack: "#28282D",
    summaryProgressTrack: "#202025",
    progressStart: "#729F00",
    progressEnd: BRAND_LIME,
    progressHighlight: "#FFFFFF",
    carbs: "#B38542",
    fat: "#659A99",
    success: BRAND_LIME,
    sheetOverlay: "rgba(0,0,0,0.74)",
    modalOverlay: "rgba(0,0,0,0.72)",
    editorOverlay: "rgba(0,0,0,0.65)",
    photoText: "#FFFFFF",
    photoMuted: "#8E8E93",
    photoAccent: BRAND_LIME,
    photoControl: "rgba(212,255,0,0.16)",
  },
  effects: {
    cardShadow: "0 4px 20px rgba(0,0,0,0.2)",
    selectionShadow: "0 0 14px rgba(212,255,0,0.15)",
    actionShadow: "0 0 20px rgba(212,255,0,0.12)",
    recipeShadow: "0 0 14px rgba(195,245,20,0.12)",
    heroOpacity: 0.65,
    fuelHeroOpacity: 0.6,
    recipeOpacity: 0.55,
    progressHaloOpacity: 0.8,
  },
  fonts: {
    regular: "Barlow_400Regular",
    medium: "Barlow_500Medium",
    semibold: "Barlow_600SemiBold",
    bold: "Barlow_700Bold",
    extrabold: "Barlow_800ExtraBold",
    black: "Barlow_900Black",
  },
  spacing: {
    xs: 8,
    sm: 16,
    md: 24,
    lg: 32,
    xl: 32,
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
  effects: {
    cardShadow: "0 3px 14px rgba(17,19,15,0.045)",
    selectionShadow: "0 3px 12px rgba(157,217,0,0.20)",
    actionShadow: "0 4px 16px rgba(157,217,0,0.18)",
    recipeShadow: "0 3px 14px rgba(71,102,0,0.06)",
    heroOpacity: 1,
    fuelHeroOpacity: 1,
    recipeOpacity: 1,
    progressHaloOpacity: 0.3,
  },
  colors: {
    ...darkTheme.colors,
    background: "#F5F6F2",
    surface: "#FFFFFF",
    surfaceRaised: "#F0F2EC",
    border: "#DDE1D8",
    text: "#11130F",
    muted: "#656A63",
    primary: BRAND_LIME,
    accent: "#476600",
    primaryText: "#11130F",
    primaryTint: "#EDF5D9",
    primaryDeep: "#E4EEC2",
    glass: "rgba(17,19,15,0.04)",
    canvas: "#E1E5DC",
    danger: "#C92A24",
    scrim: "rgba(17,19,15,0.36)",
    panelBorder: "#DDE1D8",
    borderStrong: "#C8CEC0",
    segmentSurface: "#E5EAD8",
    actionSurface: "#EEF2E3",
    rowSurface: "#F0F2EC",
    insetSurface: "#F0F2EC",
    planSurface: "#F0F2EC",
    progressTrack: "#E1E5DC",
    summaryProgressTrack: "#E1E5DC",
    progressStart: "#628B00",
    progressEnd: BRAND_LIME,
    progressHighlight: "#FFFFFF",
    carbs: "#A66C18",
    fat: "#327E80",
    success: "#476600",
    sheetOverlay: "rgba(17,19,15,0.36)",
    modalOverlay: "rgba(17,19,15,0.36)",
    editorOverlay: "rgba(17,19,15,0.36)",
    photoMuted: "#E5E8E0",
    photoControl: "rgba(10,18,6,0.8)",
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
  if (Platform.OS !== "web" || typeof globalThis.localStorage === "undefined") return "dark";
  try { return globalThis.localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark"; } catch { return "dark"; }
}

function storeScheme(scheme: ColorScheme) {
  if (Platform.OS !== "web" || typeof globalThis.localStorage === "undefined") return;
  try { globalThis.localStorage.setItem(THEME_KEY, scheme); } catch { /* The account remains authoritative. */ }
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
    if (Platform.OS === "web" && typeof window !== "undefined") window.addEventListener("focus", focus);
    return () => {
      active = false;
      generation.current++; auth.subscription.unsubscribe(); subscription.remove();
      if (Platform.OS === "web" && typeof window !== "undefined") window.removeEventListener("focus", focus);
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

// A local appearance override keeps section-specific designs inside their screen.
export function ThemeScope({ theme, children }: PropsWithChildren<{ theme: AppTheme }>) {
  const current = useContext(ThemeContext);
  return createElement(ThemeContext.Provider, { value: { ...current, theme } }, children);
}

export function useColorScheme() {
  const { scheme, setScheme, schemeError, savingScheme } = useContext(ThemeContext);
  return { scheme, setScheme, schemeError, savingScheme };
}
