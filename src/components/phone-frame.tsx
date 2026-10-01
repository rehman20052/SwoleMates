import { PropsWithChildren } from "react";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";

import { useAppTheme } from "@/theme";

// Matches the iPhone frames in the Figma file.
const PHONE = { width: 402, height: 874 };

// The box the app actually occupies: the desktop phone frame, or the real screen on a phone.
export function appFrameSize(window: { width: number; height: number }) {
  const framed = Platform.OS === "web" && window.width > PHONE.width + 48;
  if (!framed) return { width: window.width, height: window.height };
  return { width: PHONE.width, height: Math.min(PHONE.height, window.height - 32) };
}

// On desktop web, render the app inside a phone-sized frame so layouts match
// what you see in Expo Go. Phones (and native) render full screen as usual.
export function PhoneFrame({ children }: PropsWithChildren) {
  const theme = useAppTheme();
  const window = useWindowDimensions();
  const framed = Platform.OS === "web" && window.width > PHONE.width + 48;

  if (!framed) {
    return <>{children}</>;
  }

  return (
    <View style={[styles.backdrop, { backgroundColor: theme.colors.canvas }]}>
      <View
        style={[
          styles.phone,
          {
            backgroundColor: theme.colors.background,
            borderColor: theme.colors.border,
            height: Math.min(PHONE.height, window.height - 32),
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: "transparent",
    flex: 1,
    justifyContent: "center",
  },
  phone: {
    borderRadius: 36,
    borderWidth: 1,
    overflow: "hidden",
    width: PHONE.width,
  },
});
