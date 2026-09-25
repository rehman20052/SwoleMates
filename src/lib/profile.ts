import { supabase } from "@/lib/supabase";
import { lookupUsZip } from "@/lib/zip-location";

export type ProfileGender = "" | "Male" | "Female" | "Other";

export const profileGoals = ["Fat loss", "Endurance", "Strength training", "Gain mass"] as const;
export const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const dayTimes = ["Morning", "Afternoon", "Evening"] as const;
export const MIN_PROFILE_PROMPTS = 3;
export const PROMPT_ANSWER_LIMIT = 140;

export const photoCaptionGroups = [
  {
    title: "Milestones",
    options: [
      "My proudest moment in the gym so far.",
      "The day I finally hit that PR.",
      "Before the pre-workout kicked in vs. after.",
      "Proof that consistency actually works.",
      "The face of someone who just completed leg day.",
    ],
  },
  {
    title: "Lifestyle & Vibe",
    options: [
      "My natural habitat.",
      "Where I spend 90% of my free time.",
      "Post-workout pump appreciation.",
      "Fueling up for greatness.",
      "Recovery mode: active laziness.",
    ],
  },
  {
    title: "Humorous & Lighthearted",
    options: [
      "Me pretending I'm not entirely out of breath.",
      "My relationship status: dating my gym bag.",
      "Trying to look cool while doing cardio (failing).",
      "Please don't talk to me during my heavy sets.",
      "My gym playlist is the only thing carrying me through this.",
    ],
  },
] as const;

export const profilePromptGroups = [
  {
    title: "Progress & Goals",
    options: [
      "My current obsession in the gym is...",
      "The one lift I'm trying to master this month is...",
      "My ultimate fitness goal for this year is...",
      "The hardest lesson I've learned in the gym was...",
      "My biggest gym milestone was when I finally...",
    ],
  },
  {
    title: "Preferences & Habits",
    options: [
      "My go-to pre-workout ritual involves...",
      "You know I'm locked into a workout when...",
      "My ideal gym partner is someone who...",
      "My absolute favorite split to run is...",
      "The exercise I secretly love to hate is...",
    ],
  },
  {
    title: "Fun & Conversational",
    options: [
      "We'll get along if you never...",
      "My most controversial gym opinion is...",
      "The song that adds 10 lbs to my max squat is...",
      "I'll judge you silently if you...",
      "My post-gym cheat meal of choice is...",
    ],
  },
] as const;

export const photoCaptionOptions = photoCaptionGroups.flatMap((group) => group.options);
export const profilePromptOptions = profilePromptGroups.flatMap((group) => group.options);

export type ProfilePromptAnswer = {
  prompt: string;
  answer: string;
};

export type UserProfile = {
  fullName: string;
  age: string;
  gender: ProfileGender;
  primaryGym: string;
  gymAddress: string;
  gymLatitude: number | null;
  gymLongitude: number | null;
  hometown: string;
  zipCode: string;
  latitude: number | null;
  longitude: number | null;
  about: string;
  experienceLevel: string;
  selectedGoals: string[];
  availabilityDays: string[];
  availabilityTimes: string[];
  bench: string;
  squat: string;
  deadlift: string;
  customLiftName: string;
  customLift: string;
  photos: string[];
  photoCaptions: string[];
  prompts: ProfilePromptAnswer[];
};

const genders: readonly ProfileGender[] = ["Male", "Female", "Other"];

function isGender(value: unknown): value is ProfileGender {
  return typeof value === "string" && genders.includes(value as ProfileGender);
}

function chosen(value: unknown, allowed: readonly string[]) {
  if (!Array.isArray(value)) return [];
  return allowed.filter((item) => value.includes(item));
}

function coordinate(value: unknown, min: number, max: number) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return Math.round(number * 10000) / 10000;
}

function listed(value: unknown, allowed: readonly string[]): value is string {
  return typeof value === "string" && allowed.includes(value);
}

export function answeredPrompts(prompts: ProfilePromptAnswer[]) {
  const seen = new Set<string>();
  const answers: ProfilePromptAnswer[] = [];
  for (const item of prompts) {
    const prompt = item.prompt.trim();
    const answer = item.answer.trim().slice(0, PROMPT_ANSWER_LIMIT);
    if (!listed(prompt, profilePromptOptions) || !answer || seen.has(prompt)) continue;
    seen.add(prompt);
    answers.push({ prompt, answer });
  }
  return answers;
}

function normalizeCaptions(value: unknown, count: number) {
  const raw = Array.isArray(value) ? value : [];
  return Array.from({ length: count }, (_, index) => (listed(raw[index], photoCaptionOptions) ? (raw[index] as string) : ""));
}

