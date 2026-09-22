import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { useAppTheme } from "@/theme";

export default function RootLayout() {
  const theme = useAppTheme();

  return (
    <>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: theme.colors.background },
          headerShown: false,
        }}
      />
      <StatusBar style={theme.isDark ? "light" : "dark"} />
    </>
  );
}
