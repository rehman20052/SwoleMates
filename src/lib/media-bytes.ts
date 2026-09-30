import { File } from "expo-file-system";
import { checkMediaSize } from "./media-limits";

export async function readMediaBytes(uri: string, video: boolean): Promise<ArrayBuffer> {
  const file = new File(uri);
  checkMediaSize(file.size, video);
  return file.arrayBuffer();
}
