import { checkMediaSize, MAX_MEDIA_BYTES, videoBitrate, type PreparedVideo, type VideoInput } from "./media-limits";

export async function prepareVideo(
  source: VideoInput,
  onProgress: (progress: number) => void,
  signal: AbortSignal,
): Promise<PreparedVideo> {
  const response = await fetch(source.uri, { signal });
  const blob = await response.blob();
  if (blob.size <= MAX_MEDIA_BYTES) {
    checkMediaSize(blob.size, true);
    return { ...source, release() {} };
  }
  const { Input, BlobSource, ALL_FORMATS, Output, Mp4OutputFormat, BufferTarget, Conversion } = await import("mediabunny");
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  let conversion: Awaited<ReturnType<typeof Conversion.init>> | undefined;
  const cancel = () => { void conversion?.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("This file doesn't contain a readable video.");
    const bitrate = videoBitrate(await input.computeDuration());
    const scale = Math.min(1, 1280 / Math.max(track.displayWidth, track.displayHeight));
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat(), target });
    conversion = await Conversion.init({
      input, output, tracks: "primary",
      video: {
        codec: "avc", bitrate, forceTranscode: true,
        width: Math.max(2, Math.floor(track.displayWidth * scale / 2) * 2),
        height: Math.max(2, Math.floor(track.displayHeight * scale / 2) * 2),
        fit: "contain",
      },
      audio: { codec: "aac", bitrate: 128_000 },
    });
    // Never silently upload a video with its picture or audio removed.
    if (!conversion.isValid || conversion.discardedTracks.some(({ reason }) => reason !== "discarded_by_user")) {
      throw new Error("This browser can't compress this video's format. Try an updated browser or export a smaller MP4 and select it again.");
    }
    if (signal.aborted) throw new Error("Video preparation canceled.");
    conversion.onProgress = onProgress;
    await conversion.execute();
    if (signal.aborted) throw new Error("Video preparation canceled.");
    if (!target.buffer) throw new Error("Couldn't prepare this video. Please try again.");
    checkMediaSize(target.buffer.byteLength, true);
    const uri = URL.createObjectURL(new Blob([target.buffer], { type: "video/mp4" }));
    return { uri, mimeType: "video/mp4", release: () => URL.revokeObjectURL(uri) };
  } finally {
    signal.removeEventListener("abort", cancel);
    try { await conversion?.cancel(); } finally { input.dispose(); }
  }
}
