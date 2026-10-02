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
import { useEffect } from "react";
import { View } from "react-native";

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
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
  });

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  }

  return (
    <SafeAreaProvider>
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
