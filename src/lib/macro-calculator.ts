export type GoalKind = "lose" | "maintain" | "gain";
export type StepBand = "lt4" | "4to7" | "7to10" | "10to13" | "13plus";
export type CardioLength = "under20" | "20to30" | "30to45" | "45plus";

export type WeighIn = {
  date: string;
  weightLb: number;
};

export type NutritionProfile = {
  sex: "Male" | "Female";
  age: number;
  weightLb: number;
  heightIn: number;
  goal: GoalKind;
  targetWeightLb: number | null;
  targetWeeks: number | null;
  steps: StepBand;
  strengthDays: number;
  cardioSessions: number;
  cardioLength: CardioLength | null;
  bodyFat: number | null;
  weighIns: WeighIn[];
  plannedWeeklyLb: number;
  calorieAdjustment: number;
  calibratedThrough: string | null;
};

export type MacroPlan = {
  bmr: number;
  maintenance: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  weeklyLb: number;
};

const STEP_MIDPOINT: Record<StepBand, number> = {
  lt4: 3000,
  "4to7": 5500,
  "7to10": 8500,
  "10to13": 11500,
  "13plus": 14500,
};

const CARDIO_MINUTES: Record<CardioLength, number> = {
  under20: 15,
  "20to30": 25,
  "30to45": 37,
  "45plus": 55,
};

const STEP_BANDS = new Set<StepBand>(["lt4", "4to7", "7to10", "10to13", "13plus"]);
const CARDIO_LENGTHS = new Set<CardioLength>(["under20", "20to30", "30to45", "45plus"]);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, step: number) {
  return Math.round(value / step) * step;
}

export function bmrCalories(sex: "Male" | "Female", weightLb: number, heightIn: number, age: number) {
  const kg = weightLb * 0.45359237;
  const cm = heightIn * 2.54;
  const base = 10 * kg + 6.25 * cm - 5 * age;
  return sex === "Male" ? base + 5 : base - 161;
}

function exerciseCalories(profile: NutritionProfile, kg: number) {
  const strengthSession = 5 * kg * (50 / 60);
  const strength = (profile.strengthDays * strengthSession) / 7;
  const minutes = profile.cardioSessions > 0 && profile.cardioLength ? CARDIO_MINUTES[profile.cardioLength] : 0;
  const sessions = profile.cardioSessions >= 5 ? 6 : profile.cardioSessions;
  const cardio = (sessions * (minutes / 60) * 7 * kg) / 7;
  return strength + cardio;
}

/** Steps and training are added on top of BMR so a high-step day is not treated like a low-step day with the same gym schedule. */
export function maintenanceCalories(profile: NutritionProfile) {
  const kg = profile.weightLb * 0.45359237;
  const bmr = bmrCalories(profile.sex, profile.weightLb, profile.heightIn, profile.age);
  const steps = STEP_MIDPOINT[profile.steps];
  const stepCalories = Math.max(0, steps - 2000) * 0.045 * (kg / 70);
  const dailyLiving = bmr * 0.12;
  return bmr + dailyLiving + stepCalories + exerciseCalories(profile, kg);
}

function plannedWeeklyChange(profile: NutritionProfile) {
  if (profile.goal === "maintain") return 0;
  const losing = profile.goal === "lose";
  let percent = losing ? 0.00625 : 0.0025;
  if (profile.targetWeightLb && profile.targetWeeks && profile.targetWeeks > 0) {
    const delta = profile.targetWeightLb - profile.weightLb;
    const useful = losing ? delta < -0.5 : delta > 0.5;
    if (useful) {
      const rate = Math.abs(delta) / profile.targetWeeks / profile.weightLb;
      percent = losing ? clamp(rate, 0.005, 0.0075) : clamp(rate, 0.0015, 0.0035);
    }
  }
  return (losing ? -1 : 1) * profile.weightLb * percent;
}

