import { PropsWithChildren } from "react";
import {
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  TextProps,
  View,
  ViewProps,
} from "react-native";

import { AppTheme, useAppTheme } from "@/theme";

type ThemedProps = PropsWithChildren<{
  style?: ViewProps["style"];
}>;

export function Screen({ children, style }: ThemedProps) {
  const theme = useAppTheme();

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }, style]}>
      {children}
    </View>
  );
}

export function Card({ children, style }: ThemedProps) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function AppText({
  children,
  muted,
  title,
  small,
  style,
  ...props
}: TextProps &
  PropsWithChildren<{
    muted?: boolean;
    title?: boolean;
    small?: boolean;
  }>) {
  const theme = useAppTheme();

  return (
    <Text
      {...props}
      style={[
        {
          color: muted ? theme.colors.muted : theme.colors.text,
          fontSize: title ? 24 : small ? 12 : 15,
          fontWeight: title ? "700" : "500",
          lineHeight: title ? 30 : small ? 16 : 21,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: PropsWithChildren<{
  tone?: "neutral" | "primary" | "teal" | "blue" | "danger";
}>) {
  const theme = useAppTheme();
  const colors = getPillColors(theme, tone);

  return (
    <View style={[styles.pill, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <AppText small style={{ color: colors.text }}>
        {children}
      </AppText>
    </View>
  );
}

export function PrimaryButton({ children, style, ...props }: PressableProps & PropsWithChildren) {
  const theme = useAppTheme();

  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.colors.primary,
          opacity: pressed ? 0.72 : 1,
        },
        typeof style === "function" ? style({ pressed }) : style,
      ]}
    >
      <AppText style={{ color: theme.colors.primaryText, fontWeight: "700" }}>{children}</AppText>
    </Pressable>
  );
}

export function SecondaryButton({ children, style, ...props }: PressableProps & PropsWithChildren) {
  const theme = useAppTheme();

  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: 1,
          opacity: pressed ? 0.72 : 1,
        },
        typeof style === "function" ? style({ pressed }) : style,
      ]}
    >
      <AppText>{children}</AppText>
    </Pressable>
  );
}

function getPillColors(theme: AppTheme, tone: "neutral" | "primary" | "teal" | "blue" | "danger") {
  if (tone === "primary") {
    return { background: theme.colors.primary, border: theme.colors.primary, text: theme.colors.primaryText };
  }

  if (tone === "teal") {
    return { background: "rgba(72, 203, 182, 0.16)", border: "rgba(72, 203, 182, 0.28)", text: theme.colors.text };
  }

  if (tone === "blue") {
    return { background: "rgba(110, 168, 255, 0.16)", border: "rgba(110, 168, 255, 0.28)", text: theme.colors.text };
  }

  if (tone === "danger") {
    return { background: "rgba(255, 118, 95, 0.16)", border: "rgba(255, 118, 95, 0.3)", text: theme.colors.text };
  }

  return { background: theme.colors.surfaceMuted, border: theme.colors.border, text: theme.colors.text };
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  pill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  button: {
    alignItems: "center",
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
