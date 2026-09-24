import { supabase } from "@/lib/supabase";

export type UserProfile = {
  fullName: string;
  age: string;
  primaryGym: string;
  experienceLevel: string;
  selectedGoals: string[];
  bench: string;
  squat: string;
  deadlift: string;
};

function isUserProfile(value: unknown): value is UserProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<UserProfile>;
  return (
    typeof profile.fullName === "string" &&
    profile.fullName.trim().length > 0 &&
    typeof profile.age === "string" &&
    typeof profile.primaryGym === "string" &&
    typeof profile.experienceLevel === "string" &&
    Array.isArray(profile.selectedGoals) &&
    typeof profile.bench === "string" &&
    typeof profile.squat === "string" &&
    typeof profile.deadlift === "string"
  );
}

export async function loadProfile(): Promise<UserProfile | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;

  const profile = data.user?.user_metadata?.profile;
  return isUserProfile(profile) ? profile : null;
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  const { error } = await supabase.auth.updateUser({ data: { profile } });
  if (error) throw error;
}
