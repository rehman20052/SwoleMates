import { checkMediaSize } from "./media-limits";

export async function readMediaBytes(uri: string, video: boolean): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  const blob = await response.blob();
  checkMediaSize(blob.size, video);
  return blob.arrayBuffer();
}
