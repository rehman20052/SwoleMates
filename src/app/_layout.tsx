import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
  useFonts,
} from "@expo-google-fonts/inter";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";

import { SafeAreaProvider } from "react-native-safe-area-context";

import { PhoneFrame } from "@/components/phone-frame";
import { VideoCompressorHost } from "@/components/video-compressor-host";
import { AppDataProvider } from "@/state/app-data";
import { ThemeProvider, useAppTheme } from "@/theme";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootShell />
    </ThemeProvider>
  );
}

function RootShell() {
  const theme = useAppTheme();
  const [fontWaitExpired, setFontWaitExpired] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
  });
  const ready = fontsLoaded || !!fontError || fontWaitExpired;

  useEffect(() => {
    if (Platform.OS !== "web" || ready) return;
    const timer = setTimeout(() => setFontWaitExpired(true), 6000);
    return () => clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    // Match the browser canvas, including overscroll and safe-area regions.
    document.documentElement.style.backgroundColor = theme.colors.background;
    document.body.style.backgroundColor = theme.colors.background;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.colors.background);
  }, [theme.colors.background]);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  }

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <AppDataProvider>
        <PhoneFrame>
          <Stack
            screenOptions={{
              contentStyle: { backgroundColor: theme.colors.background },
              headerShown: false,
            }}
          />
        </PhoneFrame>
        <VideoCompressorHost />
        <StatusBar style={theme.isDark ? "light" : "dark"} />
      </AppDataProvider>
    </SafeAreaProvider>
  );
}
