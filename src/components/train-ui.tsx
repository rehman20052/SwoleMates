import { BRAND_LIME } from "@/theme";
import { StyleSheet, View } from "react-native";
import { Icon } from "./ui";
import { icons } from "@/assets";
import type { SessionLog } from "@/state/app-data";
import type { ComponentProps } from "react";
import { AppText, Input as BaseInput, Card as BaseCard, PrimaryButton as BasePrimary, SecondaryButton as BaseSecondary } from "./ui";
import { useAppTheme } from "@/theme";
import { SaveFeedback as BaseFeedback } from "./save-feedback";
import { useAppData } from "@/state/app-data";
import { createContext, useContext } from "react";
export const TrainPrototypeContext = createContext(false);

// Train-only surfaces; Fuel keeps its existing shared components.
export const trainTokens = { radius: 12, controlRadius: 8, touchTarget: 44, controlHeight: 48, iconSize: 20,
  type: { caption: 12, body: 14, button: 14, label: 16, heading: 24 } } as const;
export function trainTextSize(size: number = trainTokens.type.body) {
  if (size >= 10 && size <= 12) return trainTokens.type.caption;
  if (size >= 13 && size <= 15) return trainTokens.type.body;
  if (size === 16 || size === 17) return trainTokens.type.label;
  if (size === 23 || size === 24) return trainTokens.type.heading;
  return size;
}
export function useTrainPalette() {
  const { isDark } = useAppTheme();
  const prototype = useContext(TrainPrototypeContext);
  return prototype
    ? { surface: "#111314", background: "#080a0b", text: "#FFFFFF", muted: "#859099", field: "#1b1e20", border: "#2a2e30", separator: "#2a2e30", track: "#1b1e20", action: "#E2E5E7", actionText: "#171B1E", complete: "#212b13" }
    : isDark ? { surface: "#111114", background: "#000000", text: "#FFFFFF", muted: "#A0A6AB", field: "#18181b", border: "#1c1c1e", separator: "#1c1c1e", track: "#18181b", action: "#E2E5E7", actionText: "#171B1E", complete: "#17251B" }
    : { surface: "#FFFFFF", background: "#F5F6F7", text: "#252C31", muted: "#606A72", field: "#EBEEF0", border: "#D6DCE0", separator: "#D6DCE0", track: "#D6DCE0", action: "#252C31", actionText: "#FFFFFF", complete: "#E8EEE3" };
}
export function TrainText({ weight, muted, color, size, ...props }: ComponentProps<typeof AppText>) {
  const palette = useTrainPalette();
  const prototype = useContext(TrainPrototypeContext);
  return <AppText {...props} size={trainTextSize(size)} muted={muted} weight={weight} color={color ?? (props.primary ? prototype ? "#bdf40b" : undefined : muted ? palette.muted : palette.text)} />;
}
export function TrainInput({ style, ...props }: ComponentProps<typeof BaseInput>) {
  const palette = useTrainPalette();
  return <BaseInput {...props} style={[{ height: 48, borderRadius: 8, backgroundColor: palette.field, color: palette.text, borderColor: palette.border, fontSize: 15 }, style]} />;
}
export function TrainSection({ style, padding = 16, ...props }: ComponentProps<typeof BaseCard>) {
  const palette = useTrainPalette();
  return <BaseCard {...props} padding={padding === 0 ? 0 : padding <= 8 ? 8 : 16} radius={0} style={[{ borderWidth: 0, borderTopWidth: 1, borderColor: palette.border, backgroundColor: "transparent", boxShadow: "none" }, style]} />;
}
export function TrainPrimary({ style, height = 48, fontSize = 14, ...props }: ComponentProps<typeof BasePrimary>) {
  const palette = useTrainPalette();
  const prototype = useContext(TrainPrototypeContext);
  return <BasePrimary {...props} height={Math.max(trainTokens.controlHeight, height)} fontSize={trainTokens.type.button} style={[{ borderRadius: trainTokens.controlRadius, backgroundColor: prototype ? "#bdf40b" : BRAND_LIME, boxShadow: "none", opacity: props.disabled ? 0.45 : 1 }, style]}><TrainText size={trainTokens.type.button} weight="semibold" color="#000000">{props.children}</TrainText></BasePrimary>;
}
export function TrainSecondary({ style, height = 48, fontSize = 14, ...props }: ComponentProps<typeof BaseSecondary>) {
  const palette = useTrainPalette();
  return <BaseSecondary {...props} textColor={props.textColor ?? palette.muted} height={Math.max(trainTokens.controlHeight, height)} fontSize={trainTokens.type.button} style={[{ borderRadius: 0, borderWidth: 0, backgroundColor: "transparent", paddingHorizontal: 16, opacity: props.disabled ? 0.45 : 1 }, style]} />;
}
export function TrainLabel({ children }: ComponentProps<typeof AppText>) {
  return <TrainText size={12} weight="medium" muted>{children}</TrainText>;
}
export function TrainSaveFeedback(props: ComponentProps<typeof BaseFeedback>) {
  const { saveFeedback } = useAppData();
  return saveFeedback[props.area]?.phase === "saved" ? null : <BaseFeedback {...props} />;
}

export function TrainIconBadge() {
  const theme = useAppTheme();
  const palette = useTrainPalette();
  return <View style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}><Icon source={icons.training} size={trainTokens.iconSize} tint={theme.colors.accent} /></View>;
}
export function trainingSummary(log: SessionLog) {
  if (!log.exercises?.length) return log.notes || (log.verified ? "Verified partner session" : "Self-logged workout");
  const sets = log.exercises.reduce((sum, row) => sum + (row.setDetails?.length ?? row.sets), 0);
  return log.exercises.length + (log.exercises.length === 1 ? " exercise · " : " exercises · ") + sets + (sets === 1 ? " set" : " sets");
}
export function trainingVolume(logs: SessionLog[]) {
  const totals = { lb: 0, kg: 0 };
  for (const log of logs) for (const row of log.exercises ?? []) {
    const sets = row.setDetails ?? Array.from({ length: row.sets }, () => ({ weight: row.weight, reps: row.reps }));
    for (const set of sets) totals[row.unit] += set.weight * set.reps;
  }
  return (["lb", "kg"] as const).filter(unit => totals[unit] > 0).map(unit => Math.round(totals[unit]).toLocaleString() + " " + unit).join(" + ");
}

export function TrainSetInput({ style, ...props }: ComponentProps<typeof BaseInput>) {
  const palette = useTrainPalette();
  const theme = useAppTheme();
  return <View style={[{ height: 44, justifyContent: "center" }, style]}>
    <BaseInput {...props} hitSlop={{ top: 2, bottom: 2 }} style={[ledgerStyles.input, { borderColor: theme.isDark ? "#27272a" : palette.border, color: palette.text, fontFamily: theme.fonts.bold }]} />
  </View>;
}
export function TrainTelemetry({ children }: { children: string }) {
  return <TrainText size={10} weight="bold" color="#52525b" style={ledgerStyles.telemetry}>{children}</TrainText>;
}
export function TrainNumber({ style, ...props }: ComponentProps<typeof AppText>) {
  const prototype = useContext(TrainPrototypeContext);
  return <TrainText {...props} weight="bold" style={[ledgerStyles.number, style, prototype ? { fontWeight: "normal" } : undefined]} />;
}
const ledgerStyles = StyleSheet.create({
  input: { height: 40, backgroundColor: "transparent", borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, fontSize: 16, fontWeight: "700", textAlign: "center", fontVariant: ["tabular-nums"] },
  telemetry: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5 },
  number: { fontVariant: ["tabular-nums"], fontWeight: "700" },
});
