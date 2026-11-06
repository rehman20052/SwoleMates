// Cardio and other activities (runs, swims, pilates...) are logged with time, optional
// distance and effort, instead of the sets and reps used for lifting.
export const loggableActivities = [
  "Running", "Walking", "Cycling", "Swimming", "Hiking", "Rowing",
  "Elliptical", "Stair climber", "Pilates", "Yoga", "Climbing", "Sports", "Other",
] as const;

export const activityEfforts = ["Easy", "Moderate", "Hard"] as const;
export type DistanceUnit = "mi" | "km" | "m" | "yd";
export type ActivityDetails = {
  type: string;
  distance?: number;
  distanceUnit?: DistanceUnit;
  effort?: (typeof activityEfforts)[number];
  // Calories burned: estimated from MET values, or typed in (e.g. from a watch).
  calories?: number;
  caloriesSource?: "estimate" | "manual";
};

// Activities where distance is worth asking for, and the units that fit each.
export function distanceUnits(type: string): DistanceUnit[] {
  if (type === "Swimming") return ["m", "yd"];
  if (["Running", "Walking", "Cycling", "Hiking", "Rowing"].includes(type)) return ["mi", "km"];
  return [];
}

export function isActivityDetails(value: unknown): value is ActivityDetails {
  if (!value || typeof value !== "object") return false;
  const item = value as ActivityDetails;
  return typeof item.type === "string" && (loggableActivities as readonly string[]).includes(item.type)
    && (item.distance === undefined || (Number.isFinite(item.distance) && item.distance > 0 && item.distance <= 100000))
    && (item.distanceUnit === undefined || ["mi", "km", "m", "yd"].includes(item.distanceUnit))
    && (item.effort === undefined || (activityEfforts as readonly string[]).includes(item.effort))
    && (item.calories === undefined || (Number.isInteger(item.calories) && item.calories >= 0 && item.calories <= 10000))
    && (item.caloriesSource === undefined || item.caloriesSource === "estimate" || item.caloriesSource === "manual");
}

// "45 min · 3.1 mi · Moderate"
export function activitySummary(activity: ActivityDetails, durationMinutes?: number) {
  return [
    durationMinutes ? `${durationMinutes} min` : null,
    activity.distance ? `${activity.distance} ${activity.distanceUnit ?? ""}`.trim() : null,
    activity.effort ?? null,
    activity.calories ? `${activity.calories} kcal` : null,
  ].filter(Boolean).join(" · ") || activity.type;
}

// MET values (how hard an activity is compared with sitting still) from the Compendium of
// Physical Activities. Easy / Moderate / Hard pick a value; with no effort, Moderate is used.
const effortMets: Record<string, [number, number, number]> = {
  Running: [7.0, 9.8, 11.5],
  Walking: [3.0, 3.8, 5.0],
  Cycling: [5.8, 7.5, 10.0],
  Swimming: [5.8, 7.0, 9.8],
  Hiking: [5.3, 6.0, 7.8],
  Rowing: [4.8, 7.0, 8.5],
  Elliptical: [4.6, 5.0, 7.5],
  "Stair climber": [6.8, 9.0, 10.0],
  Pilates: [2.8, 3.0, 4.0],
  Yoga: [2.3, 2.5, 4.0],
  Climbing: [5.8, 7.3, 8.0],
  Sports: [6.0, 7.0, 8.0],
  Other: [3.5, 5.0, 7.0],
};

// For these, speed (distance ÷ time) is a better guide than effort. [mph, MET] points.
const speedMets: Record<string, [number, number][]> = {
  Running: [[4, 6.0], [5, 8.3], [6, 9.8], [7, 11.0], [8, 11.8], [9, 12.8], [10, 14.5], [12, 16.0]],
  Walking: [[2, 2.8], [2.5, 3.0], [3, 3.5], [3.5, 4.3], [4, 5.0], [4.5, 7.0]],
  Cycling: [[8, 4.0], [11, 6.8], [13, 8.0], [15, 10.0], [18, 12.0], [21, 15.8]],
};

const MILES_PER: Record<DistanceUnit, number> = { mi: 1, km: 0.621371, m: 0.000621371, yd: 0.000568182 };

function metFromSpeed(points: [number, number][], mph: number) {
  if (mph <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1], [x2, y2] = points[i];
    if (mph <= x2) return y1 + ((mph - x1) / (x2 - x1)) * (y2 - y1);
  }
  return points[points.length - 1][1];
}

export function activityMet(activity: Pick<ActivityDetails, "type" | "distance" | "distanceUnit" | "effort">, minutes: number) {
  const points = speedMets[activity.type];
  if (points && activity.distance && activity.distanceUnit && minutes > 0) {
    const mph = (activity.distance * MILES_PER[activity.distanceUnit]) / (minutes / 60);
    if (Number.isFinite(mph) && mph > 0) return metFromSpeed(points, mph);
  }
  const mets = effortMets[activity.type] ?? effortMets.Other;
  return mets[activity.effort === "Easy" ? 0 : activity.effort === "Hard" ? 2 : 1];
}

// calories = MET × weight (kg) × hours. Returns null without a usable weight or time.
export function estimateCalories(activity: Pick<ActivityDetails, "type" | "distance" | "distanceUnit" | "effort">, minutes: number, weightLb: number | null | undefined) {
  if (!weightLb || weightLb < 50 || weightLb > 700 || !Number.isFinite(minutes) || minutes < 1) return null;
  const kg = weightLb * 0.45359237;
  return Math.round(activityMet(activity, minutes) * kg * (minutes / 60));
}
