import { File } from "expo-file-system";

export function localFileSize(uri: string) {
  try {
    return new File(uri).size;
  } catch {
    return 0;
  }
}

function mimeFor(uri: string) {
  const path = uri.split("?")[0].toLowerCase();
  if (path.endsWith(".mp4")) return "video/mp4";
  if (path.endsWith(".mov")) return "video/quicktime";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".heic")) return "image/heic";
  return "image/jpeg";
}

export async function readLocalBytes(uri: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (/^(https?:|blob:|data:)/.test(uri)) return null;
  const bytes = await new File(uri).bytes();
  return { bytes, mime: mimeFor(uri) };
}
