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
  const photos = profile.photos.map(photoUrl).filter(Boolean).slice(0, 6);
  return {
    ...profile,
    photos,
    photoCaptions: profile.photoCaptions.slice(0, photos.length),
    latitude: null,
    longitude: null,
    gymLatitude: null,
    gymLongitude: null,
    zipCode: "",
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
