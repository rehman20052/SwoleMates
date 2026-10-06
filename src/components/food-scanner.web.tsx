import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { Worker } from "tesseract.js";
import { AppText, Field, Input, PrimaryButton, ScrollBody, SecondaryButton } from "./ui";
import { ingredientTotals, lookupBarcode, nutritionKeys, parseNutritionLabel, scannedIngredient, type ScanIngredient, type ScannedFood } from "@/lib/food-scanner";
import { decodeFoodBarcode, enhanceLabel, fullPhoto, labelCanvas, scannerAsset, videoFrame, type PhotoCrop } from "@/lib/food-scanner-browser";
import { useAppTheme } from "@/theme";

type Props = {
  initialIngredients?: ScanIngredient[];
  onChange?: (items: ScanIngredient[]) => void;
  onUse: (food: ScannedFood, items: ScanIngredient[]) => void;
  onClose: () => void;
};
const labels = { calories: "Calories", protein: "Protein (g)", carbs: "Carbs (g)", fats: "Fat (g)" };

export function FoodScanner({ initialIngredients = [], onChange, onUse, onClose }: Props) {
  const theme = useAppTheme();
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const loop = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const worker = useRef<Worker | null>(null);
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const readingJob = useRef<number | null>(null);
  const itemsRef = useRef(initialIngredients);
  const [items, setItems] = useState(initialIngredients);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [servingItem, setServingItem] = useState<string | null>(null);
  const [mode, setMode] = useState<"barcode" | "label">("barcode");
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [barcode, setBarcode] = useState("");
  const [torch, setTorch] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [zoom, setZoom] = useState<{ min: number; max: number; value: number } | null>(null);
  const [lastLabel, setLastLabel] = useState<Blob | null>(null);
  const [labelPreview, setLabelPreview] = useState("");
  const [crop, setCrop] = useState<PhotoCrop>(fullPhoto);
  const [showCrop, setShowCrop] = useState(false);
  const replaceLabel = useRef<string | null>(null);
  const totals = ingredientTotals(items);

  useEffect(() => {
    if (!lastLabel) { setLabelPreview(""); return; }
    const url = URL.createObjectURL(lastLabel); setLabelPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [lastLabel]);
  function change(next: ScanIngredient[]) { itemsRef.current = next; setItems(next); onChange?.(next); }
  function edit(id: string, patch: Partial<ScanIngredient>) { change(itemsRef.current.map(item => item.id === id ? { ...item, ...patch } : item)); }
  function stopCamera() {
    clearTimeout(loop.current);
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCamera(false); setHasTorch(false); setTorch(false); setZoom(null);
  }
  function cancel(dispose = false) {
    readingJob.current = null;
    generation.current++; abort.current?.abort(); stopCamera();
    // Keep the warm reader between successful scans. Interrupted jobs must be terminated.
    if ((busy || dispose) && worker.current) { void worker.current.terminate(); worker.current = null; }
    setBusy(false); setStatus("");
  }
  useEffect(() => {
    const suspend = () => { if (document.hidden) cancel(true); };
    document.addEventListener("visibilitychange", suspend);
    return () => { cancel(true); document.removeEventListener("visibilitychange", suspend); };
  }, []);
  function append(food: ScannedFood, replace?: string | null) {
    if (itemsRef.current.length >= 100 && !replace) throw new Error("This list is full. Use these ingredients before starting another list.");
    const item = scannedIngredient(food);
    const old = replace ? itemsRef.current.find(entry => entry.id === replace) : null;
    if (old) { item.id = old.id; item.name = old.name; item.servings = old.servings; }
    change(old ? itemsRef.current.map(entry => entry.id === old.id ? item : entry) : [...itemsRef.current, item]);
    setExpanded(item.id); setServingItem(null);
    setNotice(nutritionKeys.some(key => food[key] === null) ? "Added to your list. Fill the missing values before using the total." : "Added to your list. Check the values and adjust servings, or scan the next item.");
    setError(""); setStatus("");
  }
  async function lookup(code: string) {
    stopCamera(); const current = ++generation.current;
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setBusy(true); setError(""); setNotice(""); setStatus("Looking up product...");
    try { const food = await lookupBarcode(code.trim(), controller.signal); if (current === generation.current) { append(food); setBarcode(""); } }
    catch (err) { if (current === generation.current) setError(controller.signal.aborted ? "Lookup timed out. Try again or take a nutrition-label photo." : err instanceof Error ? err.message : "Could not look up this product."); }
    finally { clearTimeout(timeout); if (current === generation.current) { setBusy(false); setStatus(""); } }
  }
  async function readLabel(image: Blob, area: PhotoCrop = fullPhoto, replacing: string | null = null) {
    stopCamera(); const current = ++generation.current;
    readingJob.current = current;
    const timeout = setTimeout(() => {
      if (current !== generation.current) return;
      generation.current++;
      readingJob.current = null;
      if (worker.current) void worker.current.terminate(); worker.current = null;
      setBusy(false); setStatus(""); setError("Label reading timed out. Crop to just the nutrition table and retry, or enter the values manually.");
    }, 90000);
    setBusy(true); setError(""); setNotice(""); setLastLabel(image); setCrop(area);
    setStatus(worker.current ? "Reading label..." : "Preparing label reader for first use...");
    try {
      const [{ createWorker, PSM }, original] = await Promise.all([import("tesseract.js"), labelCanvas(image, area)]);
      if (current !== generation.current) return;
      let reader = worker.current;
      if (!reader) {
        reader = await createWorker("eng", 1, { workerPath: scannerAsset("worker.min.js"), corePath: scannerAsset(""), langPath: scannerAsset(""), workerBlobURL: false,
          logger: event => { if (readingJob.current === generation.current && event.status === "recognizing text") setStatus(`Reading label ${Math.round(event.progress * 100)}%`); } });
        if (current !== generation.current) { await reader.terminate(); return; }
        worker.current = reader;
      }
      await reader.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: "1", user_defined_dpi: "300" });
      const output = await reader.recognize(original, { rotateAuto: true });
      if (current !== generation.current) return;
      let food = parseNutritionLabel(output.data.text);
      if (nutritionKeys.some(key => food[key] === null) || output.data.confidence < 75) {
        setStatus("Checking harder-to-read values...");
        await reader.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        const second = await reader.recognize(enhanceLabel(original), { rotateAuto: true });
        if (current !== generation.current) return;
        const alternative = parseNutritionLabel(second.data.text);
        const count = (entry: ScannedFood) => nutritionKeys.filter(key => entry[key] !== null).length;
        // Different passes may interpret table columns differently. Do not mix bases.
        if (food.basis === alternative.basis) {
          for (const key of nutritionKeys) if (food[key] === null) food[key] = alternative[key];
        } else if (count(alternative) > count(food)) food = alternative;
      }
      if (nutritionKeys.every(key => food[key] === null)) throw new Error("No nutrition values were readable. Crop to the nutrition table below, or take a sharper photo without glare.");
      append(food, replacing); replaceLabel.current = replacing ?? itemsRef.current[itemsRef.current.length - 1]?.id ?? null; setShowCrop(false);
    } catch (err) {
      if (current === generation.current) { setError(err instanceof Error ? err.message : "Could not read this label. Try a clearer photo."); setShowCrop(true); }
    } finally { clearTimeout(timeout); if (current === generation.current) { readingJob.current = null; setBusy(false); setStatus(""); } }
  }
  async function startCamera() {
    cancel(); const current = generation.current;
    setError(""); setNotice(""); setStatus("Opening camera...");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access needs HTTPS. Use a photo below, or open the published app.");
      const feed = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      if (current !== generation.current) { feed.getTracks().forEach(track => track.stop()); return; }
      stream.current = feed;
      const track = feed.getVideoTracks()[0];
      const caps = track.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean; focusMode?: string[]; zoom?: { min: number; max: number } };
      if (caps?.focusMode?.includes("continuous")) await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => undefined);
      if (current !== generation.current) return;
      setHasTorch(Boolean(caps?.torch));
      if (caps?.zoom && caps.zoom.max > caps.zoom.min) setZoom({ ...caps.zoom, value: (track.getSettings() as MediaTrackSettings & { zoom?: number }).zoom ?? caps.zoom.min });
      setCamera(true); setStatus("Keep the entire barcode inside the frame. Move back slightly if blurry.");
      if (!video.current) throw new Error("Camera preview unavailable. Try taking a photo instead.");
      video.current.srcObject = feed; await video.current.play();
      if (current !== generation.current) return;
      let attempts = 0;
      const scan = async () => {
        if (current !== generation.current || !video.current || !stream.current) return;
        try {
          const frame = videoFrame(video.current, "barcode", ++attempts % 3 !== 0);
          const code = await decodeFoodBarcode(frame.getContext("2d")!.getImageData(0, 0, frame.width, frame.height));
          if (current !== generation.current) return;
          if (code) { void lookup(code); return; }
        } catch (err) {
          if (current !== generation.current) return;
          if (attempts > 3 && err instanceof Error && /fetch|wasm|module/i.test(err.message)) { stopCamera(); setStatus(""); setError("The barcode reader could not load. Check your connection, then retry or enter the barcode digits."); return; }
        }
        if (current === generation.current) loop.current = setTimeout(() => void scan(), 250);
      };
      void scan();
    } catch (err) {
      if (current !== generation.current) return;
      stopCamera(); setStatus("");
      setError(err instanceof DOMException && err.name === "NotAllowedError" ? "Camera permission was denied. Allow camera access in Safari settings, or choose a photo below." : err instanceof Error ? err.message : "Could not open the camera.");
    }
  }
  async function cameraSetting(setting: "torch" | "zoom", value: boolean | number) {
    const track = stream.current?.getVideoTracks()[0]; if (!track) return;
    try { await track.applyConstraints({ advanced: [{ [setting]: value } as MediaTrackConstraintSet] }); if (setting === "torch") setTorch(Boolean(value)); else setZoom(current => current ? { ...current, value: Number(value) } : null); }
    catch { setError("This camera cannot change that setting. Try a closer photo with better lighting."); }
  }
  async function photo(image: File) {
    if (!image.type.startsWith("image/")) { setError("Choose a photo of the barcode or nutrition label."); return; }
    if (image.size > 25 * 1024 * 1024) { setError("Choose a photo smaller than 25 MB."); return; }
    if (mode === "label") { replaceLabel.current = null; void readLabel(image); return; }
    const current = ++generation.current;
    stopCamera(); setBusy(true); setError(""); setNotice(""); setStatus("Reading barcode...");
    try {
      const code = await decodeFoodBarcode(image);
      if (current !== generation.current) return;
      if (!code) throw new Error("No readable barcode found. Take a sharper photo showing the entire barcode and white margins, type its digits, or use the nutrition label.");
      await lookup(code);
    } catch (err) { if (current === generation.current) setError(err instanceof Error ? err.message : "Could not read this barcode."); }
    finally { if (current === generation.current) { setBusy(false); setStatus(""); } }
  }
  const summary = (item: ScanIngredient) => {
    const total = ingredientTotals([item]);
    return `${total.calories ?? "?"} cal · ${total.protein ?? "?"}g protein · ${total.carbs ?? "?"}g carbs · ${total.fats ?? "?"}g fat`;
  };
  function revealNutritionField(event: { target: unknown }) {
    const field = event.target as unknown as HTMLElement;
    const reveal = () => {
      const root = document.getElementById("food-scanner-scroll");
      if (!root || !field?.getBoundingClientRect) return;
      const candidates = [root, ...Array.from(root.querySelectorAll<HTMLElement>("div"))];
      const scroller = candidates.find(node => node.scrollHeight > node.clientHeight + 2 && ["auto", "scroll"].includes(getComputedStyle(node).overflowY));
      if (!scroller) return;
      const fieldBox = field.getBoundingClientRect();
      const scrollBox = scroller.getBoundingClientRect();
      const viewportBottom = (window.visualViewport?.offsetTop ?? 0) + (window.visualViewport?.height ?? window.innerHeight);
      const visibleBottom = Math.min(scrollBox.bottom, viewportBottom) - 28;
      if (fieldBox.bottom > visibleBottom) scroller.scrollTo({ top: scroller.scrollTop + fieldBox.bottom - visibleBottom, behavior: "smooth" });
    };
    window.setTimeout(reveal, 100);
    window.setTimeout(reveal, 380);
  }
  return <View style={{ flex: 1 }}>
    <View style={{ paddingHorizontal: 18, paddingBottom: 10, gap: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><AppText size={23} weight="black">Scan ingredients</AppText><SecondaryButton onPress={() => { cancel(true); onClose(); }}>Close scanner</SecondaryButton></View>
      <View accessibilityLabel="Scanned ingredient totals" style={{ padding: 10, borderRadius: 16, backgroundColor: theme.colors.primaryTint, borderColor: theme.colors.border, borderWidth: 1, gap: 2 }}>
        <AppText size={12} weight="bold">{items.length} {items.length === 1 ? "ingredient" : "ingredients"} · total for this list</AppText>
        <AppText size={21} weight="black">{totals.calories ?? "—"} cal</AppText>
        <AppText size={12}>{totals.protein ?? "—"}g protein · {totals.carbs ?? "—"}g carbs · {totals.fats ?? "—"}g fat</AppText>
      </View>
    </View>
    <View style={{ paddingHorizontal: 18, gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {(["barcode", "label"] as const).map(option => <SecondaryButton key={option} disabled={busy} style={{ flex: 1, backgroundColor: mode === option ? theme.colors.primaryTint : theme.colors.surface }} onPress={() => { cancel(); setMode(option); setError(""); setNotice(""); }}>{option === "barcode" ? "Barcode" : "Nutrition photo"}</SecondaryButton>)}
      </View>
      <AppText size={12} muted>{mode === "barcode" ? "Scan a product, adjust its servings, then scan the next ingredient." : "Take a clear photo of the complete nutrition table. We’ll read it and add the values for you."}</AppText>
      <div style={{ position: "relative", display: camera ? "block" : "none", height: "min(38dvh, 340px)", minHeight: 260, borderRadius: 20, overflow: "hidden", background: "#080a08" }}>
        <video ref={video} muted playsInline autoPlay aria-label="Food scanner camera preview" style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }} />
        <div aria-hidden style={{ position: "absolute", pointerEvents: "none", left: "5%", right: "5%", top: "25%", bottom: "25%", border: "2px solid #C6FF00", borderRadius: 12, boxShadow: "0 0 0 999px rgba(0,0,0,.25)" }} />
      </div>
      {camera ? <>
        <View style={{ flexDirection: "row", gap: 8 }}>{hasTorch ? <SecondaryButton style={{ flex: 1 }} onPress={() => void cameraSetting("torch", !torch)}>{torch ? "Light off" : "Light on"}</SecondaryButton> : null}{zoom ? <label style={{ flex: 1, color: theme.colors.text, fontSize: 12 }}>Zoom<input type="range" aria-label="Camera zoom" min={zoom.min} max={Math.max(zoom.min, Math.min(zoom.max, 4))} step="0.1" value={zoom.value} onChange={event => void cameraSetting("zoom", Number(event.target.value))} style={{ width: "100%" }} /></label> : null}<SecondaryButton style={{ flex: 1 }} onPress={() => { generation.current++; stopCamera(); setStatus(""); }}>Stop camera</SecondaryButton></View>
      </> : <PrimaryButton disabled={busy || items.length >= 100} onPress={() => mode === "label" ? file.current?.click() : void startCamera()}>{mode === "label" ? "Take nutrition label photo" : items.length ? "Scan next ingredient" : "Open camera"}</PrimaryButton>}
      {mode === "label" ? <AppText size={10} muted>Use bright, even light and keep the entire table in focus. You can correct any value after it is read.</AppText> : null}
      {status ? <AppText accessibilityLiveRegion="polite" muted size={12}>{status}</AppText> : null}
      {busy ? <SecondaryButton onPress={() => cancel()}>Cancel scan</SecondaryButton> : null}
      {error ? <AppText accessibilityLiveRegion="polite" color={theme.colors.danger}>{error}</AppText> : null}
      {notice ? <AppText accessibilityLiveRegion="polite" size={12} muted>{notice}</AppText> : null}
    </View>
    <ScrollBody nativeID="food-scanner-scroll" style={{ flex: 1 }} contentContainerStyle={{ gap: 12, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 180 }}>
      <input ref={file} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={event => { const image = event.target.files?.[0]; event.target.value = ""; if (image) void photo(image); }} />
      {mode === "barcode" ? <View style={{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceRaised, gap: 8 }}>
        <AppText size={12} weight="bold">Other ways to add</AppText>
        <SecondaryButton disabled={busy || items.length >= 100} onPress={() => file.current?.click()}>Take or choose a barcode photo</SecondaryButton>
        <View style={{ gap: 8 }}><Input bordered placeholder="Enter barcode digits" accessibilityLabel="Food barcode" keyboardType="number-pad" value={barcode} onChangeText={setBarcode} maxLength={14} /><SecondaryButton disabled={busy || !barcode.trim()} onPress={() => void lookup(barcode)}>Look up barcode</SecondaryButton><AppText size={10} muted>Product data: Open Food Facts (ODbL).</AppText></View>
      </View> : null}
      {mode === "label" && lastLabel && !busy ? <>
        <SecondaryButton onPress={() => setShowCrop(value => !value)}>{showCrop ? "Hide photo crop" : "Crop and retry last label"}</SecondaryButton>
        {showCrop ? <>
          <AppText size={12} muted>Keep only the nutrition table and its column headings. Retrying replaces the last label item, preserving its name and servings.</AppText>
          <div style={{ position: "relative", width: "100%" }}>
            <img src={labelPreview} alt="Last nutrition label" style={{ width: "100%", display: "block", borderRadius: 12 }} />
            <div style={{ position: "absolute", pointerEvents: "none", left: `${crop.left}%`, top: `${crop.top}%`, right: `${100 - crop.right}%`, bottom: `${100 - crop.bottom}%`, border: "2px solid #8FC700", background: "rgba(143,199,0,.08)" }} />
          </div>
          {(["left", "right", "top", "bottom"] as const).map(edge => <label key={edge} style={{ color: theme.colors.text, fontSize: 12 }}>{edge[0].toUpperCase() + edge.slice(1)} edge<input type="range" aria-label={`Label crop ${edge}`} min={edge === "right" ? crop.left + 5 : edge === "bottom" ? crop.top + 5 : 0} max={edge === "left" ? crop.right - 5 : edge === "top" ? crop.bottom - 5 : 100} value={crop[edge]} onChange={event => setCrop(current => ({ ...current, [edge]: Number(event.target.value) }))} style={{ width: "100%" }} /></label>)}
          <PrimaryButton onPress={() => void readLabel(lastLabel, crop, replaceLabel.current)}>Read cropped label</PrimaryButton>
        </> : null}
      </> : null}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <AppText size={18} weight="bold">Ingredients</AppText><SecondaryButton disabled={busy || items.length >= 100} onPress={() => append({ name: "New ingredient", basis: "1 serving — enter the package serving size", calories: null, protein: null, carbs: null, fats: null, source: "manual" })}>Add manually</SecondaryButton>
      </View>
      {items.length === 0 ? <AppText size={13} muted>Your scans appear here. Nothing is logged until you save the food or recipe.</AppText> : null}
      {[...items].reverse().map(item => <View key={item.id} style={{ padding: 14, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, gap: 10 }}>
        <AppText size={16} weight="bold">{item.name || "Ingredient"}</AppText>
        <AppText size={12} muted>{summary(item)}</AppText>
        <AppText size={11} muted>Per base portion: {item.basis}</AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <SecondaryButton height={36} accessibilityLabel={`Servings for ${item.name}`} onPress={() => setServingItem(value => value === item.id ? null : item.id)}>Servings: {item.servings || "—"}</SecondaryButton>
          <SecondaryButton height={36} accessibilityLabel={`Edit nutrition for ${item.name}`} onPress={() => setExpanded(value => value === item.id ? null : item.id)}>{expanded === item.id ? "Done editing" : "Edit nutrition"}</SecondaryButton>
          <SecondaryButton height={36} textColor={theme.colors.danger} accessibilityLabel={`Remove ingredient ${item.name}`} onPress={() => change(itemsRef.current.filter(entry => entry.id !== item.id))}>Remove</SecondaryButton>
        </View>
        {servingItem === item.id ? <>
          <AppText size={12} muted>How many of the base portions above are you using? For a 100 g basis, 150 g is 1.5 portions.</AppText>
          <View style={{ flexDirection: "row", gap: 8 }}>{[.5, 1, 2].map(amount => <SecondaryButton key={amount} style={{ flex: 1 }} onPress={() => edit(item.id, { servings: String(amount) })}>{amount}×</SecondaryButton>)}</View>
          <Field label="Servings used"><Input bordered accessibilityLabel={`Ingredient ${item.id} servings`} keyboardType="decimal-pad" value={item.servings} onChangeText={servings => edit(item.id, { servings })} maxLength={8} /></Field>
        </> : null}
        {expanded === item.id ? <>
          <Field label="Ingredient name"><Input bordered accessibilityLabel={`Ingredient ${item.id} name`} value={item.name} onChangeText={name => edit(item.id, { name })} maxLength={100} /></Field>
          <Field label="Base serving size"><Input bordered accessibilityLabel={`Ingredient ${item.id} basis`} value={item.basis} onChangeText={basis => edit(item.id, { basis })} maxLength={150} /></Field>
          <AppText size={11} muted>Edit values for one base portion. Servings multiply these values automatically.</AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{nutritionKeys.map(key => <Field key={key} label={labels[key]} style={{ width: "47%", flexGrow: 1 }}><Input bordered accessibilityLabel={`Ingredient ${item.id} ${key}`} keyboardType="decimal-pad" value={item[key]} placeholder="Missing" maxLength={10} onFocus={revealNutritionField} onChangeText={value => edit(item.id, { [key]: value })} /></Field>)}</View>
        </> : null}
        {!ingredientTotals([item]).complete ? <AppText size={12} color={theme.colors.danger}>Check missing nutrition values, name and servings.</AppText> : null}
      </View>)}
    </ScrollBody>
    <View style={{ paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.background, gap: 6 }}>
      {items.length > 0 && !totals.complete ? <AppText size={11} muted>Fill missing values to finish your ingredient list.</AppText> : null}
      <PrimaryButton disabled={!totals.complete || busy} onPress={() => { cancel(true); onUse({ name: items.length === 1 ? items[0].name.trim() : "Scanned meal", calories: totals.calories, protein: totals.protein, carbs: totals.carbs, fats: totals.fats, basis: "Total of selected ingredient servings", source: items.every(item => item.source === "barcode") ? "barcode" : items.some(item => item.source === "label") ? "label" : "manual" }, items); }}>Use ingredient totals</PrimaryButton>
    </View>
  </View>;
}
