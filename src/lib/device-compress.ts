import { File, FileMode, Paths, type FileHandle } from "expo-file-system";

const MEDIABUNNY_URL = "https://cdn.jsdelivr.net/npm/mediabunny@1.61.0/dist/bundles/mediabunny.min.mjs";

export const COMPRESSOR_HTML = `<!DOCTYPE html>
<html>
<body>
<script type="module">
import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, Quality } from ${JSON.stringify(MEDIABUNNY_URL)};

const AUDIO_BITRATE = 96000;
const MIN_VIDEO_BITRATE = 120000;
const incoming = [];

function post(message) {
  window.ReactNativeWebView.postMessage(JSON.stringify(message));
}

function even(value) {
  return Math.max(2, Math.round(value / 2) * 2);
}

function fitWidth(displayWidth, displayHeight, videoBitrate) {
  const longEdge = Math.max(displayWidth, displayHeight, 1);
  const cap = videoBitrate >= 2500000 ? 1280 : videoBitrate >= 1000000 ? 960 : videoBitrate >= 450000 ? 640 : 480;
  return even(displayWidth * Math.min(1, cap / longEdge));
}

function videoBitrateFor(duration, maxBytes, withAudio) {
  const audioBytes = withAudio ? (AUDIO_BITRATE / 8) * duration : 0;
  return Math.floor(((maxBytes * 0.9 - audioBytes) * 8) / duration);
}

function planFor(duration, width, height, maxBytes) {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Could not read that clip.");
  let withAudio = true;
  let videoBitrate = videoBitrateFor(duration, maxBytes, true);
  if (videoBitrate < MIN_VIDEO_BITRATE) {
    withAudio = false;
    videoBitrate = videoBitrateFor(duration, maxBytes, false);
  }
  if (videoBitrate < MIN_VIDEO_BITRATE) throw new Error("That clip is too long to fit under 50MB, even after compressing.");
  return { width: fitWidth(width, height, videoBitrate), videoBitrate, withAudio };
}

async function inspect(file) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const duration = await input.computeDuration();
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error("That clip has no video.");
    return { duration, width: await video.getDisplayWidth(), height: await video.getDisplayHeight() };
  } finally {
    input.dispose();
  }
}

async function encode(file, plan, withAudio, onProgress) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
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
        ? { codec: "aac", forceTranscode: true, quality: new Quality({ bitrate: AUDIO_BITRATE, bitrateMode: "constant" }) }
        : { discard: true },
    });
    const videoKept = conversion.utilizedTracks.some((track) => track.type === "video");
    if (!conversion.isValid || !videoKept) {
      if (videoKept && withAudio) return null;
      throw new Error("This phone couldn't compress that clip.");
    }
    conversion.onProgress = (progress) => onProgress(progress);
    await conversion.execute();
    if (!target.buffer) return null;
    return new Blob([target.buffer], { type: "video/mp4" });
  } finally {
    input.dispose();
  }
}

async function compress(file, maxBytes, onProgress) {
  if (typeof VideoEncoder === "undefined") throw new Error("This phone couldn't compress that clip. Try a shorter one.");
  const probed = await inspect(file);
  const plan = planFor(probed.duration, probed.width, probed.height, maxBytes);
  let compressed = await encode(file, plan, plan.withAudio, onProgress);
  if (!compressed && plan.withAudio) compressed = await encode(file, plan, false, onProgress);
  if (!compressed) throw new Error("This phone couldn't compress that clip.");
  if (compressed.size <= maxBytes) return compressed;
  const tighter = {
    withAudio: plan.withAudio,
    videoBitrate: Math.max(MIN_VIDEO_BITRATE, Math.floor(plan.videoBitrate * (maxBytes / compressed.size) * 0.85)),
    width: even(plan.width * 0.75),
  };
  let second = await encode(file, tighter, tighter.withAudio, onProgress);
  if (!second && tighter.withAudio) second = await encode(file, tighter, false, onProgress);
  if (!second || second.size > maxBytes) throw new Error("That clip is too long to fit under 50MB, even after compressing.");
  return second;
}

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function toBase64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += alphabet[(triple >> 18) & 63];
    out += alphabet[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? alphabet[triple & 63] : "=";
  }
  return out;
}

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

globalThis.resetChunks = () => {
  incoming.length = 0;
  post({ type: "ack" });
};

globalThis.addChunk = (data) => {
  incoming.push(fromBase64(data));
  post({ type: "ack" });
};

globalThis.finishChunks = async (maxBytes) => {
  try {
    let total = 0;
    for (const part of incoming) total += part.length;
    const all = new Uint8Array(total);
    let offset = 0;
    for (const part of incoming) {
      all.set(part, offset);
      offset += part.length;
    }
    incoming.length = 0;
    const compressed = await compress(new Blob([all], { type: "video/mp4" }), maxBytes, (progress) => post({ type: "progress", progress }));
    const bytes = new Uint8Array(await compressed.arrayBuffer());
    post({ type: "start", size: bytes.byteLength });
    const step = 96 * 1024;
    for (let index = 0; index < bytes.byteLength; index += step) {
      post({ type: "chunk", data: toBase64(bytes.subarray(index, index + step)) });
    }
    post({ type: "done" });
  } catch (error) {
    incoming.length = 0;
    post({ type: "error", message: error && error.message ? error.message : "Couldn't compress that clip." });
  }
};

post({ type: "ready" });
</script>
</body>
</html>`;

type Session = {
  resolve: (uri: string) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: number) => void;
  output: File | null;
  handle: FileHandle | null;
  written: number;
  ack: (() => void) | null;
  settled: boolean;
};

