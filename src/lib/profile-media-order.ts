import type { ProfileMediaKind } from "@/lib/profile";

type MediaOrder = { photos: string[]; photoMedia: ProfileMediaKind[]; photoCaptions: string[] };

export function moveProfileMedia(media: MediaOrder, from: number, to: number): MediaOrder {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= media.photos.length || to >= media.photos.length || from === to) return media;
  const indices = media.photos.map((_, index) => index);
  const [moved] = indices.splice(from, 1);
  indices.splice(to, 0, moved);
  return {
    photos: indices.map((index) => media.photos[index]),
    photoMedia: indices.map((index) => media.photoMedia[index]),
    photoCaptions: indices.map((index) => media.photoCaptions[index]),
  };
}
