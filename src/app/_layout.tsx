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
import { PresenceProvider } from "@/lib/presence";
import { PasswordRecovery } from "@/components/password-recovery";
import { AppErrorBoundary } from "@/components/error-boundary";
import { clearDiagnosticsPreference, diagnosticsPreference } from "@/lib/diagnostics";
import { supabase } from "@/lib/supabase";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [recoveryAccepted, setRecoveryAccepted] = useState(false);
  useEffect(() => {
    const {data} = supabase.auth.onAuthStateChange((event,session) => {
      if (event === "PASSWORD_RECOVERY") setRecoveryAccepted(Boolean(session));
      if (event === "SIGNED_OUT") setRecoveryAccepted(false);
      clearDiagnosticsPreference();
      if (session) void diagnosticsPreference(session.user.id).catch(() => undefined);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return (
    <AppErrorBoundary>
    <ThemeProvider>
      <RootShell recoveryAccepted={recoveryAccepted} />
    </ThemeProvider>
    </AppErrorBoundary>
  );
}

function RootShell({ recoveryAccepted }: { recoveryAccepted: boolean }) {
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
        <PresenceProvider>
          <PhoneFrame>
            <PasswordRecovery recoveryAccepted={recoveryAccepted}>
            <Stack
              screenOptions={{
                contentStyle: { backgroundColor: theme.colors.background },
                headerShown: false,
              }}
            />
            </PasswordRecovery>
          </PhoneFrame>
          <VideoCompressorHost />
          <StatusBar style={theme.isDark ? "light" : "dark"} />
        </PresenceProvider>
      </AppDataProvider>
    </SafeAreaProvider>
  );
}
