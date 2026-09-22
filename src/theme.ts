import { useColorScheme } from "react-native";

export type AppTheme = ReturnType<typeof makeTheme>;

const palette = {
  lime: "#D7FF5F",
  limeSoft: "#ECFFC2",
  coral: "#FF765F",
  teal: "#48CBB6",
  blue: "#6EA8FF",
  ink: "#121513",
};

function makeTheme(isDark: boolean) {
  return {
    isDark,
    colors: {
      background: isDark ? "#090C0A" : "#F6F7F1",
      surface: isDark ? "#121711" : "#FFFFFF",
      surfaceMuted: isDark ? "#1D251D" : "#EBEFE6",
      border: isDark ? "#2E392F" : "#D9DED3",
      text: isDark ? "#F5F7F1" : palette.ink,
      muted: isDark ? "#AEB9AD" : "#657063",
      primary: palette.lime,
      primarySoft: isDark ? "#293B18" : palette.limeSoft,
      primaryText: "#121513",
      danger: palette.coral,
      teal: palette.teal,
      blue: palette.blue,
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
      md: 12,
      lg: 18,
      xl: 26,
    },
  };
}

export function useAppTheme() {
  const scheme = useColorScheme();
  return makeTheme(scheme === "dark");
}
