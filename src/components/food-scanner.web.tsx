import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { AppText, Field, Input, PrimaryButton, ScrollBody, SecondaryButton } from "./ui";
import { ingredientTotals, lookupBarcode, nutritionKeys, scannedIngredient, type ScanIngredient, type ScannedFood } from "@/lib/food-scanner";
import { decodeFoodBarcode, videoFrame } from "@/lib/food-scanner-browser";
import { rememberConfirmedIngredient } from "@/scanning/product-memory";
import { useAppTheme } from "@/theme";

type Props = { initialIngredients?: ScanIngredient[]; onChange?: (items: ScanIngredient[]) => void; onUse: (food: ScannedFood, items: ScanIngredient[]) => void; onClose: () => void };
const labels = { calories: "Calories", protein: "Protein (g)", carbs: "Carbs (g)", fats: "Fat (g)" };

export function FoodScanner({ initialIngredients = [], onChange, onUse, onClose }: Props) {
  const theme = useAppTheme();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const generation = useRef(0);
  const itemsRef = useRef(initialIngredients);
  const [items, setItems] = useState(initialIngredients);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [servingItem, setServingItem] = useState<string | null>(null);
  const [customServing, setCustomServing] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const totals = ingredientTotals(items);

  function change(next: ScanIngredient[]) { itemsRef.current = next; setItems(next); onChange?.(next); }
  function edit(id: string, patch: Partial<ScanIngredient>) { change(itemsRef.current.map(item => item.id === id ? { ...item, ...patch } : item)); }
  function stop() {
    generation.current++; clearTimeout(timer.current);
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCamera(false); setBusy(false); setTorch(false); setHasTorch(false); setMessage("");
  }
  useEffect(() => {
    const suspend = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", suspend);
    return () => { stop(); document.removeEventListener("visibilitychange", suspend); };
  }, []);

  function append(food: ScannedFood) {
    const item = scannedIngredient(food);
    change([...itemsRef.current, item]); setExpanded(item.id); setError("");
    setMessage(nutritionKeys.some(key => food[key] === null) ? "Product added. Fill in its missing nutrition." : "Product added. You can scan another barcode.");
  }
  async function findProduct(code: string, current: number) {
    stop(); generation.current = current; setBusy(true); setMessage("Finding product…");
    try {
      const food = await lookupBarcode(code);
      if (generation.current === current) append(food);
    } catch (reason) {
      if (generation.current === current) setError(reason instanceof Error ? reason.message.replace(/photograph the label/gi, "scan again") : "Could not find this product.");
    } finally { if (generation.current === current) { setBusy(false); setMessage(""); } }
  }
  async function scan() {
    stop(); const current = generation.current; setError(""); setMessage("Opening camera…");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access requires HTTPS or the published app.");
      const feed = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      if (generation.current !== current) { feed.getTracks().forEach(track => track.stop()); return; }
      stream.current = feed;
      const track = feed.getVideoTracks()[0];
      const caps = track.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean; focusMode?: string[] };
      setHasTorch(Boolean(caps?.torch)); setCamera(true); setMessage("Hold the entire barcode inside the frame.");
      if (!video.current) throw new Error("Camera preview unavailable.");
      video.current.srcObject = feed; await video.current.play();
      let attempts = 0;
      const read = async () => {
        if (generation.current !== current || !video.current || !stream.current) return;
        try {
          const frame = videoFrame(video.current, "barcode", ++attempts % 3 !== 0);
          const code = await decodeFoodBarcode(frame.getContext("2d")!.getImageData(0, 0, frame.width, frame.height));
          if (code && generation.current === current) { void findProduct(code, current); return; }
        } catch { /* A later frame may decode cleanly. */ }
        timer.current = setTimeout(() => void read(), 250);
      };
      void read();
    } catch (reason) {
      if (generation.current !== current) return;
      stop(); setError(reason instanceof DOMException && reason.name === "NotAllowedError" ? "Camera permission was denied. Allow camera access and try again." : reason instanceof Error ? reason.message : "Could not open the camera.");
    }
  }
  async function toggleTorch() {
    const track = stream.current?.getVideoTracks()[0]; if (!track) return;
    try { await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }); setTorch(!torch); }
    catch { setError("This camera does not support a light control."); }
  }
  function summary(item: ScanIngredient) {
    const value = ingredientTotals([item]);
    return `${value.calories ?? "?"} cal · ${value.protein ?? "?"}g protein · ${value.carbs ?? "?"}g carbs · ${value.fats ?? "?"}g fat`;
  }

  return <View style={{ flex: 1 }}>
    <View style={{ paddingHorizontal: 18, paddingBottom: 10, gap: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><AppText size={23} weight="black">Scan barcodes</AppText><SecondaryButton onPress={() => { stop(); onClose(); }}>Close scanner</SecondaryButton></View>
      <View accessibilityLabel="Scanned ingredient totals" style={{ padding: 10, borderRadius: 16, backgroundColor: theme.colors.primaryTint, borderColor: theme.colors.border, borderWidth: 1, gap: 2 }}><AppText size={12} weight="bold">{items.length} {items.length === 1 ? "ingredient" : "ingredients"} · total</AppText><AppText size={21} weight="black">{totals.calories ?? "—"} cal</AppText><AppText size={12}>{totals.protein ?? "—"}g protein · {totals.carbs ?? "—"}g carbs · {totals.fats ?? "—"}g fat</AppText></View>
    </View>
    <View style={{ paddingHorizontal: 18, gap: 10 }}>
      <AppText size={12} muted>Point your camera at a packaged food barcode. It is added automatically.</AppText>
      <div style={{ position: "relative", display: camera ? "block" : "none", height: "min(38dvh, 340px)", minHeight: 260, borderRadius: 20, overflow: "hidden", background: "#080a08" }}><video ref={video} muted playsInline autoPlay aria-label="Barcode scanner camera preview" style={{ width: "100%", height: "100%", objectFit: "contain" }} /><div aria-hidden style={{ position: "absolute", pointerEvents: "none", left: "5%", right: "5%", top: "25%", bottom: "25%", border: "2px solid #C6FF00", borderRadius: 12, boxShadow: "0 0 0 999px rgba(0,0,0,.25)" }} /></div>
      {camera ? <View style={{ flexDirection: "row", gap: 8 }}>{hasTorch ? <SecondaryButton style={{ flex: 1 }} onPress={() => void toggleTorch()}>{torch ? "Light off" : "Light on"}</SecondaryButton> : null}<SecondaryButton style={{ flex: 1 }} onPress={stop}>Stop camera</SecondaryButton></View> : <PrimaryButton disabled={busy || items.length >= 100} onPress={() => void scan()}>{items.length ? "Scan next barcode" : "Scan barcode"}</PrimaryButton>}
      {message ? <AppText accessibilityLiveRegion="polite" muted size={12}>{message}</AppText> : null}{error ? <AppText accessibilityLiveRegion="polite" color={theme.colors.danger}>{error}</AppText> : null}
    </View>
    <ScrollBody style={{ flex: 1 }} contentContainerStyle={{ gap: 12, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 180 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><AppText size={18} weight="bold">Ingredients</AppText><SecondaryButton disabled={items.length >= 100} onPress={() => append({ name: "New ingredient", basis: "1 serving", calories: null, protein: null, carbs: null, fats: null, source: "manual" })}>Add manually</SecondaryButton></View>
      {!items.length ? <AppText size={13} muted>Scanned products appear here. Nothing is logged until you use the total.</AppText> : null}
      {[...items].reverse().map(item => <View key={item.id} style={{ padding: 14, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, gap: 10 }}>
        <AppText size={16} weight="bold">{item.name || "Ingredient"}</AppText><AppText size={12} muted>{summary(item)}</AppText><AppText size={11} muted>Per base portion: {item.basis}</AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}><SecondaryButton height={36} onPress={() => setServingItem(value => value === item.id ? null : item.id)}>Serving: {item.servings || "—"}×</SecondaryButton><SecondaryButton height={36} onPress={() => setExpanded(value => value === item.id ? null : item.id)}>{expanded === item.id ? "Done editing" : "Edit nutrition"}</SecondaryButton><SecondaryButton height={36} textColor={theme.colors.danger} onPress={() => change(itemsRef.current.filter(entry => entry.id !== item.id))}>Remove</SecondaryButton></View>
        {servingItem === item.id ? <><AppText size={12} muted>Choose a serving or enter a custom multiplier.</AppText><View style={{ flexDirection: "row", gap: 8 }}>{[0.5, 1, 2].map(amount => <SecondaryButton key={amount} style={{ flex: 1 }} onPress={() => { edit(item.id, { servings: String(amount) }); setCustomServing(null); }}>{amount}×</SecondaryButton>)}<SecondaryButton style={{ flex: 1 }} onPress={() => setCustomServing(item.id)}>Custom</SecondaryButton></View>{customServing === item.id ? <Field label="Custom serving"><Input autoFocus bordered accessibilityLabel={`Custom serving for ${item.name}`} keyboardType="decimal-pad" value={item.servings} onChangeText={servings => edit(item.id, { servings })} /></Field> : null}</> : null}
        {expanded === item.id ? <><Field label="Ingredient name"><Input bordered value={item.name} onChangeText={name => edit(item.id, { name })} /></Field><Field label="Base serving size"><Input bordered value={item.basis} onChangeText={basis => edit(item.id, { basis })} /></Field><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{nutritionKeys.map(key => <Field key={key} label={labels[key]} style={{ width: "47%", flexGrow: 1 }}><Input bordered keyboardType="decimal-pad" value={item[key]} placeholder="Missing" onChangeText={value => edit(item.id, { [key]: value })} /></Field>)}</View></> : null}
        {!ingredientTotals([item]).complete ? <AppText size={12} color={theme.colors.danger}>Check missing nutrition values, name and serving.</AppText> : null}
      </View>)}
    </ScrollBody>
    <View style={{ paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.background }}><PrimaryButton disabled={!totals.complete || busy} onPress={() => { stop(); void Promise.all(items.map(rememberConfirmedIngredient)).catch(() => undefined); onUse({ name: items.length === 1 ? items[0].name.trim() : "Scanned meal", calories: totals.calories, protein: totals.protein, carbs: totals.carbs, fats: totals.fats, basis: "Total of selected servings", source: items.every(item => item.source === "barcode") ? "barcode" : "manual" }, items); }}>Use ingredient totals</PrimaryButton></View>
  </View>;
}
