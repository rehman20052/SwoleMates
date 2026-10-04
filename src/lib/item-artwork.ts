// Only small image references belong in the account JSON; image bytes stay in Storage.
export type ItemArtwork = { kind: "preset"; key: string } | { kind: "photo"; path: string };

export function validItemArtwork(value: unknown): value is ItemArtwork | undefined {
  if (value === undefined) return true;
  if (!value || typeof value !== "object") return false;
  const art = value as ItemArtwork;
  return art.kind === "preset" ? typeof art.key === "string" && /^[a-z-]{1,40}$/.test(art.key)
    : art.kind === "photo" && typeof art.path === "string" && /^[a-f\d-]{36}\/item-artwork\/[a-z\d-]+\.jpg$/i.test(art.path);
}
