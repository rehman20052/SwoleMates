import * as ImagePicker from "expo-image-picker";

import { compressedVideoUri } from "@/lib/compress-video";
import { localFileSize } from "@/lib/local-file";
import { MAX_PROFILE_MEDIA_BYTES, rememberPickedMime, type ProfileMediaKind } from "@/lib/profile";

export type PickedProfileMedia = {
  uri: string;
  kind: ProfileMediaKind;
  mimeType?: string;
};

export async function pickProfileMedia(options?: {
  photosOnly?: boolean;
  onCompressProgress?: (progress: number) => void;
}): Promise<PickedProfileMedia | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Allow photo access to add a profile picture or clip.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: options?.photosOnly ? ["images"] : ["images", "videos"],
    quality: 0.8,
    // iPhone photos are HEIC and clips are often HEVC. Compatible asks iOS to hand back JPEG and H.264.
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const kind: ProfileMediaKind = asset.type === "video" ? "video" : "image";
  if (options?.photosOnly && kind !== "image") throw new Error("The first slot must be a photo.");
  const knownSize = asset.fileSize || asset.file?.size || (kind === "video" ? localFileSize(asset.uri) : 0);
  if (kind === "image" && knownSize > MAX_PROFILE_MEDIA_BYTES) {
    throw new Error("Photos must be under 50MB.");
  }
  if (kind === "video" && !knownSize && (asset.uri.startsWith("blob:") || asset.uri.startsWith("http"))) {
    const blob = await (await fetch(asset.uri)).blob();
    if (blob.size > MAX_PROFILE_MEDIA_BYTES) {
      options?.onCompressProgress?.(0);
      const uri = await compressedVideoUri(blob, MAX_PROFILE_MEDIA_BYTES, options?.onCompressProgress);
      rememberPickedMime(uri, "video/mp4");
      return { uri, kind: "video", mimeType: "video/mp4" };
    }
  }
  if (kind === "video" && knownSize > MAX_PROFILE_MEDIA_BYTES) {
    options?.onCompressProgress?.(0);
    const uri = await compressedVideoUri(asset.file ?? asset.uri, MAX_PROFILE_MEDIA_BYTES, options?.onCompressProgress);
    rememberPickedMime(uri, "video/mp4");
    return { uri, kind: "video", mimeType: "video/mp4" };
  }
  rememberPickedMime(asset.uri, asset.mimeType ?? undefined);
  return { uri: asset.uri, kind, mimeType: asset.mimeType ?? undefined };
}
