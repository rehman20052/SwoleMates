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
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";

import { PhoneFrame } from "@/components/phone-frame";
import { VideoCompressorHost } from "@/components/video-compressor-host";
import { AppDataProvider } from "@/state/app-data";
import { ThemeProvider, useAppTheme } from "@/theme";

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

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  }

  return (
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
  );
}
