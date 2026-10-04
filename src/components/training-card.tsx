import { Image } from "expo-image";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import type { PropsWithChildren } from "react";
import { Card } from "./ui";
import { useAppTheme } from "@/theme";

export function TrainingCard({ children, style, padding = 18, gap = 16 }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; padding?: number; gap?: number }>) {
  const theme = useAppTheme();
  return <Card padding={padding} radius={22} gap={0} style={[{ overflow: "hidden", borderColor: theme.colors.panelBorder, boxShadow: theme.effects.cardShadow }, style]}>
    <Image accessible={false} pointerEvents="none" source={theme.isDark ? require("../../assets/brand/train-panel.svg") : require("../../assets/brand/train-panel-light.svg")} contentFit="fill" style={StyleSheet.absoluteFill} />
    <View style={{ zIndex: 1, gap }}>{children}</View>
  </Card>;
}
