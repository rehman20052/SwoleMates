import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";
import { readMediaBytes } from "./media-bytes";
import { supabase } from "./supabase";
import type { ItemArtwork } from "./item-artwork";

export type ArtworkDraft = ItemArtwork | { kind: "local"; uri: string } | undefined;
export async function pickArtworkPhoto(): Promise<string | null> {
  // Safari must open the picker directly from the tap, without a permission await.
  if (Platform.OS !== "web") {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error("Allow photo access to choose an image.");
  }
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible });
  return picked.canceled ? null : picked.assets[0]?.uri ?? null;
}
export async function saveArtworkPhoto(draft: ArtworkDraft): Promise<ItemArtwork | undefined> {
  if (!draft || draft.kind !== "local") return draft;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sign in again to save your image.");
  const photo = await manipulateAsync(draft.uri, [{ resize: { width: 480 } }], { format: SaveFormat.JPEG, compress: 0.75 });
  const bytes = await readMediaBytes(photo.uri, false);
  if (bytes.byteLength > 2 * 1024 * 1024) throw new Error("Choose a smaller image under 2MB.");
  const path = `${data.user.id}/item-artwork/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  const uploaded = await supabase.storage.from("profile-photos").upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (uploaded.error) throw new Error("Your image could not upload. Try again or use an automatic image.");
  return { kind: "photo", path };
}
export function artworkPhotoUrl(artwork?: ArtworkDraft): string | undefined {
  if (artwork?.kind === "local") return artwork.uri;
  if (artwork?.kind === "photo") return supabase.storage.from("profile-photos").getPublicUrl(artwork.path).data.publicUrl;
  return undefined;
}
