import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, Card, Field, Input, PrimaryButton, ScrollBody, SecondaryButton } from "./ui";
import { exerciseOptions, loadExerciseCatalog } from "@/lib/exercise-catalog";
import type { ProfileLift } from "@/lib/profile-lifts";
import { useAppTheme } from "@/theme";

export function ProfileLiftsEditor({ lifts, disabled, onChange }: { lifts: ProfileLift[]; disabled: boolean; onChange: (lifts: ProfileLift[]) => void }) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [exercise, setExercise] = useState("");
  const [custom, setCustom] = useState("");
  const [weight, setWeight] = useState("");
  const [unit, setUnit] = useState<"lb" | "kg">("lb");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let active = true;
    void loadExerciseCatalog(AsyncStorage).then(catalog => { if (active) setNames(catalog.names); });
    return () => { active = false; };
  }, [open]);
  function start(index: number | null) {
    const lift = index === null ? null : lifts[index];
    setEditing(index); setExercise(lift?.name ?? ""); setCustom(""); setSearch(""); setWeight(lift ? String(lift.weight) : ""); setUnit(lift?.unit ?? "lb"); setError(""); setOpen(true);
  }
  function add() {
    const name = (exercise === "Other" ? custom : exercise).trim();
    const amount = Number(weight);
    if (!name || name.length > 100 || !weight.trim() || !Number.isFinite(amount) || amount < 0 || amount > 10000) { setError("Choose a lift and enter its weight. Use 0 for bodyweight."); return; }
    if (lifts.some((lift, index) => index !== editing && lift.name.toLowerCase() === name.toLowerCase())) { setError("This lift is already on your profile."); return; }
    const lift: ProfileLift = { name, weight: amount, unit };
    onChange(editing === null ? [...lifts, lift] : lifts.map((row, index) => index === editing ? lift : row));
    setOpen(false);
  }
  return <>
    <Card radius={20}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}><AppText size={16} weight="bold">Lifts</AppText><SecondaryButton height={44} fontSize={13} disabled={disabled || lifts.length >= 12} onPress={() => start(null)}>Add lift</SecondaryButton></View>
      <AppText size={12} muted>Optional. Only lifts you add appear on your profile.</AppText>
      {lifts.map((lift, index) => <View key={lift.name} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 12, borderTopWidth: 1, borderColor: theme.colors.border }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Edit profile lift ${lift.name}`} disabled={disabled} onPress={() => start(index)} style={{ flex: 1, gap: 4 }}><AppText weight="bold">{lift.name}</AppText><AppText size={12} muted>{lift.weight} {lift.unit}</AppText></Pressable>
        <SecondaryButton accessibilityLabel={`Remove profile lift ${lift.name}`} height={44} fontSize={12} disabled={disabled} onPress={() => onChange(lifts.filter((_, i) => i !== index))}>Remove</SecondaryButton>
      </View>)}
    </Card>
    <Modal transparent animationType="slide" visible={open} onRequestClose={() => setOpen(false)}>
      <KeyboardAvoidingView enabled={Platform.OS !== "web"} behavior="padding" style={{ flex: 1, justifyContent: "flex-end", alignItems: "center", backgroundColor: "rgba(0,0,0,0.65)" }}>
        <View style={{ width: "100%", maxWidth: 450, height: "88%", backgroundColor: theme.colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: Math.max(insets.bottom, 16) }}>
          <View style={{ padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><AppText size={20} weight="bold">{editing === null ? "Add profile lift" : "Edit profile lift"}</AppText><SecondaryButton height={44} onPress={() => setOpen(false)}>Cancel</SecondaryButton></View>
          <ScrollBody contentContainerStyle={{ padding: 16, gap: 14 }}>
            {exercise ? <SecondaryButton onPress={() => { setExercise(""); setSearch(""); }}>{exercise === "Other" ? "Custom exercise" : exercise} · Change</SecondaryButton> : <>
              <Input autoFocus bordered placeholder="Search exercises" value={search} onChangeText={setSearch} />
              <ScrollView style={{ maxHeight: 250 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" showsVerticalScrollIndicator={false}>
                {exerciseOptions(names, search).map(name => <Pressable key={name} accessibilityRole="button" accessibilityLabel={`Select ${name}`} onPress={() => { setExercise(name); setError(""); }} style={{ padding: 14, borderBottomWidth: 1, borderColor: theme.colors.border }}><AppText>{name === "Other" ? "Other — custom exercise" : name}</AppText></Pressable>)}
              </ScrollView>
            </>}
            {exercise === "Other" ? <Field label="Exercise name"><Input bordered placeholder="Your exercise" value={custom} onChangeText={setCustom} maxLength={100} /></Field> : null}
            <Field label={`Weight (${unit})`}><Input bordered accessibilityLabel="Profile lift weight" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="0 for bodyweight" /></Field>
            <View style={{ flexDirection: "row", gap: 10 }}>{(["lb", "kg"] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: unit === value }} onPress={() => { if (unit === value) return; if (weight.trim() && Number.isFinite(Number(weight))) setWeight(String(Math.round(Number(weight) * (value === "kg" ? 1 / 2.2046226218 : 2.2046226218) * 100) / 100)); setUnit(value); }} style={{ padding: 12, borderRadius: 10, backgroundColor: unit === value ? theme.colors.primaryTint : theme.colors.surface }}><AppText primary={unit === value}>{value}</AppText></Pressable>)}</View>
            {error ? <AppText color={theme.colors.danger}>{error}</AppText> : null}
          </ScrollBody>
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}><PrimaryButton disabled={disabled || !exercise} onPress={add}>{editing === null ? "Add to profile" : "Update lift"}</PrimaryButton></View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </>;
}
