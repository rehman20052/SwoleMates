import { Image } from "expo-image";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon } from "./ui";
import { icons } from "@/assets";
import { useAppTheme } from "@/theme";

const macroPaths = {
  Protein: "M5 17c-1-4 0-7 3-10l2 1-1 4 2 1c3-3 7-3 9 0 2 3 0 7-4 7H8l-3-3z",
  Carbs: "M5 21L18 4M9 16c-5 0-5-5-5-5 4 0 6 2 5 5zm4-5c-5 0-5-5-5-5 4 0 6 2 5 5zm-3 6c0-5 5-5 5-5 0 4-2 6-5 5zm4-5c0-5 5-5 5-5 0 4-2 6-5 5z",
  Fat: "M12 3C9 8 5 12 5 16a7 7 0 0014 0c0-4-4-8-7-13z",
};

export function MacroPlanCard({ calories, protein, carbs, fat, consumed, goal, manual, progressLabel, hasPlan, disabled, onEdit, onPress }: {
  calories: number; protein: number; carbs: number; fat: number;
  consumed: { calories: number; protein: number; carbs: number; fats: number };
  manual: boolean; progressLabel: string; onEdit: () => void;
  goal?: "lose" | "maintain" | "gain"; hasPlan: boolean; disabled: boolean; onPress: () => void;
}) {
  const theme = useAppTheme();
  const palette = theme.isDark ? {
    background: "#10180E", surface: "rgba(6,13,8,0.88)", calorieSurface: "rgba(6,13,8,0.85)", text: "#FFFFFF", muted: "#CDD3C9",
    border: "rgba(179,210,151,0.18)", divider: "rgba(255,255,255,0.18)", accent: "#C6FF00", track: "#263029", editSurface: "#26351A", editText: "#D5FF7F", editBorder: "#657B3C",
  } : {
    background: "#F0F5E8", surface: "#EAF1E1", calorieSurface: "#F7FAEF", text: theme.colors.text, muted: theme.colors.muted,
    border: "#CBD9BB", divider: "#D5DEC9", accent: theme.colors.accent, track: "#D5E2C7", editSurface: "#DBEABC", editText: theme.colors.accent, editBorder: "#91AA62",
  };
  const targets = [
    { label: "Protein" as const, grams: protein, current: consumed.protein, color: "#ADDF32" },
    { label: "Carbs" as const, grams: carbs, current: consumed.carbs, color: "#F2B414" },
    { label: "Fat" as const, grams: fat, current: consumed.fats, color: "#91C8CE" },
  ];

  return <View style={{ borderRadius: 22, overflow: "hidden", padding: 18, gap: 10, borderWidth: 1,
    borderColor: theme.colors.panelBorder, backgroundColor: palette.background, opacity: disabled ? 0.55 : 1 }}>
    {!theme.isDark ? <Image accessible={false} pointerEvents="none" source={require("../../assets/brand/train-panel-light.svg")} contentFit="fill" style={StyleSheet.absoluteFill} /> : null}
    <Image accessible={false} pointerEvents="none" source={require("../../assets/brand/macro-plan-salmon.jpg")} contentFit="cover" contentPosition="right top" style={{ position: "absolute", top: 0, right: 0, left: 0, height: 200, opacity: 0.9 }} />
    <View pointerEvents="none" style={{ position: "absolute", top: 0, right: 0, left: 0, height: 200, backgroundColor: "rgba(5,12,5,0.36)" }} />
    <View style={{ gap: 4, minHeight: 95, justifyContent: "center" }}>
      <AppText size={23} weight="extrabold" color="#FFFFFF">Macro plan</AppText>
      <AppText size={12} color="#D0D7CD">Fuel your training. Hit your goals.</AppText>
    </View>
    <View style={{  flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.calorieSurface }}>
      <View style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "rgba(174,230,35,0.16)" }}><Icon source={icons.flame} size={24} tint={palette.accent} /></View>
      <View style={{ flex: 1 }}><AppText size={30} weight="black" color={palette.text}>{calories.toLocaleString()}</AppText><AppText size={11} color={palette.muted}>calories / day</AppText></View>
      <View style={{ flex: 1, paddingLeft: 12, borderLeftWidth: 1, borderColor: palette.divider, gap: 4 }}>
        <AppText size={10} color={palette.muted}>{manual ? "Your own targets" : "Based on your goal"}</AppText>
        <AppText size={13} weight="bold" color={palette.accent}>{manual ? "Custom goals" : goal === "lose" ? "Weight loss" : goal === "gain" ? "Weight gain" : "Maintenance"}</AppText>
      </View>
    </View>
    <View style={{ padding: 12, gap: 10, borderRadius: 16, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface }}>
      <AppText size={14} weight="bold" color={palette.text}>Daily calories</AppText>
      <AppText size={27} weight="black" color={palette.text}>{Math.round(consumed.calories).toLocaleString()}<AppText size={13} color={palette.muted}> / {calories.toLocaleString()} cal</AppText></AppText>
      <View accessibilityRole="progressbar" accessibilityLabel="Daily calorie progress" aria-valuemin={0} aria-valuemax={calories} aria-valuenow={Math.min(Math.round(consumed.calories), calories)} accessibilityValue={{ min: 0, max: calories, now: Math.min(Math.round(consumed.calories), calories), text: `${Math.round(consumed.calories)} of ${calories} calories consumed` }} style={{ height: 11, borderRadius: 6, overflow: "hidden", backgroundColor: palette.track }}>
        <View style={{ height: "100%", borderRadius: 6, width: `${Math.min(100, consumed.calories / Math.max(1, calories) * 100)}%`, backgroundColor: theme.colors.primary }} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <AppText size={11} weight="bold" color={palette.editText}>{Math.abs(Math.round(calories - consumed.calories)).toLocaleString()} {consumed.calories > calories ? "cal over target" : "cal remaining"}</AppText>
        <AppText size={11} color={palette.muted}>{Math.round(consumed.calories / Math.max(1, calories) * 100)}% of target</AppText>
      </View>
    </View>
    <>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 3 }}>
        <AppText size={17} weight="extrabold" color={palette.text}>{progressLabel}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="Edit nutrition goals" disabled={disabled} onPress={event => { event.stopPropagation(); onEdit(); }} style={{ minHeight: 40, paddingHorizontal: 12, justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: palette.editBorder, backgroundColor: palette.editSurface }}><AppText size={12} weight="bold" color={palette.editText}>Edit goals</AppText></Pressable>
      </View>
      {targets.map(target => <View key={target.label} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderRadius: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border }}>
        <View style={{ width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: target.color + "18" }}>
          <Image accessible={false} source={{ uri: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${macroPaths[target.label]}" fill="${target.color}" stroke="${target.color}" stroke-width="1.3" stroke-linejoin="round"/></svg>`)}` }} style={{ width: 28, height: 28 }} />
        </View>
        <View style={{ width: 88, gap: 2 }}><AppText size={12} weight="semibold" color={palette.text}>{target.label}</AppText><AppText size={17} weight="bold" color={palette.text}>{Math.round(target.current * 10) / 10}<AppText size={11} color={palette.muted}> / {target.grams} g</AppText></AppText></View>
        <View accessibilityLabel={`${target.label}: ${target.current} of ${target.grams} grams, ${Math.round(target.current / Math.max(1, target.grams) * 100)} percent of daily target`} style={{ flex: 1, height: 9, borderRadius: 5, overflow: "hidden", backgroundColor: palette.track }}>
          <View style={{ height: "100%", width: `${Math.min(100, target.current / Math.max(1, target.grams) * 100)}%`, borderRadius: 5, backgroundColor: target.color }} />
        </View>
        <AppText size={12} weight="bold" color={palette.muted} style={{ width: 38, textAlign: "right" }}>{Math.round(target.current / Math.max(1, target.grams) * 100)}%</AppText>
        <AppText size={17} color={palette.muted}>›</AppText>
      </View>)}
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center", padding: 12, borderRadius: 16, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface }}>
        <Icon source={icons.bars} size={25} tint={palette.accent} />
        <View style={{ flex: 1, gap: 3 }}><AppText size={13} weight="bold" color={palette.text}>Balanced nutrition</AppText><AppText size={11} color={palette.muted}>Daily targets tailored to your goals.</AppText></View>
      </View>
    </>
    <Pressable accessibilityRole="button" accessibilityLabel={hasPlan ? "Open your macro plan" : "Build a macro plan"} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={{ borderRadius: 14, backgroundColor: theme.colors.primary, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <AppText size={13} weight="extrabold" color={theme.colors.primaryText}>{hasPlan ? "View & adjust plan" : "Create my macro plan"}</AppText>
      <AppText size={20} weight="bold" color={theme.colors.primaryText}>→</AppText>
    </Pressable>
  </View>;
}
