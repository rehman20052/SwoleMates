const heicName = /\.(heic|heif)(\?|#|$)/i;
const heicBrands = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heim", "heis"]);
const storageObjectMarker = "/storage/v1/object/";

export function isHeicMedia(uri: string, mime = "") {
  if (/heic|heif/i.test(mime)) return true;
  return heicName.test(uri);
}

export function looksLikeHeic(bytes: Uint8Array, mime = "", uri = "") {
  if (isHeicMedia(uri, mime)) return true;
  if (bytes.byteLength < 12) return false;
  const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  return heicBrands.has(brand);
}

// Desktop browsers cannot paint an iPhone HEIC file. Supabase can render that same file as a JPEG.
export function renderJpegUrl(uri: string) {
  const index = uri.indexOf(storageObjectMarker);
  if (index < 0) return null;
  const path = uri.slice(index + storageObjectMarker.length).split("?")[0];
  if (!path) return null;
  return `${uri.slice(0, index)}/storage/v1/render/image/${path}?quality=85`;
}

export function photoDisplayUri(uri: string) {
  if (!isHeicMedia(uri)) return uri;
  return renderJpegUrl(uri) ?? uri;
}
