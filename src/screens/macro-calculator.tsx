import { useMemo, useState, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import { AppText, Card, PrimaryButton, ScrollBody, SectionLabel } from "@/components/ui";
import { RepeatStepButton } from "@/components/repeat-step-button";
import { SaveFeedback } from "@/components/save-feedback";
import {
  calculateMacroPlan,
  calibrationAdvice,
  formatWeeklyChange,
  type CardioLength,
  type GoalKind,
  type NutritionProfile,
  type StepBand,
} from "@/lib/macro-calculator";
import { useAppTheme } from "@/theme";

type Draft = {
  sex: "Male" | "Female";
  age: number;
  heightFt: number;
  heightInches: number;
  weightLb: number;
  goal: GoalKind | null;
  useTargetWeight: boolean;
  targetWeightLb: number;
  targetWeeks: number | null;
  steps: StepBand | null;
  strengthDays: number | null;
  cardioSessions: number | null;
  cardioLength: CardioLength | null;
  bodyFat: number | null;
  bodyFatChosen: boolean;
};

const stepChoices: { id: StepBand; label: string; detail: string }[] = [
  { id: "lt4", label: "Under 4,000", detail: "Mostly sitting" },
  { id: "4to7", label: "4,000–6,999", detail: "Some walking" },
  { id: "7to10", label: "7,000–9,999", detail: "On your feet" },
  { id: "10to13", label: "10,000–12,999", detail: "Very active days" },
  { id: "13plus", label: "13,000+", detail: "A lot of walking" },
];

const cardioChoices: { id: number; label: string }[] = [
  { id: 0, label: "0" },
  { id: 1, label: "1" },
  { id: 2, label: "2" },
  { id: 3, label: "3" },
  { id: 4, label: "4" },
  { id: 6, label: "5+" },
];

const lengthChoices: { id: CardioLength; label: string }[] = [
  { id: "under20", label: "Under 20 min" },
  { id: "20to30", label: "20–30 min" },
  { id: "30to45", label: "30–45 min" },
  { id: "45plus", label: "45+ min" },
];

const fatChoices: { id: number | null; label: string }[] = [
  { id: null, label: "Skip" },
  { id: 12, label: "Under 15%" },
  { id: 17.5, label: "15–20%" },
  { id: 22.5, label: "20–25%" },
  { id: 27.5, label: "25–30%" },
  { id: 33, label: "30%+" },
];

function draftFromProfile(profile: NutritionProfile | null): Draft {
  const height = profile?.heightIn ?? 69;
  return {
    sex: profile?.sex ?? "Male",
    age: profile?.age ?? 28,
    heightFt: Math.floor(height / 12),
    heightInches: height % 12,
    weightLb: Math.round(profile?.weightLb ?? 170),
    goal: profile?.goal ?? null,
    useTargetWeight: profile?.targetWeightLb != null,
    targetWeightLb: Math.round(profile?.targetWeightLb ?? (profile?.weightLb ?? 170)),
    targetWeeks: profile?.targetWeeks ?? null,
    steps: profile?.steps ?? null,
    strengthDays: profile?.strengthDays ?? null,
    cardioSessions: profile?.cardioSessions ?? null,
    cardioLength: profile?.cardioLength ?? null,
    bodyFat: profile?.bodyFat ?? null,
    bodyFatChosen: true,
  };
}

function profileFromDraft(draft: Draft, previous: NutritionProfile | null, keepAdjustment: boolean): NutritionProfile | null {
  if (!draft.goal || !draft.steps || draft.strengthDays == null || draft.cardioSessions == null) return null;
  if (draft.cardioSessions > 0 && !draft.cardioLength) return null;
  const heightIn = draft.heightFt * 12 + draft.heightInches;
  const base: NutritionProfile = {
    sex: draft.sex,
    age: draft.age,
    weightLb: draft.weightLb,
    heightIn,
    goal: draft.goal,
    targetWeightLb: draft.goal !== "maintain" && draft.useTargetWeight ? draft.targetWeightLb : null,
    targetWeeks: draft.goal !== "maintain" ? draft.targetWeeks : null,
    steps: draft.steps,
    strengthDays: draft.strengthDays,
    cardioSessions: draft.cardioSessions,
    cardioLength: draft.cardioSessions > 0 ? draft.cardioLength : null,
    bodyFat: draft.bodyFat,
    weighIns: previous?.weighIns ?? [],
    plannedWeeklyLb: 0,
    calorieAdjustment: keepAdjustment ? (previous?.calorieAdjustment ?? 0) : 0,
    calibratedThrough: keepAdjustment ? (previous?.calibratedThrough ?? null) : null,
  };
  const plan = calculateMacroPlan({ ...base, calorieAdjustment: 0 });
  return { ...base, plannedWeeklyLb: plan.weeklyLb };
}

export function MacroCalculator({
  profile,
  onApply,
  onClose,
  saving = false,
  disabled = false,
  error,
}: {
  profile: NutritionProfile | null;
  onApply: (profile: NutritionProfile) => Promise<boolean>;
  onClose: () => void;
  saving?: boolean;
  disabled?: boolean;
  error?: string | null;
}) {
  const theme = useAppTheme();
  const frame = useWindowDimensions();
  const framed = Platform.OS === "web" && frame.width > 450;
  const scrollMax = framed ? Math.min(874, frame.height - 32) - 230 : Math.round(frame.height * 0.62);
  const [draft, setDraft] = useState<Draft>(() => draftFromProfile(profile));
  const [step, setStep] = useState(() => (profile ? 99 : 0));
  const [edited, setEdited] = useState(false);

  const steps = useMemo(() => {
    const pages = ["body", "goal", "steps", "training"];
    if ((draft.cardioSessions ?? 0) > 0) pages.push("cardio");
    pages.push("fat", "results");
    return pages;
  }, [draft.cardioSessions]);

  const page = steps[Math.min(step, steps.length - 1)];
  const built = profileFromDraft(draft, profile, !edited && profile != null);
  const plan = built ? calculateMacroPlan(edited || !profile ? { ...built, calorieAdjustment: 0 } : built) : null;
  const advice = built && !edited ? calibrationAdvice(built) : null;

  function patch(next: Partial<Draft>) {
    setEdited(true);
    setDraft((current) => ({ ...current, ...next }));
  }

  function canContinue() {
    if (page === "goal") return draft.goal != null;
    if (page === "steps") return draft.steps != null;
    if (page === "training") return draft.strengthDays != null && draft.cardioSessions != null;
    if (page === "cardio") return draft.cardioLength != null;
    if (page === "fat") return draft.bodyFatChosen;
    return true;
  }

  function next() {
    if (!canContinue()) return;
    const index = Math.min(step, steps.length - 1);
    setStep(Math.min(index + 1, steps.length - 1));
  }

  async function apply() {
    if (!built || saving || disabled) return;
    await onApply(built);
  }

  const title =
    page === "body"
      ? "About you"
      : page === "goal"
        ? "Your goal"
        : page === "steps"
          ? "Daily steps"
          : page === "training"
            ? "Training"
            : page === "cardio"
              ? "Cardio length"
              : page === "fat"
                ? "Body fat"
                : "Your daily target";

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 2 }}>
          <SectionLabel>
            {page === "results" ? "Results" : `${step + 1} of ${steps.length}`}
          </SectionLabel>
          <AppText size={23} weight="black">
            {title}
          </AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close goal calculator" hitSlop={8} onPress={onClose}>
          <AppText size={25} muted>
            ×
          </AppText>
        </Pressable>
      </View>
      <ScrollBody style={{ maxHeight: scrollMax }} contentContainerStyle={styles.body}>
        {page === "body" ? (
          <View style={styles.stack}>
            <AppText size={13} muted>
              A few basics. This is a starting estimate, not medical advice.
            </AppText>
            <ChoiceRow>
              {(["Male", "Female"] as const).map((option) => (
                <Choice key={option} label={option} selected={draft.sex === option} onPress={() => patch({ sex: option })} wide />
              ))}
            </ChoiceRow>
            <Stepper label="Age" value={draft.age} min={18} max={80} onChange={(age) => patch({ age })} />
            <HeightStepper
              inches={draft.heightFt * 12 + draft.heightInches}
              onChange={(total) => patch({ heightFt: Math.floor(total / 12), heightInches: total % 12 })}
            />
            <Stepper label="Current weight (lb)" value={draft.weightLb} min={90} max={400} onChange={(weightLb) => patch({ weightLb })} />
          </View>
        ) : null}

        {page === "goal" ? (
          <View style={styles.stack}>
            <AppText size={13} muted>
              Pick the direction. The calorie target stays modest either way.
            </AppText>
            <Choice
              label="Lose fat"
              detail="About 0.5–0.75% of body weight each week"
              selected={draft.goal === "lose"}
              onPress={() =>
                patch({
                  goal: "lose",
                  targetWeightLb: Math.max(90, draft.weightLb - 10),
                })
              }
            />
            <Choice label="Maintain" detail="Eat around your estimated maintenance" selected={draft.goal === "maintain"} onPress={() => patch({ goal: "maintain", useTargetWeight: false })} />
            <Choice
              label="Gain muscle"
              detail="A small surplus, not an aggressive bulk"
              selected={draft.goal === "gain"}
              onPress={() => patch({ goal: "gain", targetWeightLb: draft.weightLb + 8 })}
            />
            {draft.goal && draft.goal !== "maintain" ? (
              <View style={styles.stack}>
                <AppText size={13} weight="bold">
                  Target weight
                </AppText>
                <Choice
                  label="No target weight"
                  selected={!draft.useTargetWeight}
                  onPress={() => patch({ useTargetWeight: false })}
                />
                <Choice
                  label="Set a target"
                  selected={draft.useTargetWeight}
                  onPress={() => patch({ useTargetWeight: true })}
                />
                {draft.useTargetWeight ? (
                  <Stepper
                    label="Target weight (lb)"
                    value={draft.targetWeightLb}
                    min={90}
                    max={400}
                    onChange={(targetWeightLb) => patch({ targetWeightLb, useTargetWeight: true })}
                  />
                ) : null}
                <AppText size={13} weight="bold">
                  Target date
                </AppText>
                <View style={styles.chips}>
                  {[
                    { weeks: null, label: "No date" },
                    { weeks: 8, label: "8 weeks" },
                    { weeks: 12, label: "12 weeks" },
                    { weeks: 16, label: "16 weeks" },
                    { weeks: 24, label: "24 weeks" },
                  ].map((option) => (
                    <Choice
                      key={option.label}
                      label={option.label}
                      selected={draft.targetWeeks === option.weeks}
                      onPress={() => patch({ targetWeeks: option.weeks })}
                      compact
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {page === "steps" ? (
          <View style={styles.stack}>
            <AppText size={13} muted>
              Average steps on a normal day. This separates a walker who also lifts from someone who only lifts.
            </AppText>
            {stepChoices.map((option) => (
              <Choice
                key={option.id}
                label={option.label}
                detail={option.detail}
                selected={draft.steps === option.id}
                onPress={() => patch({ steps: option.id })}
              />
            ))}
          </View>
        ) : null}

        {page === "training" ? (
          <View style={styles.stack}>
            <AppText size={13} weight="bold">
              Strength training days
            </AppText>
            <View style={styles.chips}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((day) => (
                <Choice
                  key={day}
                  label={`${day}`}
                  selected={draft.strengthDays === day}
                  onPress={() => patch({ strengthDays: day })}
                  compact
                />
              ))}
            </View>
            <AppText size={13} weight="bold">
              Cardio sessions a week
            </AppText>
            <View style={styles.chips}>
              {cardioChoices.map((option) => (
                <Choice
                  key={option.label}
                  label={option.label}
                  selected={draft.cardioSessions === option.id}
                  onPress={() => patch({ cardioSessions: option.id, cardioLength: option.id === 0 ? null : draft.cardioLength })}
                  compact
                />
              ))}
            </View>
          </View>
        ) : null}

        {page === "cardio" ? (
          <View style={styles.stack}>
            <AppText size={13} muted>
              How long is a typical cardio session?
            </AppText>
            {lengthChoices.map((option) => (
              <Choice
                key={option.id}
                label={option.label}
                selected={draft.cardioLength === option.id}
                onPress={() => patch({ cardioLength: option.id })}
              />
            ))}
          </View>
        ) : null}

        {page === "fat" ? (
          <View style={styles.stack}>
            <AppText size={13} muted>
              Optional. A rough estimate is enough. Skip this if you are not sure.
            </AppText>
            {fatChoices.map((option) => (
              <Choice
                key={option.label}
                label={option.label}
                selected={draft.bodyFatChosen && draft.bodyFat === option.id}
                onPress={() => patch({ bodyFat: option.id, bodyFatChosen: true })}
              />
            ))}
          </View>
        ) : null}

        {page === "results" && plan ? (
          <View style={styles.stack}>
            <Card padding={16} radius={20} gap={12} style={{ backgroundColor: theme.colors.primaryDeep }}>
              <SectionLabel>Your daily target</SectionLabel>
              <View>
                <AppText size={13} muted>
                  Calories
                </AppText>
                <AppText size={36} weight="black">
                  {plan.calories.toLocaleString()}
                </AppText>
              </View>
              <View style={styles.macroRow}>
                <MacroStat label="Protein" value={`${plan.protein} g`} />
                <MacroStat label="Carbs" value={`${plan.carbs} g`} />
                <MacroStat label="Fat" value={`${plan.fat} g`} />
              </View>
            </Card>
            <Card padding={16} radius={18} gap={8}>
              <ResultLine label="Estimated maintenance" value={`${plan.maintenance.toLocaleString()} cal`} />
              <ResultLine label="Expected weekly change" value={formatWeeklyChange(plan.weeklyLb)} />
            </Card>
            <AppText size={13} muted style={{ lineHeight: 20 }}>
              These are starting estimates. Your actual calorie needs may differ.
            </AppText>
            {advice ? (
              <Card padding={14} radius={16} gap={6}>
                <AppText size={12} weight="bold" primary upper>
                  Weight trend
                </AppText>
                <AppText size={13} style={{ lineHeight: 20 }}>
                  {advice.message}
                </AppText>
              </Card>
            ) : (
              <AppText size={13} muted style={{ lineHeight: 20 }}>
                Log your weight on Fuel for 2–3 weeks. The trend, not a single weigh-in, can nudge these calories.
              </AppText>
            )}
          </View>
        ) : null}
      </ScrollBody>
      {error ? <AppText size={13}>{error}</AppText> : null}
      <SaveFeedback area="plan" onRetried={onClose} />
      <View style={styles.footer}>
        {page === "results" && profile ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Edit questionnaire" onPress={() => setStep(0)} style={styles.back}>
            <AppText size={14} weight="extrabold" primary>
              Edit
            </AppText>
          </Pressable>
        ) : page === "body" && profile ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to results"
            onPress={() => setStep(steps.length - 1)}
            style={styles.back}
          >
            <AppText size={14} weight="extrabold" primary>
              Results
            </AppText>
          </Pressable>
        ) : step > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => setStep(Math.max(0, Math.min(step, steps.length - 1) - 1))} style={styles.back}>
            <AppText size={14} weight="extrabold" primary>
              Back
            </AppText>
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
        {page === "results" ? (
          <PrimaryButton height={48} style={{ flex: 1 }} onPress={apply} disabled={!plan || saving || disabled}>
            {saving ? "Saving…" : "Use these goals"}
          </PrimaryButton>
        ) : (
          <PrimaryButton height={48} style={{ flex: 1, opacity: canContinue() ? 1 : 0.45 }} onPress={next} disabled={!canContinue()}>
            Continue
          </PrimaryButton>
        )}
      </View>
    </View>
  );
}

function MacroStat({ label, value }: { label: string; value: string }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.macroStat, { backgroundColor: theme.colors.surface }]}>
      <AppText size={11} weight="bold" muted upper>
        {label}
      </AppText>
      <AppText size={16} weight="extrabold">
        {value}
      </AppText>
    </View>
  );
}

function ResultLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.resultLine}>
      <AppText size={13} muted style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText size={14} weight="extrabold" style={{ flexShrink: 0 }}>
        {value}
      </AppText>
    </View>
  );
}

function ChoiceRow({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

function Choice({
  label,
  detail,
  selected,
  onPress,
  wide,
  compact,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
  wide?: boolean;
  compact?: boolean;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.choice,
        compact && styles.choiceCompact,
        wide && { flex: 1 },
        {
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          backgroundColor: selected ? theme.colors.primaryTint : theme.colors.surfaceRaised,
        },
      ]}
    >
      <AppText size={compact ? 14 : 15} weight="extrabold" primary={selected}>
        {label}
      </AppText>
      {detail ? (
        <AppText size={12} muted>
          {detail}
        </AppText>
      ) : null}
    </Pressable>
  );
}

function HeightStepper({ inches, onChange }: { inches: number; onChange: (inches: number) => void }) {
  const theme = useAppTheme();
  const feet = Math.floor(inches / 12);
  const remainder = inches % 12;
  return (
    <View style={[styles.stepper, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
      <AppText size={12} weight="bold" muted>
        Height
      </AppText>
      <View style={styles.stepperRow}>
        <RepeatStepButton
          label="Decrease height" value={inches} min={54} max={84} direction={-1} onChange={onChange}
          style={[styles.stepButton, { backgroundColor: theme.colors.surfaceRaised }]}
        >
          <AppText size={22} weight="bold">
            −
          </AppText>
        </RepeatStepButton>
        <AppText size={28} weight="black">
          {feet}′ {remainder}″
        </AppText>
        <RepeatStepButton
          label="Increase height" value={inches} min={54} max={84} direction={1} onChange={onChange}
          style={[styles.stepButton, { backgroundColor: theme.colors.surfaceRaised }]}
        >
          <AppText size={22} weight="bold">
            +
          </AppText>
        </RepeatStepButton>
      </View>
    </View>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const theme = useAppTheme();
  return (
    <View style={[styles.stepper, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
      <AppText size={12} weight="bold" muted>
        {label}
      </AppText>
      <View style={styles.stepperRow}>
        <RepeatStepButton
          label={`Decrease ${label}`} value={value} min={min} max={max} direction={-1} onChange={onChange}
          style={[styles.stepButton, { backgroundColor: theme.colors.surfaceRaised }]}
        >
          <AppText size={22} weight="bold">
            −
          </AppText>
        </RepeatStepButton>
        <AppText size={28} weight="black">
          {value}
        </AppText>
        <RepeatStepButton
          label={`Increase ${label}`} value={value} min={min} max={max} direction={1} onChange={onChange}
          style={[styles.stepButton, { backgroundColor: theme.colors.surfaceRaised }]}
        >
          <AppText size={22} weight="bold">
            +
          </AppText>
        </RepeatStepButton>
      </View>
    </View>
  );
}

export function WeightTrendCard({
  profile,
  onLog,
  onApplyAdjustment,
  disabled = false,
  error,
}: {
  profile: NutritionProfile;
  onLog: (weightLb: number) => Promise<boolean>;
  onApplyAdjustment: (deltaCalories: number) => Promise<boolean>;
  disabled?: boolean;
  error?: string | null;
}) {
  const latest = [...profile.weighIns].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const [weight, setWeight] = useState(() => Math.round(latest?.weightLb ?? profile.weightLb));
  const [editing, setEditing] = useState(latest == null);
  const [saving, setSaving] = useState(false);
  const advice = calibrationAdvice(profile);

  function openEditor() {
    setWeight(Math.round(latest?.weightLb ?? profile.weightLb));
    setEditing(true);
  }

  return (
    <Card padding={16} radius={18} gap={12}>
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1, gap: 3 }}>
          <SectionLabel>Current weight check in</SectionLabel>
          <AppText size={13} muted>
            {latest ? `Logged ${latest.weightLb} lb` : "Add your current weight to update the target."}
          </AppText>
        </View>
        {latest && !editing ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Edit weight" hitSlop={8} onPress={openEditor}>
            <AppText size={14} weight="extrabold" primary>
              Edit
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {editing ? (
        <View style={{ gap: 10 }}>
          <Stepper label="Current weight (lb)" value={weight} min={90} max={400} onChange={setWeight} />
          <PrimaryButton
            height={44}
            disabled={disabled || saving}
            onPress={async () => {
              if (saving || disabled) return;
              setSaving(true);
              const saved = await onLog(weight);
              setSaving(false);
              if (saved) setEditing(false);
            }}
          >
            {saving ? "Saving…" : "Log weight"}
          </PrimaryButton>
          {latest ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel weight edit" onPress={() => setEditing(false)}>
              <AppText size={13} weight="bold" muted style={{ textAlign: "center" }}>
                Cancel
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {advice ? (
        <View style={{ gap: 8 }}>
          <AppText size={13} style={{ lineHeight: 20 }}>
            {advice.message}
          </AppText>
          {advice.deltaCalories !== 0 ? (
            <PrimaryButton height={44} disabled={disabled || saving} onPress={async () => {
              if (saving || disabled) return;
              setSaving(true);
              await onApplyAdjustment(advice.deltaCalories);
              setSaving(false);
            }}>
              Update calories
            </PrimaryButton>
          ) : null}
        </View>
      ) : null}
      {error ? <AppText size={13}>{error}</AppText> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  body: { gap: 12, paddingBottom: 8 },
  stack: { gap: 10 },
  row: { flexDirection: "row", gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { borderRadius: 14, borderWidth: 1, gap: 2, paddingHorizontal: 14, paddingVertical: 12 },
  choiceCompact: { alignItems: "center", minWidth: 64, paddingHorizontal: 12, paddingVertical: 10 },
  stepper: { borderRadius: 16, borderWidth: 1, flex: 1, gap: 8, paddingHorizontal: 12, paddingVertical: 12 },
  stepperRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  stepButton: { alignItems: "center", borderRadius: 12, height: 40, justifyContent: "center", width: 40 },
  footer: { alignItems: "center", flexDirection: "row", gap: 12, paddingTop: 4 },
  back: { alignItems: "center", minWidth: 56 },
  macroRow: { flexDirection: "row", gap: 8 },
  macroStat: { borderRadius: 12, flex: 1, gap: 2, padding: 10 },
  resultLine: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 12 },
  sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 12 },
});
