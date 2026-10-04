import { useId } from "react";
import { Image, type ImageSource } from "expo-image";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useAppTheme } from "@/theme";

// Photo cards keep their own contrast treatment within the surrounding light UI.
export function HomeBackdrop({ source, opacity }: { source: ImageSource; opacity: number }) {
  const theme = useAppTheme();
  const id = `home-backdrop-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return <View accessible={false} pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Image accessible={false} source={source} contentFit="cover" style={[StyleSheet.absoluteFill, { opacity }]} />
    {!theme.isDark ? <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs><LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
        <Stop offset="0%" stopColor="#071006" stopOpacity="0.48" />
        <Stop offset="40%" stopColor="#071006" stopOpacity="0.40" />
        <Stop offset="80%" stopColor="#071006" stopOpacity="0.30" />
        <Stop offset="100%" stopColor="#071006" stopOpacity="0.06" />
      </LinearGradient></Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg> : null}
  </View>;
}
