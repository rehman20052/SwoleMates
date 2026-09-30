import { experienceLevels } from "@/data/partners";
import { normalizeProfile, type UserProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";

export type DiscoverGender = "Male" | "Female";

export type DiscoverFilters = {
  distance: number;
  genders: DiscoverGender[];
  ageMin: number;
  ageMax: number;
  experience: string[];
  matchAvailability: boolean;
};

export const defaultDiscoverFilters: DiscoverFilters = {
  distance: 25,
  genders: [],
  ageMin: 18,
  ageMax: 70,
  experience: [],
  matchAvailability: false,
};

export type DiscoverCandidate = {
  id: string;
  profile: UserProfile;
  distanceMiles: number;
};

const PHOTO_BUCKET = "profile-photos";

function photoUrl(photo: string) {
  if (photo.startsWith("http://") || photo.startsWith("https://")) return photo;
  if (!photo || photo.startsWith("data:") || photo.startsWith("file:") || photo.startsWith("blob:")) return "";
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(photo).data.publicUrl;
}

function publicProfile(profile: UserProfile) {
  const kept = profile.photos
    .map((photo, index) => ({ photo: photoUrl(photo), kind: profile.photoMedia[index] ?? "image" }))
    .filter((item) => item.photo)
    .slice(0, 6);
  return {
    ...profile,
    photos: kept.map((item) => item.photo),
    photoMedia: kept.map((item) => item.kind),
    photoCaptions: profile.photoCaptions.slice(0, kept.length),
    latitude: null,
    longitude: null,
    gymLatitude: null,
    gymLongitude: null,
    zipCode: "",
    // Other people see the age, never the exact birthdate.
    birthDate: "",
  };
}

export async function publishDiscoverProfile(profile: UserProfile) {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId || !profile.fullName.trim()) return;

  const { error } = await supabase.from("discover_profiles").upsert({
    id: userId,
    profile: publicProfile(profile),
    latitude: profile.latitude,
    longitude: profile.longitude,
  });
  if (error) throw error;
}

export async function fetchDiscoverProfiles(): Promise<DiscoverCandidate[]> {
  const { data, error } = await supabase.rpc("discover_people");
  if (error) throw error;

  const rows = (data ?? []) as { id?: string; profile?: unknown; distance_miles?: number | string }[];
  const people: DiscoverCandidate[] = [];
  for (const row of rows) {
    const profile = normalizeProfile(row.profile);
    const distanceMiles = Number(row.distance_miles);
    if (!row.id || !profile || !Number.isFinite(distanceMiles)) continue;
    people.push({ id: row.id, profile, distanceMiles });
  }
  return people.sort((left, right) => left.distanceMiles - right.distanceMiles);
}

function ageOf(profile: UserProfile) {
  const age = Number.parseInt(profile.age, 10);
  return Number.isFinite(age) ? age : null;
}

export function matchesDiscoverFilters(
  candidate: DiscoverCandidate,
  filters: DiscoverFilters,
  mine: Pick<UserProfile, "availabilityDays" | "availabilityTimes">,
) {
  if (candidate.distanceMiles > filters.distance) return false;

  if (filters.genders.length > 0 && !filters.genders.includes(candidate.profile.gender as DiscoverGender)) return false;

  const age = ageOf(candidate.profile);
  if (age == null || age < filters.ageMin || age > filters.ageMax) return false;

  if (filters.experience.length > 0 && !filters.experience.includes(candidate.profile.experienceLevel)) return false;

  if (filters.matchAvailability) {
    const sharesDay = mine.availabilityDays.some((day) => candidate.profile.availabilityDays.includes(day));
    const sharesTime = mine.availabilityTimes.some((time) => candidate.profile.availabilityTimes.includes(time));
    if (!sharesDay || !sharesTime) return false;
  }

  return true;
}

export function formatDistance(miles: number) {
  if (!Number.isFinite(miles) || miles < 1) return "Less than 1 mile away";
  const rounded = Math.round(miles);
  return rounded === 1 ? "1 mile away" : `${rounded} miles away`;
}

const accountId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAccountId(id: string) {
  return accountId.test(id);
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

type FilterRow = {
  max_distance_miles?: number | null;
  genders?: string[] | null;
  min_age?: number | null;
  max_age?: number | null;
  experience_levels?: string[] | null;
  match_availability?: boolean | null;
};

export function filtersFromRow(row: FilterRow | null): DiscoverFilters {
  if (!row) return defaultDiscoverFilters;
  const genders = (row.genders ?? []).filter((gender): gender is DiscoverGender => gender === "Male" || gender === "Female");
  const experience = (row.experience_levels ?? []).filter((level): level is string =>
    (experienceLevels as readonly string[]).includes(level),
  );
  const ageMin = clampInt(Number(row.min_age ?? defaultDiscoverFilters.ageMin), 18, 70);
  const ageMax = clampInt(Number(row.max_age ?? defaultDiscoverFilters.ageMax), ageMin, 70);
  return {
    distance: clampInt(Number(row.max_distance_miles ?? defaultDiscoverFilters.distance), 5, 50),
    genders,
    ageMin,
    ageMax,
    experience,
    matchAvailability: Boolean(row.match_availability),
  };
}

function filterRow(userId: string, filters: DiscoverFilters) {
  const ageMin = clampInt(filters.ageMin, 18, 70);
  return {
    user_id: userId,
    max_distance_miles: clampInt(filters.distance, 5, 50),
    genders: filters.genders.filter((gender) => gender === "Male" || gender === "Female"),
    min_age: ageMin,
    max_age: clampInt(filters.ageMax, ageMin, 70),
    experience_levels: filters.experience.filter((level) => (experienceLevels as readonly string[]).includes(level)),
    match_availability: filters.matchAvailability,
  };
}

export async function loadDiscoverFilters() {
  const me = await currentUserId();
  if (!me) return null;
  const { data, error } = await supabase
    .from("discover_filter")
    .select("max_distance_miles, genders, min_age, max_age, experience_levels, match_availability")
    .eq("user_id", me)
    .maybeSingle();
  if (error || !data) return null;
  return filtersFromRow(data);
}

export async function saveDiscoverFilters(filters: DiscoverFilters) {
  const me = await currentUserId();
  if (!me) return;
  await supabase.from("discover_filter").upsert(filterRow(me, filters));
}

export async function loadSkippedIds() {
  const me = await currentUserId();
  if (!me) return [];
  const { data, error } = await supabase.from("discover_skip").select("skipped_user_id").eq("user_id", me);
  if (error || !data) return [];
  return data.map((row) => row.skipped_user_id).filter((id): id is string => typeof id === "string" && id.length > 0);
}

export async function rememberSkip(skippedUserId: string) {
  if (!isAccountId(skippedUserId)) return;
  const me = await currentUserId();
  if (!me || me === skippedUserId) return;
  await supabase.from("discover_skip").upsert(
    { user_id: me, skipped_user_id: skippedUserId },
    { onConflict: "user_id,skipped_user_id" },
  );
}

export async function forgetSkip(skippedUserId: string) {
  if (!isAccountId(skippedUserId)) return;
  const me = await currentUserId();
  if (!me) return;
  await supabase.from("discover_skip").delete().eq("user_id", me).eq("skipped_user_id", skippedUserId);
}

export function discoverSetupMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string"
        ? (error as { message: string }).message
        : "";
  if (message.includes("discover_profiles") || message.includes("discover_people") || message.includes("schema cache")) {
    return "Discover storage is not set up on this Supabase project yet.";
  }
  return "Could not load people near you. Check your connection and try again.";
}

export const discoverExperienceLevels = experienceLevels;
