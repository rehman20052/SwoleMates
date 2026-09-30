export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const TARGET_VIDEO_BYTES = 40 * 1024 * 1024;

export function videoBitrate(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Couldn't read this video's duration. Try exporting it as MP4 first.");
  }
  // Leave room for audio, container overhead and variable bitrate encoders.
  const bitrate = Math.floor((TARGET_VIDEO_BYTES * 8) / durationSeconds - 256_000);
  if (bitrate < 200_000) {
    throw new Error("This video is too long to fit within 50MB at a usable quality. Trim it and try again.");
  }
  return Math.min(2_500_000, bitrate);
}

export function checkMediaSize(size: number, video: boolean) {
  if (!Number.isFinite(size) || size <= 0) throw new Error("Couldn't read this file. Choose it again.");
  if (size > MAX_MEDIA_BYTES) {
    throw new Error(video
      ? "This video is still over 50MB after compression. Trim it or export at a lower resolution and try again."
      : "This photo is over 50MB. Choose a smaller photo.");
  }
}

export type PreparedVideo = { uri: string; mimeType?: string; release: () => void };
export type VideoInput = { uri: string; mimeType?: string };
