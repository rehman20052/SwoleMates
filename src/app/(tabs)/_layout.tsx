import { Tabs } from "expo-router";

import { useAppTheme } from "@/theme";

export default function TabsLayout() {
  const theme = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerShadowVisible: false,
        headerTintColor: theme.colors.text,
        sceneStyle: { backgroundColor: theme.colors.background },
        tabBarActiveTintColor: theme.colors.text,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
      }}
    >
      <Tabs.Screen name="discover" options={{ title: "Discover", tabBarLabel: "Discover" }} />
      <Tabs.Screen name="matches" options={{ title: "Matches", tabBarLabel: "Matches" }} />
      <Tabs.Screen name="plans" options={{ title: "Plans", tabBarLabel: "Plans" }} />
      <Tabs.Screen name="team" options={{ title: "Team", tabBarLabel: "Team" }} />
    </Tabs>
  );
}
