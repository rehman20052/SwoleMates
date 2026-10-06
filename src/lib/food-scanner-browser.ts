// Browser-only capture/recognition helpers. All readers and model assets load on demand.
export function scannerAsset(name: string) {
  return new URL(`${process.env.EXPO_PUBLIC_BASE_PATH || ""}/scanner/${name}`, window.location.origin).href;
}
let barcodeReader: Promise<typeof import("zxing-wasm/reader")> | undefined;
export async function decodeFoodBarcode(image: ImageData | Blob): Promise<string | null> {
  barcodeReader ??= import("zxing-wasm/reader").then(async reader => {
    await reader.prepareZXingModule({ overrides: { locateFile: (file: string) => scannerAsset(file) }, fireImmediately: true });
    return reader;
  }).catch(error => { barcodeReader = undefined; throw error; });
  const reader = await barcodeReader;
  const found = await reader.readBarcodes(image, { formats: ["EAN13", "EAN8", "UPCA", "UPCE", "ITF14"],
    tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, maxNumberOfSymbols: 1 });
  return found.find(result => result.isValid && /^\d{8}$|^\d{12,14}$/.test(result.text))?.text ?? null;
}
export type PhotoCrop = { left: number; top: number; right: number; bottom: number };
export const fullPhoto: PhotoCrop = { left: 0, top: 0, right: 100, bottom: 100 };
export async function labelCanvas(blob: Blob, crop: PhotoCrop = fullPhoto) {
  // HTMLImageElement honors EXIF orientation on iOS, unlike some bitmap implementations.
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const width = image.naturalWidth * (crop.right - crop.left) / 100;
    const height = image.naturalHeight * (crop.bottom - crop.top) / 100;
    const scale = Math.min(3, 2400 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale) + 40; canvas.height = Math.round(height * scale) + 40;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, image.naturalWidth * crop.left / 100, image.naturalHeight * crop.top / 100, width, height, 20, 20, canvas.width - 40, canvas.height - 40);
    return canvas;
  } finally { URL.revokeObjectURL(url); }
}
export function enhanceLabel(original: HTMLCanvasElement) {
  const canvas = document.createElement("canvas"); canvas.width = original.width; canvas.height = original.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(original, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const histogram = new Uint32Array(256);
  for (let i = 0; i < pixels.data.length; i += 4) histogram[Math.round(pixels.data[i] * .299 + pixels.data[i + 1] * .587 + pixels.data[i + 2] * .114)]++;
  const count = pixels.data.length / 4;
  let cumulative = 0, low = 0, high = 255;
  for (let level = 0; level < 256; level++) { cumulative += histogram[level]; if (cumulative <= count * .02) low = level; if (cumulative < count * .98) high = level; }
  const range = Math.max(30, high - low);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const gray = pixels.data[i] * .299 + pixels.data[i + 1] * .587 + pixels.data[i + 2] * .114;
    const value = Math.max(0, Math.min(255, (gray - low) * 255 / range));
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
  }
  ctx.putImageData(pixels, 0, 0); return canvas;
}
export function videoFrame(video: HTMLVideoElement, mode: "barcode" | "label", cropped = true) {
  // Preview uses the natural video ratio, so the visible guide and capture match exactly.
  const width = video.videoWidth, height = video.videoHeight;
  if (!width || !height) throw new Error("Wait for a sharp camera preview, then try again.");
  const cropWidth = cropped ? width * (mode === "barcode" ? .9 : .8) : width;
  const cropHeight = cropped ? height * (mode === "barcode" ? .5 : .76) : height;
  const scale = Math.min(1, 2400 / Math.max(cropWidth, cropHeight));
  const canvas = document.createElement("canvas"); canvas.width = Math.round(cropWidth * scale); canvas.height = Math.round(cropHeight * scale);
  canvas.getContext("2d")!.drawImage(video, (width - cropWidth) / 2, (height - cropHeight) / 2, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
  return canvas;
}
