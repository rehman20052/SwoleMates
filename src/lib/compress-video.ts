import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
} from "mediabunny";

const AUDIO_BITRATE = 96_000;
const MIN_VIDEO_BITRATE = 120_000;

type EncodePlan = {
  width: number;
  videoBitrate: number;
  withAudio: boolean;
};

function even(value: number) {
  return Math.max(2, Math.round(value / 2) * 2);
}

function fitWidth(displayWidth: number, displayHeight: number, videoBitrate: number) {
  const longEdge = Math.max(displayWidth, displayHeight, 1);
  const cap = videoBitrate >= 2_500_000 ? 1280 : videoBitrate >= 1_000_000 ? 960 : videoBitrate >= 450_000 ? 640 : 480;
  return even(displayWidth * Math.min(1, cap / longEdge));
}

function videoBitrateFor(duration: number, maxBytes: number, withAudio: boolean) {
  const audioBytes = withAudio ? (AUDIO_BITRATE / 8) * duration : 0;
  const budget = maxBytes * 0.9 - audioBytes;
  return Math.floor((budget * 8) / duration);
}

async function inspect(file: Blob) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const duration = await input.computeDuration();
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error("That clip has no video.");
    return {
      duration,
      width: await video.getDisplayWidth(),
      height: await video.getDisplayHeight(),
    };
  } finally {
    input.dispose();
  }
}

function planFor(duration: number, width: number, height: number, maxBytes: number): EncodePlan {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Could not read that clip.");

  let withAudio = true;
  let videoBitrate = videoBitrateFor(duration, maxBytes, true);
  if (videoBitrate < MIN_VIDEO_BITRATE) {
    withAudio = false;
    videoBitrate = videoBitrateFor(duration, maxBytes, false);
  }
  if (videoBitrate < MIN_VIDEO_BITRATE) {
    throw new Error("That clip is too long to fit under 50MB, even after compressing.");
  }

  return { width: fitWidth(width, height, videoBitrate), videoBitrate, withAudio };
}

async function encode(file: Blob, plan: EncodePlan, withAudio: boolean, onProgress?: (progress: number) => void) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });

  try {
    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      showWarnings: false,
      video: {
        codec: "avc",
        width: plan.width,
        frameRate: 30,
        forceTranscode: true,
        quality: new Quality({ bitrate: plan.videoBitrate, bitrateMode: "constant" }),
      },
      audio: withAudio
        ? {
            codec: "aac",
            forceTranscode: true,
            quality: new Quality({ bitrate: AUDIO_BITRATE, bitrateMode: "constant" }),
          }
        : { discard: true },
    });

    const videoKept = conversion.utilizedTracks.some((track) => track.type === "video");
    if (!conversion.isValid || !videoKept) {
      if (videoKept && withAudio) return null;
      throw new Error("This browser couldn't compress that clip.");
    }

    conversion.onProgress = (progress) => onProgress?.(progress);
    await conversion.execute();
    if (!target.buffer) return null;
    return new Blob([target.buffer], { type: "video/mp4" });
  } finally {
    input.dispose();
  }
}

// Re-encodes a clip so the file lands under maxBytes. Throws when the clip is too long to fit.
export async function compressProfileVideo(
  file: Blob,
  maxBytes: number,
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  if (typeof VideoEncoder === "undefined") {
    throw new Error("This browser can't compress clips over 50MB. Try a shorter clip.");
  }

  const probed = await inspect(file);
  const plan = planFor(probed.duration, probed.width, probed.height, maxBytes);
  let compressed = await encode(file, plan, plan.withAudio, onProgress);
  if (!compressed && plan.withAudio) compressed = await encode(file, plan, false, onProgress);
  if (!compressed) throw new Error("This browser couldn't compress that clip.");
  if (compressed.size <= maxBytes) return compressed;

  const tighter: EncodePlan = {
    withAudio: plan.withAudio,
    videoBitrate: Math.max(MIN_VIDEO_BITRATE, Math.floor(plan.videoBitrate * (maxBytes / compressed.size) * 0.85)),
    width: even(plan.width * 0.75),
  };
  let second = await encode(file, tighter, tighter.withAudio, onProgress);
  if (!second && tighter.withAudio) second = await encode(file, tighter, false, onProgress);
  if (!second || second.size > maxBytes) {
    throw new Error("That clip is too long to fit under 50MB, even after compressing.");
  }
  return second;
}

export async function compressedVideoUri(
  source: Blob | string,
  maxBytes: number,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const blob = typeof source === "string" ? await (await fetch(source)).blob() : source;
  const compressed = await compressProfileVideo(blob, maxBytes, onProgress);
  return URL.createObjectURL(compressed);
}
