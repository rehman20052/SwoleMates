import { compressProfileVideo } from "@/lib/compress-video";
import { jpegBytesFromHeic } from "@/lib/heic-jpeg";
import { isHeicMedia, looksLikeHeic, renderJpegUrl } from "@/lib/heic-media";
import { readLocalBytes } from "@/lib/local-file";
import { supabase } from "@/lib/supabase";
import { legacyLiftFields, profileLifts, type ProfileLift } from "./profile-lifts";
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
  // YYYY-MM-DD. Age is calculated from it and kept for Discover and match cards.
  birthDate: string;
  age: string;
  gender: ProfileGender;
  primaryGym: string;
  gymAddress: string;
  gymLatitude: number | null;
  gymLongitude: number | null;
  // OpenStreetMap ID of the picked place, e.g. "node:123456". Used to find the same gym again.
  gymPlaceId: string;
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
  displayLifts?: ProfileLift[];
  photos: string[];
  avatar?: string;
  photoMedia: ProfileMediaKind[];
  photoCaptions: string[];
  prompts: ProfilePromptAnswer[];
};

export type ProfileMediaKind = "image" | "video";
export const MAX_PROFILE_MEDIA_BYTES = 50 * 1024 * 1024;

export function profileMediaKind(uri: string, hinted?: unknown): ProfileMediaKind {
  if (hinted === "video" || hinted === "image") return hinted;
  const path = uri.split("?")[0].toLowerCase();
  if (path.startsWith("data:video") || /\.(mp4|mov|m4v|webm)$/.test(path)) return "video";
  return "image";
}

const pickedMime = new Map<string, string>();

export function rememberPickedMime(uri: string, mimeType?: string) {
  if (mimeType) pickedMime.set(uri, mimeType);
}

export function profilePortrait(profile: Pick<UserProfile, "photos" | "photoMedia" | "avatar">): string | null {
  if (profile.avatar) return profile.avatar;
  const index = profile.photos.findIndex((photo, photoIndex) => profileMediaKind(photo, profile.photoMedia[photoIndex]) === "image");
  return index >= 0 ? profile.photos[index] : null;
}

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

export const MIN_AGE = 18;
const MAX_AGE = 100;

function parseBirthDate(iso: string) {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { year, month, day };
}

export function ageFromBirthDate(iso: string, today = new Date()): number | null {
  const born = parseBirthDate(iso);
  if (!born) return null;
  const hadBirthday =
    today.getMonth() + 1 > born.month || (today.getMonth() + 1 === born.month && today.getDate() >= born.day);
  return today.getFullYear() - born.year - (hadBirthday ? 0 : 1);
}

export function birthDateError(iso: string): string | null {
  const age = ageFromBirthDate(iso);
  if (age == null) return "Enter your birthdate as MM/DD/YYYY.";
  if (age < 0) return "Your birthdate can't be in the future.";
  if (age < MIN_AGE) return `You must be ${MIN_AGE} or older to use SwoleMates.`;
  if (age > MAX_AGE) return "Check the year of your birthdate.";
  return null;
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

  const birthDate = typeof profile.birthDate === "string" && parseBirthDate(profile.birthDate) ? profile.birthDate : "";
  const age = ageFromBirthDate(birthDate);

  return {
    fullName: profile.fullName,
    birthDate,
    // Older profiles and tester rows only have a typed age.
    age: age != null ? String(age) : typeof profile.age === "string" ? profile.age : "",
    gender: isGender(profile.gender) ? profile.gender : "",
    primaryGym: typeof profile.primaryGym === "string" ? profile.primaryGym : "",
    gymAddress: typeof profile.gymAddress === "string" ? profile.gymAddress : "",
    gymLatitude: coordinate(profile.gymLatitude, -90, 90),
    gymLongitude: coordinate(profile.gymLongitude, -180, 180),
    gymPlaceId: typeof profile.gymPlaceId === "string" ? profile.gymPlaceId : "",
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
    displayLifts: profileLifts(profile),
    photos,
    avatar: typeof profile.avatar === "string" ? profile.avatar : undefined,
    photoMedia: photos.map((photo, index) => profileMediaKind(photo, Array.isArray(profile.photoMedia) ? profile.photoMedia[index] : undefined)),
    photoCaptions: normalizeCaptions(profile.photoCaptions, photos.length),
    prompts: normalizePrompts(profile.prompts),
  };
}

