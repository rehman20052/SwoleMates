import { useId } from "react";
import { View } from "react-native";
import Svg, { Defs, Ellipse, G, LinearGradient, Mask, Rect, Stop } from "react-native-svg";
import { BRAND_LIME } from "@/theme";
import { TrainText } from "./train-ui";

const brandLime = BRAND_LIME;

export function TrainHero({ gymName }: { gymName?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const fadeId = `train-fade-${id}`;
  const maskId = `train-mask-${id}`;
  return (
    <View style={{ height: 184, borderRadius: 12, overflow: "hidden", backgroundColor: "#000000", borderWidth: 1, borderColor: "#27272a" }}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "40%" }}>
        <Svg width="100%" height="100%" viewBox="0 0 160 184" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <Defs>
            <LinearGradient id={fadeId} x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0" stopColor="white" stopOpacity={0} />
              <Stop offset="0.35" stopColor="white" stopOpacity={0.18} />
              <Stop offset="1" stopColor="white" stopOpacity={0.7} />
            </LinearGradient>
            <Mask id={maskId} x="0" y="0" width="160" height="184" maskUnits="userSpaceOnUse">
              <Rect width="160" height="184" fill={`url(#${fadeId})`} />
            </Mask>
          </Defs>
          <G mask={`url(#${maskId})`} fill="none" stroke={brandLime} strokeWidth={1}>
            {Array.from({ length: 12 }, (_, index) => (
              <Ellipse key={index} cx={108} cy={92} rx={24 + index * 6} ry={30 + index * 7} transform={`rotate(${-28 + index * 3} 108 92)`} />
            ))}
            <Ellipse cx={108} cy={92} rx={96} ry={38} transform="rotate(-32 108 92)" strokeOpacity={0.55} />
            <Ellipse cx={108} cy={92} rx={96} ry={38} transform="rotate(32 108 92)" strokeOpacity={0.55} />
          </G>
        </Svg>
      </View>
      <View style={{ padding: 16, gap: 8, flex: 1, justifyContent: "center", width: "65%" }}>
        <TrainText size={10} weight="bold" color="#71717a" style={{ letterSpacing: 1.5 }}>
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }).toUpperCase()}
        </TrainText>
        <TrainText size={34} weight="black" color="#FFFFFF" style={{ letterSpacing: -1.7, lineHeight: 34 }}>
          {"LET'S\nTRAIN"}<TrainText size={34} weight="black" color={brandLime}>.</TrainText>
        </TrainText>
        <TrainText size={12} weight="medium" color="#A1A1AA" numberOfLines={2}>{gymName || "Your next workout starts here."}</TrainText>
      </View>
    </View>
  );
}