function normalizePrompts(value: unknown) {
  if (!Array.isArray(value)) return [];
  return answeredPrompts(
    value.map((item) => {
      const prompt = item && typeof item === "object" ? (item as { prompt?: unknown; answer?: unknown }) : {};
      return {
        prompt: typeof prompt.prompt === "string" ? prompt.prompt : "",
        answer: typeof prompt.answer === "string" ? prompt.answer : "",
      };
    }),
  );
}

export function normalizeProfile(value: unknown): UserProfile | null {
  if (!value || typeof value !== "object") return null;
  const profile = value as Partial<UserProfile>;
  if (typeof profile.fullName !== "string" || !profile.fullName.trim()) return null;

  const goals = chosen(profile.selectedGoals, profileGoals);
  const photos = Array.isArray(profile.photos)
    ? profile.photos.filter((photo): photo is string => typeof photo === "string").slice(0, 6)
    : [];

  return {
    fullName: profile.fullName,
    age: typeof profile.age === "string" ? profile.age : "",
    gender: isGender(profile.gender) ? profile.gender : "",
    primaryGym: typeof profile.primaryGym === "string" ? profile.primaryGym : "",
    gymAddress: typeof profile.gymAddress === "string" ? profile.gymAddress : "",
    gymLatitude: coordinate(profile.gymLatitude, -90, 90),
    gymLongitude: coordinate(profile.gymLongitude, -180, 180),
    hometown: typeof profile.hometown === "string" ? profile.hometown : "",
    zipCode: typeof profile.zipCode === "string" ? profile.zipCode : "",
    latitude: coordinate(profile.latitude, -90, 90),
    longitude: coordinate(profile.longitude, -180, 180),
    about: typeof profile.about === "string" ? profile.about : "",
    experienceLevel: typeof profile.experienceLevel === "string" ? profile.experienceLevel : "Intermediate",
    selectedGoals: goals,
    availabilityDays: chosen(profile.availabilityDays, weekDays),
    availabilityTimes: chosen(profile.availabilityTimes, dayTimes),
    bench: typeof profile.bench === "string" ? profile.bench : "N/A",
    squat: typeof profile.squat === "string" ? profile.squat : "N/A",
    deadlift: typeof profile.deadlift === "string" ? profile.deadlift : "N/A",
    customLiftName: typeof profile.customLiftName === "string" ? profile.customLiftName : "",
    customLift: typeof profile.customLift === "string" ? profile.customLift : "N/A",
    photos,
    photoCaptions: normalizeCaptions(profile.photoCaptions, photos.length),
    prompts: normalizePrompts(profile.prompts),
  };
}

const PHOTO_BUCKET = "profile-photos";
const MAX_PHOTO_BYTES = 2_000_000;
const photoStorageKey = (userId: string) => `swolemates.photos.${userId}`;

