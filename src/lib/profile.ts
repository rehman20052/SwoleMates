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

function accountProfile(profile: UserProfile, photoPaths: string[]) {
  const goals = profile.selectedGoals
    .map((goal) => clip(goal, 40))
    .filter((goal) => goal.length > 0)
    .slice(0, 8);

  return {
    fullName: clip(profile.fullName, 80),
    age: clip(profile.age, 3),
    gender: profile.gender,
    primaryGym: clip(profile.primaryGym, 80),
    hometown: clip(profile.hometown, 80),
    zipCode: clip(profile.zipCode, 10),
    about: clip(profile.about, 280),
    experienceLevel: clip(profile.experienceLevel, 20),
    selectedGoals: goals,
    bench: clip(profile.bench, 12),
    squat: clip(profile.squat, 12),
    deadlift: clip(profile.deadlift, 12),
    customLiftName: clip(profile.customLiftName, 40),
    customLift: clip(profile.customLift, 12),
    photos: photoPaths,
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

  const userId = session.user.id;
  const previous = savedPhotoPaths(session.user);
  const uploaded: string[] = [];

  try {
    for (const photo of profile.photos.slice(0, 6)) {
      uploaded.push(await uploadPhoto(userId, photo));
    }

    const { error } = await supabase.auth.updateUser({
      data: { profile: accountProfile(profile, uploaded) },
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

  return { ...profile, photos: uploaded.map(publicPhotoUrl) };
}
