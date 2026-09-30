import { File } from "expo-file-system";
import { checkMediaSize, MAX_MEDIA_BYTES, videoBitrate, type PreparedVideo, type VideoInput } from "./media-limits";

export async function prepareVideo(
  source: VideoInput,
  onProgress: (progress: number) => void,
  signal: AbortSignal,
): Promise<PreparedVideo> {
  const original = new File(source.uri);
  if (original.size <= MAX_MEDIA_BYTES) {
    checkMediaSize(original.size, true);
    return { ...source, release() {} };
  }
  // Load only when needed so small uploads continue to work in Expo Go.
  let compressor: typeof import("react-native-compressor");
  try {
    compressor = await import("react-native-compressor");
  } catch {
    throw new Error("Video compression isn't available in this app build. Use an updated SwoleMates build, or choose a video under 50MB.");
  }
  const { Video, getVideoMetaData } = compressor;
  const metadata = await getVideoMetaData(source.uri);
  const bitrate = videoBitrate(metadata.duration);
  let cancellationId: string | undefined;
  const cancel = () => { if (cancellationId) Video.cancelCompression(cancellationId); };
  signal.addEventListener("abort", cancel);
  let output: File | undefined;
  try {
    if (signal.aborted) throw new Error("Video preparation canceled.");
    const uri = await Video.compress(source.uri, {
      compressionMethod: "manual",
      maxSize: 1280,
      bitrate,
      minimumFileSizeForCompress: 0,
      getCancellationId(id) {
        cancellationId = id;
        if (signal.aborted) cancel();
      },
    }, onProgress);
    if (uri === source.uri) throw new Error("Couldn't compress this video. Export it at a lower resolution and try again.");
    output = new File(uri);
    if (signal.aborted) throw new Error("Video preparation canceled.");
    checkMediaSize(output.size, true);
    const compressed = output;
    return { uri, mimeType: "video/mp4", release() { try { compressed.delete(); } catch { /* Already removed. */ } } };
  } catch (error) {
    try { output?.delete(); } catch { /* Cache cleanup is best effort. */ }
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