function readStoredPhotos(userId: string): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const saved = JSON.parse(localStorage.getItem(photoStorageKey(userId)) ?? "[]") as unknown;
    return Array.isArray(saved) ? saved.filter((photo): photo is string => typeof photo === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

function clearStoredPhotos(userId: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(photoStorageKey(userId));
}

function publicPhotoUrl(path: string) {
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

function storagePath(photo: string, userId: string): string | null {
  const ownedPrefix = `${userId}/`;
  const raw = photo.startsWith(ownedPrefix)
    ? photo
    : (() => {
        const marker = `/object/public/${PHOTO_BUCKET}/`;
        const index = photo.indexOf(marker);
        if (index < 0) return "";
        return decodeURIComponent(photo.slice(index + marker.length).split("?")[0]);
      })();

  if (!raw.startsWith(ownedPrefix) || raw.includes("..") || raw.length > 160) return null;
  return raw;
}

function displayPhoto(photo: string, userId: string): string | null {
  if (photo.startsWith("data:")) return null;
  const path = storagePath(photo, userId);
  return path ? publicPhotoUrl(path) : null;
}

export function profileFromUser(user: { id: string; user_metadata?: Record<string, unknown> } | null): UserProfile | null {
  const profile = normalizeProfile(user?.user_metadata?.profile);
  if (!profile || !user) return profile;

  const remote = profile.photos
    .map((photo) => displayPhoto(photo, user.id))
    .filter((photo): photo is string => photo !== null);
  if (remote.length > 0) return { ...profile, photos: remote };

  // Photos picked before Storage was connected still live in this browser.
  // The next save uploads them and keeps only the short file path on the account.
  const local = readStoredPhotos(user.id).filter(
    (photo) => photo.startsWith("data:") || photo.startsWith("file:") || photo.startsWith("blob:") || photo.startsWith("http"),
  );
  return { ...profile, photos: local };
}

function clip(value: string, max: number) {
  const trimmed = value.trim();
  if (trimmed.startsWith("data:")) return "";
  return trimmed.slice(0, max);
}

function accountProfile(profile: UserProfile, photoPaths: string[], location: { latitude: number | null; longitude: number | null }) {
  return {
    fullName: clip(profile.fullName, 80),
    age: clip(profile.age, 3),
    gender: profile.gender,
    primaryGym: clip(profile.primaryGym, 80),
    gymAddress: profile.primaryGym.trim() ? clip(profile.gymAddress, 140) : "",
    gymLatitude: profile.primaryGym.trim() ? coordinate(profile.gymLatitude, -90, 90) : null,
    gymLongitude: profile.primaryGym.trim() ? coordinate(profile.gymLongitude, -180, 180) : null,
    hometown: clip(profile.hometown, 80),
    zipCode: clip(profile.zipCode, 10),
    latitude: location.latitude,
    longitude: location.longitude,
    about: clip(profile.about, 280),
    experienceLevel: clip(profile.experienceLevel, 20),
    selectedGoals: chosen(profile.selectedGoals, profileGoals),
    availabilityDays: chosen(profile.availabilityDays, weekDays),
    availabilityTimes: chosen(profile.availabilityTimes, dayTimes),
    bench: clip(profile.bench, 12),
    squat: clip(profile.squat, 12),
    deadlift: clip(profile.deadlift, 12),
    customLiftName: clip(profile.customLiftName, 40),
    customLift: clip(profile.customLift, 12),
    photos: photoPaths,
    photoCaptions: normalizeCaptions(profile.photoCaptions, photoPaths.length),
    prompts: answeredPrompts(profile.prompts),
  };
}

function savedPhotoPaths(user: { id: string; user_metadata?: Record<string, unknown> }) {
  const profile = user.user_metadata?.profile;
  if (!profile || typeof profile !== "object") return [];
  const photos = (profile as { photos?: unknown }).photos;
  if (!Array.isArray(photos)) return [];
  return photos
    .filter((photo): photo is string => typeof photo === "string")
    .map((photo) => storagePath(photo, user.id))
    .filter((photo): photo is string => photo !== null);
}

function photoFileId() {
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function decodeBase64(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = value.replace(/[^A-Za-z0-9+/]/g, "");
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const char of clean) {
    buffer = (buffer << 6) | alphabet.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[index] = (buffer >> bits) & 0xff;
      index += 1;
    }
  }
  return bytes.slice(0, index);
}

async function photoBytes(photo: string) {
  if (photo.startsWith("data:")) {
    return decodeBase64(photo.slice(photo.indexOf(",") + 1));
  }
  const response = await fetch(photo);
  return new Uint8Array(await response.arrayBuffer());
}

async function uploadPhoto(userId: string, photo: string): Promise<string> {
  const existing = storagePath(photo, userId);
  if (existing) return existing;

  const bytes = await photoBytes(photo);
  if (bytes.byteLength > MAX_PHOTO_BYTES) {
    throw new Error("Each photo must be under 2MB.");
  }

  const path = `${userId}/${photoFileId()}.jpg`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, bytes, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (!error) return path;

  const message = error.message.toLowerCase();
  if (message.includes("bucket not found") || message.includes("row-level security")) {
    throw new Error("Photo storage is not set up on this Supabase project yet.");
  }
  throw error;
}

export async function loadProfile(): Promise<UserProfile | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return profileFromUser(data.session?.user ?? null);
}

export async function saveProfile(profile: UserProfile): Promise<UserProfile> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) throw new Error("Sign in again before saving your profile.");
  if (session.access_token.length > 8000) throw new Error("OVERSIZED_SESSION");
  if (profile.primaryGym.trim() && (profile.gymLatitude == null || profile.gymLongitude == null)) {
    throw new Error("Pick the street address from the list so we know which gym building it is.");
  }

  const userId = session.user.id;
  const previous = savedPhotoPaths(session.user);
  const uploaded: string[] = [];
  const zip = profile.zipCode.trim();
  let place = null;
  if (zip) {
    try {
      place = await lookupUsZip(zip);
    } catch (error) {
      if (error instanceof Error && error.message !== "Failed to fetch") throw error;
      throw new Error("Could not look up that zip code. Check your connection and try again.");
    }
    if (!place) throw new Error("That zip code was not found.");
  }
  const location = {
    latitude: place?.latitude ?? null,
    longitude: place?.longitude ?? null,
  };

  try {
    for (const photo of profile.photos.slice(0, 6)) {
      uploaded.push(await uploadPhoto(userId, photo));
    }

    const { error } = await supabase.auth.updateUser({
      data: { profile: accountProfile(profile, uploaded, location) },
    });
    if (error) throw error;
  } catch (error) {
    const freshUploads = uploaded.filter((path) => !previous.includes(path));
    if (freshUploads.length > 0) {
      await supabase.storage.from(PHOTO_BUCKET).remove(freshUploads);
    }
    throw error;
  }

  const removed = previous.filter((path) => !uploaded.includes(path));
  if (removed.length > 0) {
    await supabase.storage.from(PHOTO_BUCKET).remove(removed);
  }
  clearStoredPhotos(userId);

  return { ...profile, ...location, photos: uploaded.map(publicPhotoUrl) };
}