const PHOTO_BUCKET = "profile-photos";
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

  const remote = profile.photos.flatMap((photo, index) => {
    const shown = displayPhoto(photo, user.id);
    return shown ? [{ uri: shown, kind: profile.photoMedia[index] ?? "image" }] : [];
  });
  if (remote.length > 0) {
    return { ...profile, avatar: profile.avatar ? displayPhoto(profile.avatar, user.id) ?? undefined : undefined, photos: remote.map((item) => item.uri), photoMedia: remote.map((item) => item.kind) };
  }

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

function accountProfile(profile: UserProfile, photoPaths: string[], location: { latitude: number | null; longitude: number | null }, avatar?: string) {
  return {
    fullName: clip(profile.fullName, 80),
    birthDate: parseBirthDate(profile.birthDate) ? profile.birthDate : "",
    age: String(ageFromBirthDate(profile.birthDate) ?? clip(profile.age, 3)),
    gender: profile.gender,
    primaryGym: clip(profile.primaryGym, 80),
    gymAddress: profile.primaryGym.trim() ? clip(profile.gymAddress, 140) : "",
    gymLatitude: profile.primaryGym.trim() ? coordinate(profile.gymLatitude, -90, 90) : null,
    gymLongitude: profile.primaryGym.trim() ? coordinate(profile.gymLongitude, -180, 180) : null,
    gymPlaceId: profile.primaryGym.trim() ? clip(profile.gymPlaceId, 60) : "",
    hometown: clip(profile.hometown, 80),
    zipCode: clip(profile.zipCode, 10),
    latitude: location.latitude,
    longitude: location.longitude,
    about: clip(profile.about, 280),
    experienceLevel: clip(profile.experienceLevel, 20),
    selectedGoals: chosen(profile.selectedGoals, profileGoals),
    availabilityDays: chosen(profile.availabilityDays, weekDays),
    availabilityTimes: chosen(profile.availabilityTimes, dayTimes),
    ...legacyLiftFields(profileLifts(profile)),
    displayLifts: profileLifts(profile),
    photos: photoPaths,
    avatar,
    photoMedia: photoPaths.map((_, index) => profile.photoMedia[index] ?? "image"),
    photoCaptions: normalizeCaptions(profile.photoCaptions, photoPaths.length),
    prompts: answeredPrompts(profile.prompts),
  };
}