function macrosFor(calories: number, profile: NutritionProfile) {
  let perLb = profile.strengthDays >= 1 ? 0.8 : 0.7;
  if (profile.bodyFat != null && profile.strengthDays >= 1) perLb = 1 - profile.bodyFat / 100;
  perLb = clamp(perLb, 0.7, 1);
  let protein = Math.round(profile.weightLb * perLb);
  const minProtein = Math.round(profile.weightLb * 0.7);
  let fat = clamp(Math.round(profile.weightLb * 0.3), Math.round(profile.weightLb * 0.25), Math.round(profile.weightLb * 0.4));
  const minFat = Math.max(20, Math.round(profile.weightLb * 0.25));
  const room = () => protein * 4 + fat * 9;
  while (room() > calories - 80 && fat > minFat) fat -= 1;
  while (room() > calories - 40 && protein > minProtein) protein -= 1;
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return {
    protein,
    fat,
    carbs,
    calories: protein * 4 + fat * 9 + carbs * 4,
  };
}

export function calculateMacroPlan(profile: NutritionProfile): MacroPlan {
  const bmr = bmrCalories(profile.sex, profile.weightLb, profile.heightIn, profile.age);
  const maintenance = maintenanceCalories(profile);
  const floor = Math.max(profile.sex === "Male" ? 1600 : 1400, Math.round(bmr));
  const raw = maintenance + plannedWeeklyChange(profile) * 500 + profile.calorieAdjustment;
  const target = Math.max(floor, roundTo(raw, 10));
  const macros = macrosFor(target, profile);
  return {
    bmr: Math.round(bmr),
    maintenance: roundTo(maintenance, 10),
    calories: macros.calories,
    protein: macros.protein,
    carbs: macros.carbs,
    fat: macros.fat,
    weeklyLb: ((macros.calories - maintenance) * 7) / 3500,
  };
}

function pounds(weeklyLb: number) {
  const rounded = Math.round(Math.abs(weeklyLb) * 100) / 100;
  return `${rounded}`.replace(/(\.\d)0$/, "$1");
}

export function formatWeeklyChange(weeklyLb: number) {
  if (Math.abs(weeklyLb) < 0.05) return "About the same";
  return `${pounds(weeklyLb)} lb/week ${weeklyLb < 0 ? "loss" : "gain"}`;
}