let injectJs: ((code: string) => void) | null = null;
let pageReady = false;
let session: Session | null = null;
const readyWaiters: Array<() => void> = [];
const injectWaiters: Array<() => void> = [];

export function bindCompressor(inject: ((code: string) => void) | null) {
  injectJs = inject;
  if (inject) {
    const waiting = injectWaiters.splice(0);
    for (const wake of waiting) wake();
  }
}

export function markCompressorReady() {
  pageReady = true;
  const waiting = readyWaiters.splice(0);
  for (const wake of waiting) wake();
}

export function markCompressorReset() {
  pageReady = false;
}

function fail(error: Error) {
  if (!session || session.settled) return;
  session.settled = true;
  try {
    session.handle?.close();
  } catch {
    // The handle is already closed.
  }
  if (session.output?.exists) {
    try {
      session.output.delete();
    } catch {
      // A partial file can stay in the cache.
    }
  }
  const reject = session.reject;
  session = null;
  reject(error);
}

function fromBase64(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = value.replace(/[^A-Za-z0-9+/]/g, "");
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const char of clean) {
    buffer = (buffer << 6) | alphabet.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[index] = (buffer >> bits) & 0xff;
      index += 1;
    }
  }
  return bytes.slice(0, index);
}

function toBase64(bytes: Uint8Array) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += alphabet[(triple >> 18) & 63];
    out += alphabet[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? alphabet[triple & 63] : "=";
  }
  return out;
}

export function handleCompressorMessage(raw: string) {
  let message: { type?: string; progress?: number; data?: string; message?: string };
  try {
    message = JSON.parse(raw) as { type?: string; progress?: number; data?: string; message?: string };
  } catch {
    return;
  }
  if (message.type === "ready") {
    markCompressorReady();
    return;
  }
  if (!session || session.settled) return;
  if (message.type === "ack") {
    session.ack?.();
    session.ack = null;
    return;
  }
  if (message.type === "progress" && typeof message.progress === "number") {
    session.onProgress?.(0.15 + Math.min(1, message.progress) * 0.85);
    return;
  }
  if (message.type === "start") {
    const output = new File(Paths.cache, `profile-clip-${Date.now()}.mp4`);
    if (output.exists) output.delete();
    output.create();
    session.output = output;
    session.handle = output.open(FileMode.Truncate);
    session.written = 0;
    return;
  }
  if (message.type === "chunk" && message.data && session.handle) {
    const bytes = fromBase64(message.data);
    session.handle.offset = session.written;
    session.handle.writeBytes(bytes);
    session.written += bytes.length;
    return;
  }
  if (message.type === "done" && session.output) {
    session.settled = true;
    try {
      session.handle?.close();
    } catch {
      // Already closed.
    }
    const resolve = session.resolve;
    const uri = session.output.uri;
    session = null;
    resolve(uri);
    return;
  }
  if (message.type === "error") {
    const wake = session.ack;
    fail(new Error(message.message || "Couldn't compress that clip."));
    wake?.();
  }
}

function run(code: string) {
  if (!injectJs) throw new Error("Reload the app, then add the clip again.");
  injectJs(`${code};true;`);
}

async function whenReady() {
  if (!injectJs) {
    await new Promise<void>((resolve) => {
      injectWaiters.push(resolve);
    });
  }
  if (pageReady) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Couldn't start clip compression. Check your connection and try again.")), 30000);
    readyWaiters.push(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function openSource(uri: string) {
  try {
    return new File(uri).open(FileMode.ReadOnly);
  } catch {
    const copy = new File(Paths.cache, `profile-src-${Date.now()}.mp4`);
    await new File(uri).copy(copy);
    return copy.open(FileMode.ReadOnly);
  }
}

function waitForAck() {
  return new Promise<void>((resolve, reject) => {
    if (!session || session.settled) {
      reject(new Error("Couldn't compress that clip."));
      return;
    }
    const timer = setTimeout(() => reject(new Error("Couldn't compress that clip.")), 20000);
    session.ack = () => {
      clearTimeout(timer);
      resolve();
    };
  });
}

async function pump(uri: string, maxBytes: number) {
  await whenReady();
  session?.onProgress?.(0);
  const reset = waitForAck();
  run("globalThis.resetChunks()");
  await reset;

  const total = new File(uri).size || 1;
  const handle = await openSource(uri);
  let sent = 0;
  try {
    for (;;) {
      let chunk: Uint8Array;
      try {
        chunk = handle.readBytes(128 * 1024);
      } catch (error) {
        if (sent > 0) break;
        throw error;
      }
      if (!chunk.length) break;
      sent += chunk.length;
      session?.onProgress?.(Math.min(0.15, (sent / total) * 0.15));
      const encoded = toBase64(chunk);
      const ack = waitForAck();
      run(`globalThis.addChunk(${JSON.stringify(encoded)})`);
      await ack;
    }
  } finally {
    try {
      handle.close();
    } catch {
      // Already closed.
    }
  }
  if (!session || session.settled) return;
  if (sent === 0) throw new Error("Could not read that clip.");
  run(`globalThis.finishChunks(${maxBytes})`);
}

export function compressOnDevice(uri: string, maxBytes: number, onProgress?: (progress: number) => void) {
  if (session) return Promise.reject(new Error("Wait for the current clip to finish compressing."));
  return new Promise<string>((resolve, reject) => {
    session = { resolve, reject, onProgress, output: null, handle: null, written: 0, ack: null, settled: false };
    void pump(uri, maxBytes).catch((error) => {
      fail(error instanceof Error ? error : new Error("Couldn't compress that clip."));
    });
  });
}
