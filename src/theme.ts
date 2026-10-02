import { createContext, createElement, PropsWithChildren, useContext, useEffect, useState } from "react";

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
  setScheme: (scheme: ColorScheme) => void;
}>({
  theme: darkTheme,
  scheme: "dark",
  setScheme: () => {},
});

function readStoredScheme(): ColorScheme {
  if (typeof localStorage === "undefined") return "dark";
  return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
}

function storeScheme(scheme: ColorScheme) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(THEME_KEY, scheme);
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [scheme, setSchemeState] = useState<ColorScheme>(readStoredScheme);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      const saved = data.session?.user.user_metadata?.colorScheme;
      if (!active || (saved !== "light" && saved !== "dark")) return;
      setSchemeState(saved);
      storeScheme(saved);
    });
    return () => {
      active = false;
    };
  }, []);

  function setScheme(next: ColorScheme) {
    setSchemeState(next);
    storeScheme(next);
    void supabase.auth.updateUser({ data: { colorScheme: next } });
  }

  return createElement(
    ThemeContext.Provider,
    { value: { theme: scheme === "light" ? lightTheme : darkTheme, scheme, setScheme } },
    children,
  );
}

export function useAppTheme() {
  return useContext(ThemeContext).theme;
}

export function useColorScheme() {
  const { scheme, setScheme } = useContext(ThemeContext);
  return { scheme, setScheme };
}