export function weighInTrend(weighIns: WeighIn[]) {
  const points = [...weighIns]
    .filter((entry) => Number.isFinite(entry.weightLb) && /^\d{4}-\d{2}-\d{2}$/.test(entry.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (points.length < 4) return null;
  const start = Date.parse(`${points[0].date}T12:00:00`);
  const xs = points.map((entry) => (Date.parse(`${entry.date}T12:00:00`) - start) / 86400000);
  const spanDays = xs[xs.length - 1];
  if (spanDays < 14) return null;
  const ys = points.map((entry) => entry.weightLb);
  const n = xs.length;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < n; index += 1) {
    numerator += (xs[index] - meanX) * (ys[index] - meanY);
    denominator += (xs[index] - meanX) ** 2;
  }
  if (denominator === 0) return null;
  return {
    weeklyLb: (numerator / denominator) * 7,
    spanDays,
    latestDate: points[n - 1].date,
  };
}

export type CalibrationAdvice = {
  deltaCalories: number;
  actualWeeklyLb: number;
  message: string;
};

function pace(weeklyLb: number) {
  if (Math.abs(weeklyLb) < 0.05) return "holding steady";
  return weeklyLb < 0 ? `losing ${pounds(weeklyLb)} lb a week` : `gaining ${pounds(weeklyLb)} lb a week`;
}

export function calibrationAdvice(profile: NutritionProfile): CalibrationAdvice | null {
  const trend = weighInTrend(profile.weighIns);
  if (!trend) return null;
  if (profile.calibratedThrough && trend.latestDate <= profile.calibratedThrough) return null;
  const gap = trend.weeklyLb - profile.plannedWeeklyLb;
  if (Math.abs(gap) < 0.2) {
    return {
      deltaCalories: 0,
      actualWeeklyLb: trend.weeklyLb,
      message: `You're ${pace(trend.weeklyLb)}, in line with this plan. No calorie change needed.`,
    };
  }
  const delta = clamp(roundTo(-gap * 500, 10), -250, 250);
  const change = Math.abs(delta);
  const next =
    delta < 0
      ? `Dropping about ${change} calories is a modest next step.`
      : `Adding about ${change} calories is a modest next step.`;
  return {
    deltaCalories: delta,
    actualWeeklyLb: trend.weeklyLb,
    message: `You're ${pace(trend.weeklyLb)}. This plan expected you to be ${pace(profile.plannedWeeklyLb)}. ${next}`,
  };
}

export function withWeighIn(profile: NutritionProfile, date: string, weightLb: number): NutritionProfile {
  const weighIns = [...profile.weighIns.filter((entry) => entry.date !== date), { date, weightLb }].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  return { ...profile, weighIns };
}

/** Logged weight becomes the current weight the calorie and macro targets are built from. */
export function withCurrentWeight(profile: NutritionProfile, date: string, weightLb: number): NutritionProfile {
  const next = { ...withWeighIn(profile, date, weightLb), weightLb };
  const baseline = calculateMacroPlan({ ...next, calorieAdjustment: 0 });
  return { ...next, plannedWeeklyLb: baseline.weeklyLb };
}

export function parseNutritionProfile(value: unknown): NutritionProfile | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<NutritionProfile>;
  if (raw.sex !== "Male" && raw.sex !== "Female") return null;
  if (raw.goal !== "lose" && raw.goal !== "maintain" && raw.goal !== "gain") return null;
  if (!raw.steps || !STEP_BANDS.has(raw.steps)) return null;
  if (typeof raw.age !== "number" || raw.age < 18 || raw.age > 90) return null;
  if (typeof raw.weightLb !== "number" || raw.weightLb < 80 || raw.weightLb > 450) return null;
  if (typeof raw.heightIn !== "number" || raw.heightIn < 48 || raw.heightIn > 90) return null;
  if (typeof raw.strengthDays !== "number" || raw.strengthDays < 0 || raw.strengthDays > 7) return null;
  if (typeof raw.cardioSessions !== "number" || raw.cardioSessions < 0 || raw.cardioSessions > 6) return null;
  const cardioLength = raw.cardioLength && CARDIO_LENGTHS.has(raw.cardioLength) ? raw.cardioLength : null;
  const bodyFat = typeof raw.bodyFat === "number" && raw.bodyFat >= 5 && raw.bodyFat <= 60 ? raw.bodyFat : null;
  const weighIns = Array.isArray(raw.weighIns)
    ? raw.weighIns.filter(
        (entry): entry is WeighIn =>
          !!entry &&
          typeof entry === "object" &&
          typeof entry.date === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
          typeof entry.weightLb === "number" &&
          entry.weightLb >= 80 &&
          entry.weightLb <= 450,
      )
    : [];
  return {
    sex: raw.sex,
    age: Math.round(raw.age),
    weightLb: raw.weightLb,
    heightIn: raw.heightIn,
    goal: raw.goal,
    targetWeightLb: typeof raw.targetWeightLb === "number" ? raw.targetWeightLb : null,
    targetWeeks: typeof raw.targetWeeks === "number" && raw.targetWeeks > 0 ? raw.targetWeeks : null,
    steps: raw.steps,
    strengthDays: Math.round(raw.strengthDays),
    cardioSessions: Math.round(raw.cardioSessions),
    cardioLength: raw.cardioSessions > 0 ? cardioLength : null,
    bodyFat,
    weighIns,
    plannedWeeklyLb: typeof raw.plannedWeeklyLb === "number" ? raw.plannedWeeklyLb : 0,
    calorieAdjustment: typeof raw.calorieAdjustment === "number" ? raw.calorieAdjustment : 0,
    calibratedThrough: typeof raw.calibratedThrough === "string" ? raw.calibratedThrough : null,
  };
}
