import { Image } from "expo-image";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui";
import { useAppTheme } from "@/theme";

type MacroTarget = {
  label: string;
  current: number;
  target: number;
  color: string;
};

export function MacroPlanCard({ calories, protein, carbs, fat, consumed, goal, manual, progressLabel, hasPlan, disabled, onEdit, onPress }: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  consumed: { calories: number; protein: number; carbs: number; fats: number };
  manual: boolean;
  progressLabel: string;
  onEdit: () => void;
  goal?: "lose" | "maintain" | "gain";
  hasPlan: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  const calorieProgress = Math.min(1, consumed.calories / Math.max(1, calories));
  const calorieDelta = Math.abs(Math.round(calories - consumed.calories));
  const goalLabel = manual ? "Custom goals" : goal === "lose" ? "Weight loss" : goal === "gain" ? "Weight gain" : "Maintenance";
  const targets: MacroTarget[] = [
    { label: "Protein", current: consumed.protein, target: protein, color: theme.colors.protein },
    { label: "Carbs", current: consumed.carbs, target: carbs, color: theme.colors.carbs },
    { label: "Fat", current: consumed.fats, target: fat, color: theme.colors.fat },
  ];

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.panelBorder, opacity: disabled ? 0.55 : 1, boxShadow: theme.effects.cardShadow }]}>
      <View style={styles.hero}>
        <Image
          accessible={false}
          pointerEvents="none"
          source={require("../../assets/brand/macro-plan-salmon.jpg")}
          contentFit="cover"
          contentPosition="center"
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.heroScrim]} />
        <View style={styles.heroContent}>
          <View style={styles.goalBadge}><AppText size={10} weight="bold" color="#FFFFFF" upper>{goalLabel}</AppText></View>
          <AppText size={27} weight="extrabold" color="#FFFFFF">Macro plan</AppText>
          <AppText size={12} color="#E5E9E1">A simple daily target built around your training.</AppText>
        </View>
      </View>

      <View style={styles.targetRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText size={11} weight="bold" muted upper>Daily target</AppText>
          <AppText size={34} weight="black" style={{ fontVariant: ["tabular-nums"] }}>{calories.toLocaleString()}</AppText>
          <AppText size={11} muted>calories per day</AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit nutrition goals"
          disabled={disabled}
          onPress={onEdit}
          style={({ pressed }) => [styles.editButton, { backgroundColor: theme.colors.actionSurface, borderColor: theme.colors.panelBorder, opacity: pressed ? 0.68 : 1 }]}
        >
          <AppText size={12} weight="bold" primary>Edit goals</AppText>
        </Pressable>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

      <View style={{ gap: 10 }}>
        <View style={styles.sectionHeader}>
          <View style={{ gap: 2 }}><AppText size={15} weight="extrabold">{progressLabel}</AppText><AppText size={11} muted>{Math.round(consumed.calories).toLocaleString()} of {calories.toLocaleString()} calories</AppText></View>
          <AppText size={13} weight="bold" color={consumed.calories > calories ? theme.colors.warning : theme.colors.accent}>{calorieDelta.toLocaleString()} {consumed.calories > calories ? "over" : "left"}</AppText>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Daily calorie progress"
          aria-valuemin={0}
          aria-valuemax={calories}
          aria-valuenow={Math.min(Math.round(consumed.calories), calories)}
          accessibilityValue={{ min: 0, max: calories, now: Math.min(Math.round(consumed.calories), calories), text: `${Math.round(consumed.calories)} of ${calories} calories consumed` }}
          style={[styles.calorieTrack, { backgroundColor: theme.colors.progressTrack }]}
        >
          <View style={[styles.calorieFill, { width: `${calorieProgress * 100}%`, backgroundColor: consumed.calories > calories ? theme.colors.warning : theme.colors.primary }]} />
        </View>
      </View>

      <View style={{ gap: 14 }}>
        {targets.map((target) => {
          const progress = Math.min(1, target.current / Math.max(1, target.target));
          return (
            <View key={target.label} accessibilityLabel={`${target.label}: ${target.current} of ${target.target} grams, ${Math.round(progress * 100)} percent of daily target`} style={{ gap: 7 }}>
              <View style={styles.macroMeta}>
                <View style={[styles.macroDot, { backgroundColor: target.color }]} />
                <AppText size={13} weight="semibold" style={{ flex: 1 }}>{target.label}</AppText>
                <AppText size={13} weight="bold" style={{ fontVariant: ["tabular-nums"] }}>{Math.round(target.current * 10) / 10}<AppText size={11} muted> / {target.target}g</AppText></AppText>
              </View>
              <View style={[styles.macroTrack, { backgroundColor: theme.colors.progressTrack }]}><View style={[styles.macroFill, { width: `${progress * 100}%`, backgroundColor: target.color }]} /></View>
            </View>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={hasPlan ? "Open your macro plan" : "Build a macro plan"}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.primaryAction, { backgroundColor: theme.colors.primary, opacity: pressed ? 0.78 : 1 }]}
      >
        <AppText size={14} weight="extrabold" color={theme.colors.primaryText}>{hasPlan ? "View & adjust plan" : "Create my macro plan"}</AppText>
        <AppText size={20} weight="bold" color={theme.colors.primaryText}>→</AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, borderCurve: "continuous", borderWidth: 1, gap: 18, padding: 14 },
  hero: { minHeight: 154, borderRadius: 16, borderCurve: "continuous", overflow: "hidden", justifyContent: "flex-end" },
  heroScrim: { backgroundColor: "rgba(2, 8, 4, 0.52)" },
  heroContent: { gap: 4, padding: 16 },
  goalBadge: { alignSelf: "flex-start", minHeight: 26, justifyContent: "center", paddingHorizontal: 9, borderRadius: 13, backgroundColor: "rgba(0, 0, 0, 0.48)" },
  targetRow: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 4 },
  editButton: { minHeight: 42, justifyContent: "center", paddingHorizontal: 13, borderRadius: 12, borderCurve: "continuous", borderWidth: 1 },
  divider: { height: StyleSheet.hairlineWidth, width: "100%" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  calorieTrack: { height: 9, borderRadius: 5, overflow: "hidden" },
  calorieFill: { height: "100%", borderRadius: 5 },
  macroMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  macroDot: { width: 7, height: 7, borderRadius: 4 },
  macroTrack: { height: 7, borderRadius: 4, overflow: "hidden" },
  macroFill: { height: "100%", borderRadius: 4 },
  primaryAction: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, borderRadius: 15, borderCurve: "continuous" },
});
