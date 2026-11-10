import { useEffect, useRef, useState } from "react";
import { AppState, Linking, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { AppText, Field, Input, PrimaryButton, ScrollBody, SecondaryButton } from "./ui";
import { lookupBarcode, type ScanIngredient, type ScannedFood, scannedIngredient } from "@/lib/food-scanner";
import { normalizeBarcode } from "@/scanning/barcodes";
import { parseNutritionFrame } from "@/scanning/nutrition/parser";
import { recognizedTextFrame } from "@/scanning/nutrition/text-frame";
import { useAppTheme } from "@/theme";

type Props = { onDetected?: (food: ScannedFood) => void; initialIngredients?: ScanIngredient[]; onChange?: (items: ScanIngredient[]) => void; onUse: (food: ScannedFood, items: ScanIngredient[]) => void; onClose: () => void };
export function FoodScanner({ onDetected, onUse, onClose }: Props) {
  const c = useAppTheme().colors;
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null), mounted = useRef(true), generation = useRef(0), lock = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const pickingPhoto = useRef(false);
  const [mode, setMode] = useState<"barcode" | "label">("barcode");
  const [active, setActive] = useState(true), [torch, setTorch] = useState(false), [zoom, setZoom] = useState(0);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [code, setCode] = useState(""), [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]), [detected, setDetected] = useState<ScannedFood | null>(null);
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener("change", state => {
      if (state !== "active") {
        setActive(false); setTorch(false); setReady(false);
        if (!pickingPhoto.current) { generation.current++; abort.current?.abort(); lock.current = false; setBusy(false); }
      }
    });
    return () => { mounted.current = false; generation.current++; abort.current?.abort(); subscription.remove(); };
  }, []);
  function review(food: ScannedFood) { setDetected(food); setActive(false); setTorch(false); setReady(false); }
  async function find(value: string, type?: string) {
    if (lock.current) return;
    let normalized: string;
    try { normalized = normalizeBarcode(value, type === "upc_e" ? "upc_e" : undefined).value; }
    catch (reason) { if (!type) setError(reason instanceof Error ? reason.message : "Check the barcode digits."); return; }
    lock.current = true; setBusy(true); setError(""); setActive(false); setTorch(false);
    const current = ++generation.current, controller = new AbortController(); abort.current = controller;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const food = await Promise.race([lookupBarcode(normalized, controller.signal), new Promise<never>((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error("Lookup timed out. Try again or scan the nutrition label.")); }, 15000); })]);
      if (mounted.current && current === generation.current) review(food);
    } catch (reason) { if (mounted.current && current === generation.current) setError(reason instanceof Error ? reason.message : "Could not find this food. Try its label or enter it manually."); }
    finally { clearTimeout(timeout); if (mounted.current && current === generation.current) { lock.current = false; setBusy(false); } }
  }
  async function label(fromLibrary: boolean) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setWarnings([]);
    const current = ++generation.current;
    try {
      let photo: { uri: string; width: number; height: number } | undefined;
      if (fromLibrary) {
        pickingPhoto.current = true;
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1, allowsEditing: true });
        pickingPhoto.current = false;
        if (!result.canceled) photo = result.assets[0];
      } else {
        if (!ready || !camera.current) throw new Error("Wait for the camera to be ready.");
        photo = await camera.current.takePictureAsync({ quality: 1 });
      }
      if (!photo || !mounted.current || current !== generation.current) return;
      const { recognizeText } = await import("@infinitered/react-native-mlkit-text-recognition");
      const recognized = await recognizeText(photo.uri);
      const result = parseNutritionFrame(recognizedTextFrame(recognized, photo.width, photo.height));
      if (!mounted.current || current !== generation.current) return;
      if (result.calories.value === null) throw new Error("Calories were not readable. Crop around the nutrition panel and try again, or enter the values manually.");
      setWarnings(result.warnings);
      review({ name: "Scanned food", source: "label", basis: result.basis === "per_100g" ? "100 g / 100 ml — check the label" : result.basis === "per_container" ? "1 container" : result.servingSize.value ? `1 serving (${result.servingSize.value})` : "Serving size not detected — check the label", calories: result.calories.value, protein: result.protein.value, carbs: result.carbs.value, fats: result.fat.value });
    } catch (reason) { if (mounted.current && current === generation.current) setError(reason instanceof Error && !/native module|RNMLKit/i.test(reason.message) ? reason.message : "Label recognition needs the native SwoleMates build. You can use barcode or manual entry here."); }
    finally { pickingPhoto.current = false; if (mounted.current && current === generation.current) { lock.current = false; setBusy(false); } }
  }
  return <ScrollBody contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
    <AppText size={23} weight="bold">Scan your food</AppText>
    <AppText size={12} muted>Scan the barcode, or read the nutrition panel on your device. Review the portion and values before logging.</AppText>
    <View style={{ flexDirection: "row", gap: 10 }}>{(["barcode", "label"] as const).map(value => <SecondaryButton key={value} disabled={busy} onPress={() => { setMode(value); setDetected(null); setError(""); setActive(true); }}>{mode === value ? "✓ " : ""}{value === "barcode" ? "Barcode" : "Nutrition label"}</SecondaryButton>)}</View>
    {!detected && active && permission?.granted ? <View style={{ height: 300, overflow: "hidden", borderRadius: 18, backgroundColor: c.surface }}><CameraView ref={camera} style={{ flex: 1 }} facing="back" enableTorch={torch} zoom={zoom} onCameraReady={() => setReady(true)} onMountError={() => { setActive(false); setError("Camera unavailable. Try a label photo or manual barcode."); }} barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "itf14"] }} onBarcodeScanned={mode === "barcode" && !busy ? (result: BarcodeScanningResult) => void find(result.data, result.type) : undefined} /><View pointerEvents="none" style={{ position: "absolute", left: 24, right: 24, top: mode === "barcode" ? 100 : 24, bottom: mode === "barcode" ? 100 : 24, borderWidth: 2, borderColor: c.accent, borderRadius: 12 }} /></View> : null}
    {!permission?.granted ? <><AppText size={12} muted>Allow camera access to scan a package. You can also type a barcode or choose a label photo.</AppText><PrimaryButton onPress={() => void requestPermission().catch(() => setError("Camera access was not granted."))}>Allow camera</PrimaryButton>{permission && !permission.canAskAgain ? <SecondaryButton onPress={() => void Linking.openSettings()}>Open camera settings</SecondaryButton> : null}</> : null}
    {active && permission?.granted && !detected ? <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}><SecondaryButton onPress={() => setTorch(value => !value)}>{torch ? "Light off" : "Light on"}</SecondaryButton><SecondaryButton onPress={() => setZoom(value => value ? 0 : 0.15)}>{zoom ? "Reset zoom" : "Zoom in"}</SecondaryButton>{mode === "label" ? <PrimaryButton disabled={busy || !ready} onPress={() => void label(false)}>Read label</PrimaryButton> : null}</View> : null}
    {mode === "label" ? <SecondaryButton disabled={busy} onPress={() => void label(true)}>Choose label photo</SecondaryButton> : <><Field label="Or enter barcode digits"><Input bordered accessibilityLabel="Food barcode digits" keyboardType="number-pad" value={code} onChangeText={setCode} /></Field><SecondaryButton disabled={busy || !code.trim()} onPress={() => void find(code)}>Look up barcode</SecondaryButton></>}
    {busy ? <AppText accessibilityLiveRegion="polite">{mode === "label" ? "Reading label on your device…" : "Finding product…"}</AppText> : null}
    {error ? <AppText accessibilityLiveRegion="polite" color={c.danger}>{error}</AppText> : null}
    {detected ? <View style={{ gap: 12 }}><AppText weight="bold">{detected.name}</AppText><AppText size={12} muted>{detected.basis}</AppText><AppText size={14}>{detected.calories ?? "—"} kcal · {detected.protein ?? "—"}g protein · {detected.carbs ?? "—"}g carbs · {detected.fats ?? "—"}g fat</AppText>{warnings.map((warning, index) => <AppText key={index} size={12} muted>{warning}</AppText>)}<AppText size={12} muted>Check the quantities and selected column against the package.</AppText><PrimaryButton onPress={() => onDetected ? onDetected(detected) : onUse(detected, [{ ...scannedIngredient(detected), reviewed: false }])}>Review portion & nutrition</PrimaryButton></View> : null}
    {!active && !busy ? <SecondaryButton onPress={() => { setDetected(null); setActive(true); setError(""); }}>Scan again</SecondaryButton> : null}
    <SecondaryButton onPress={onClose}>Back to manual entry</SecondaryButton>
  </ScrollBody>;
}
