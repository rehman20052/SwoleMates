import { supabase } from "@/lib/supabase";

export type ProfileGender = "" | "Male" | "Female" | "Other";

export type UserProfile = {
  fullName: string;
  age: string;
  gender: ProfileGender;
  primaryGym: string;
  hometown: string;
  zipCode: string;
  about: string;
  experienceLevel: string;
  selectedGoals: string[];
  bench: string;
  squat: string;
  deadlift: string;
  customLiftName: string;
  customLift: string;
  photos: string[];
};

const genders: readonly ProfileGender[] = ["Male", "Female", "Other"];

function isGender(value: unknown): value is ProfileGender {
  return typeof value === "string" && genders.includes(value as ProfileGender);
}

export function normalizeProfile(value: unknown): UserProfile | null {
  if (!value || typeof value !== "object") return null;
  const profile = value as Partial<UserProfile>;
  if (typeof profile.fullName !== "string" || !profile.fullName.trim()) return null;

  const goals = Array.isArray(profile.selectedGoals)
    ? profile.selectedGoals.filter((goal): goal is string => typeof goal === "string")
    : [];
  const photos = Array.isArray(profile.photos)
    ? profile.photos.filter((photo): photo is string => typeof photo === "string").slice(0, 6)
    : [];

  return {
    fullName: profile.fullName,
    age: typeof profile.age === "string" ? profile.age : "",
    gender: isGender(profile.gender) ? profile.gender : "",
    primaryGym: typeof profile.primaryGym === "string" ? profile.primaryGym : "",
    hometown: typeof profile.hometown === "string" ? profile.hometown : "",
    zipCode: typeof profile.zipCode === "string" ? profile.zipCode : "",
    about: typeof profile.about === "string" ? profile.about : "",
    experienceLevel: typeof profile.experienceLevel === "string" ? profile.experienceLevel : "Intermediate",
    selectedGoals: goals,
    bench: typeof profile.bench === "string" ? profile.bench : "N/A",
    squat: typeof profile.squat === "string" ? profile.squat : "N/A",
    deadlift: typeof profile.deadlift === "string" ? profile.deadlift : "N/A",
    customLiftName: typeof profile.customLiftName === "string" ? profile.customLiftName : "",
    customLift: typeof profile.customLift === "string" ? profile.customLift : "N/A",
    photos,
  };
}

export async function loadProfile(): Promise<UserProfile | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return normalizeProfile(data.user?.user_metadata?.profile);
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  const { error } = await supabase.auth.updateUser({ data: { profile } });
  if (error) throw error;
}
