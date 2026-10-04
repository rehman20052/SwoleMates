import React from "react";
import { useAppTheme } from "@/theme";
import { Image } from "expo-image";

const thumbnails = {
  plan: require("../../assets/brand/fuel-plan.svg"),
  weight: require("../../assets/brand/fuel-weight.svg"),
};

const lightThumbnails = { plan: require("../../assets/brand/fuel-plan-light.svg"), weight: require("../../assets/brand/fuel-weight-light.svg") };

// Bundled artwork uses the same image renderer as the app's existing icons.
export function FuelThumbnail({ kind, size = 88 }: { kind: "plan" | "weight"; size?: number }) {
  const theme = useAppTheme();
  return <Image source={(theme.isDark ? thumbnails : lightThumbnails)[kind]} contentFit="contain" accessible={false} style={{ width: size, height: size, borderRadius: size * 0.24 }} />;
}
