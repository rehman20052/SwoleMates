import { File, Paths } from "expo-file-system";

import { compressOnDevice } from "@/lib/device-compress";

async function writeBlob(blob: Blob) {
  const file = new File(Paths.cache, `profile-in-${Date.now()}.mp4`);
  file.write(new Uint8Array(await blob.arrayBuffer()));
  return file.uri;
}

export async function compressedVideoUri(source: Blob | string, maxBytes: number, onProgress?: (progress: number) => void) {
  const uri = typeof source === "string" ? source : await writeBlob(source);
  return compressOnDevice(uri, maxBytes, onProgress);
}

export async function compressProfileVideo(file: Blob, maxBytes: number, onProgress?: (progress: number) => void) {
  const uri = await compressedVideoUri(file, maxBytes, onProgress);
  const bytes = await new File(uri).bytes();
  return new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: "video/mp4" });
}