function savedPhotoPaths(user: { id: string; user_metadata?: Record<string, unknown> }) {
  const profile = user.user_metadata?.profile;
  if (!profile || typeof profile !== "object") return [];
  const photos = (profile as { photos?: unknown }).photos;
  if (!Array.isArray(photos)) return [];
  return [...photos, (profile as { avatar?: unknown }).avatar]
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

async function loadRenderedJpeg(url: string | null) {
  if (!url) throw new Error("Could not open that photo.");
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not open that photo.");
  return { bytes: new Uint8Array(await response.arrayBuffer()), mime: "image/jpeg" };
}

async function loadMedia(photo: string) {
  if (photo.startsWith("data:")) {
    const header = photo.slice(5, photo.indexOf(","));
    return { bytes: decodeBase64(photo.slice(header.length + 6)), mime: header.split(";")[0] };
  }
  const local = await readLocalBytes(photo);
  if (local) return local;
  const response = await fetch(photo);
  const mime = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  return { bytes: new Uint8Array(await response.arrayBuffer()), mime };
}

const mediaFiles: Record<string, { extension: string; contentType: string }> = {
  "image/jpeg": { extension: "jpg", contentType: "image/jpeg" },
  "image/png": { extension: "png", contentType: "image/png" },
  "image/webp": { extension: "webp", contentType: "image/webp" },
  "image/heic": { extension: "heic", contentType: "image/heic" },
  "video/mp4": { extension: "mp4", contentType: "video/mp4" },
  "video/quicktime": { extension: "mov", contentType: "video/quicktime" },
};

async function uploadProfileMedia(userId: string, photo: string, kind: ProfileMediaKind, mimeType?: string): Promise<string> {
  const existing = storagePath(photo, userId);
  // A HEIC already in storage still has to be rewritten. Chrome and other desktop browsers cannot show it.
  if (existing && !isHeicMedia(existing)) return existing;

  const rendered = Boolean(existing && isHeicMedia(existing));
  const loaded = rendered
    ? await loadRenderedJpeg(renderJpegUrl(publicPhotoUrl(existing!)))
    : await loadMedia(photo);
  const heic = !rendered && kind === "image" && looksLikeHeic(loaded.bytes, mimeType || loaded.mime, photo);
  if (heic) {
    loaded.bytes = await jpegBytesFromHeic(loaded.bytes);
    loaded.mime = "image/jpeg";
  }
  if (kind === "video" && loaded.bytes.byteLength > MAX_PROFILE_MEDIA_BYTES) {
    const source = loaded.bytes;
    const compressed = await compressProfileVideo(
      new Blob([source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer], { type: loaded.mime || "video/mp4" }),
      MAX_PROFILE_MEDIA_BYTES,
    );
    loaded.bytes = new Uint8Array(await compressed.arrayBuffer());
    loaded.mime = "video/mp4";
  }
  if (loaded.bytes.byteLength > MAX_PROFILE_MEDIA_BYTES) {
    throw new Error(kind === "video" ? "That clip is too long to fit under 50MB, even after compressing." : "Photos must be under 50MB.");
  }

  const file = rendered || heic
    ? mediaFiles["image/jpeg"]
    : (mediaFiles[mimeType ?? ""] ??
      mediaFiles[pickedMime.get(photo) ?? ""] ??
      mediaFiles[loaded.mime] ??
      (kind === "video" ? mediaFiles["video/mp4"] : mediaFiles["image/jpeg"]));
  const path = `${userId}/${photoFileId()}.${file.extension}`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, loaded.bytes, {
    contentType: file.contentType,
    upsert: false,
  });
  if (!error) return path;

  const message = error.message.toLowerCase();
  if (message.includes("bucket not found") || message.includes("row-level security")) {
    throw new Error("Photo storage is not set up on this Supabase project yet.");
  }
  throw error;
}

type AccountProfile = ReturnType<typeof accountProfile>;

// "135 lbs" -> 135, "N/A" or "" -> null
function pounds(value: string) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : null;
}

async function saveGym(account: AccountProfile): Promise<string | null> {
  if (!account.primaryGym) return null;

  // Search results without an OpenStreetMap ID get a stand-in like "place:<address>", which isn't stable.
  const osmId = account.gymPlaceId && !account.gymPlaceId.startsWith("place:") ? account.gymPlaceId : null;

  if (osmId) {
    const { data: byOsm, error } = await supabase.from("gym").select("id").eq("osm_id", osmId).limit(1);
    if (error) throw error;
    if (byOsm && byOsm.length > 0) return byOsm[0].id as string;
  }

  // Addresses are unique in the gym table, so a gym saved before osm_id existed is found here.
  const { data: byAddress, error: addressError } = await supabase
    .from("gym")
    .select("id, osm_id")
    .eq("address", account.gymAddress)
    .limit(1);
  if (addressError) throw addressError;
  if (byAddress && byAddress.length > 0) {
    const gym = byAddress[0] as { id: string; osm_id: string | null };
    if (osmId && !gym.osm_id) {
      // Fill in the missing ID. Skipped quietly if the gym table has no update policy.
      await supabase.from("gym").update({ osm_id: osmId }).eq("id", gym.id);
    }
    return gym.id;
  }

  const id = photoFileId();
  const { error } = await supabase.from("gym").insert({
    id,
    osm_id: osmId,
    name: account.primaryGym,
    address: account.gymAddress,
    latitude: account.gymLatitude,
    longitude: account.gymLongitude,
  });
  if (error) throw error;
  return id;
}

async function replaceRows(table: string, userId: string, rows: Record<string, unknown>[]) {
  const { error: deleteError } = await supabase.from(table).delete().eq("user_id", userId);
  if (deleteError) throw deleteError;
  if (rows.length === 0) return;
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw error;
}

