import { File, Paths } from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

export async function jpegBytesFromHeic(bytes: Uint8Array) {
  const source = new File(Paths.cache, `profile-heic-${Date.now()}.heic`);
  source.write(bytes);
  const saved = await manipulateAsync(source.uri, [], { compress: 0.85, format: SaveFormat.JPEG });
  return new File(saved.uri).bytes();
}
