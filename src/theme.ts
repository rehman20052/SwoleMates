export type AppTheme = typeof theme;

// Tokens from the SwoleMates Figma file. The design is dark-only.
const theme = {
  isDark: true,
  colors: {
    background: "#0A0A0C",
    surface: "#151518",
    surfaceRaised: "#202025",
    border: "#28282D",
    text: "#FFFFFF",
    muted: "#8E8E93",
    primary: "#CCFF00",
    primaryText: "#0A0A0C",
    primaryTint: "rgba(204, 255, 0, 0.1)",
    primaryDeep: "#1A2400",
    danger: "#FF3B30",
    scrim: "rgba(0, 0, 0, 0.7)",
    glass: "rgba(255, 255, 255, 0.13)",
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

export function useAppTheme() {
  return theme;
}