// Writes the profile to user_account and its child tables. The gym goes first
// because user_account points to it, and the user row goes before the rows that point to it.
async function saveProfileTables(userId: string, account: AccountProfile) {
  const homeGymId = await saveGym(account);

  const { error } = await supabase.from("user_account").upsert({
    id: userId,
    full_name: account.fullName,
    birthdate: account.birthDate || null,
    gender: account.gender || null,
    hometown: account.hometown || null,
    zip_code: account.zipCode || null,
    latitude: account.latitude,
    longitude: account.longitude,
    about: account.about || null,
    fitness_level: account.experienceLevel || null,
    home_gym_id: homeGymId,
    bench_lbs: pounds(account.bench),
    squat_lbs: pounds(account.squat),
    deadlift_lbs: pounds(account.deadlift),
    custom_lift_name: account.customLiftName || null,
    custom_lift_lbs: pounds(account.customLift),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;

  await replaceRows(
    "profile_photo",
    userId,
    account.photos.map((path, index) => ({
      photo_id: photoFileId(),
      user_id: userId,
      storage_path: path,
      caption: account.photoCaptions[index] || null,
      sort_order: index + 1,
    })),
  );
  await replaceRows(
    "profile_prompt",
    userId,
    account.prompts.map((item, index) => ({ user_id: userId, prompt: item.prompt, answer: item.answer, sort_order: index + 1 })),
  );
  await replaceRows(
    "user_availability",
    userId,
    account.availabilityDays.flatMap((day) => account.availabilityTimes.map((time) => ({ user_id: userId, day, time_of_day: time }))),
  );
  await replaceRows(
    "user_goal",
    userId,
    account.selectedGoals.map((goal) => ({ user_id: userId, goal })),
  );
}

export async function loadProfile(): Promise<UserProfile | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return profileFromUser(data.user);
}

async function sessionForSave() {
  const current = await supabase.auth.getSession();
  if (!current.data.session) throw new Error("Sign in again before saving your profile.");

  const authed = await supabase.auth.getUser();
  if (!authed.error && authed.data.user) {
    return (await supabase.auth.getSession()).data.session ?? current.data.session;
  }

  const refreshed = await supabase.auth.refreshSession();
  if (refreshed.error || !refreshed.data.session) {
    throw new Error("Sign in again before saving your profile.");
  }
  return refreshed.data.session;
}

export async function saveProfile(profile: UserProfile): Promise<UserProfile> {
  if (profile.photos[0] && profileMediaKind(profile.photos[0], profile.photoMedia[0]) === "video") {
    throw new Error("Choose a photo for the first slot. Videos can go in the other slots.");
  }
  const session = await sessionForSave();
  const birthError = birthDateError(profile.birthDate);
  if (birthError) throw new Error(birthError);
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

  let account: AccountProfile;
  let avatarPath: string | undefined;
  const mediaUploads: string[] = [];
  try {
    const chosen = profile.photos.slice(0, 6);
    for (let index = 0; index < chosen.length; index += 1) {
      const path = await uploadProfileMedia(userId, chosen[index], profile.photoMedia[index] ?? "image");
      uploaded.push(path); mediaUploads.push(path);
    }

    if (profile.avatar && chosen.length > 0) {
      avatarPath = await uploadProfileMedia(userId, profile.avatar, "image");
      mediaUploads.push(avatarPath);
    }
    account = accountProfile(profile, uploaded, location, avatarPath);
    const { error } = await supabase.auth.updateUser({
      data: { profile: account },
    });
    if (error) {
      if (/auth session missing/i.test(error.message)) throw new Error("Sign in again before saving your profile.");
      throw error;
    }
  } catch (error) {
    const freshUploads = mediaUploads.filter((path) => !previous.includes(path));
    if (freshUploads.length > 0) {
      await supabase.storage.from(PHOTO_BUCKET).remove(freshUploads);
    }
    throw error;
  }

  const removed = previous.filter((path) => !mediaUploads.includes(path));
  if (removed.length > 0) {
    await supabase.storage.from(PHOTO_BUCKET).remove(removed);
  }
  clearStoredPhotos(userId);

  // The JSON copy above still drives the app while the screens move over to the tables.
  try {
    await saveProfileTables(userId, account);
  } catch (error) {
    const detail = error instanceof Error ? error.message : (error as { message?: string })?.message ?? "";
    throw new Error(`Your profile was saved, but not to the user_account tables. ${detail}`.trim());
  }

  return { ...profile, ...location, avatar: avatarPath ? publicPhotoUrl(avatarPath) : undefined, photos: uploaded.map(publicPhotoUrl) };
}
