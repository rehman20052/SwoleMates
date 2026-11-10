import { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { AppText, Field, Input, PrimaryButton, ScrollBody, SecondaryButton } from "./ui";
import { FoodScanner } from "./food-scanner";
import { SaveFeedback } from "./save-feedback";
import { foodChoices, type CommonFood, type FoodChoice } from "@/lib/food-search";
import { ingredientTotals, nutritionKeys, scannedIngredient, type ScanIngredient } from "@/lib/food-scanner";
import { draftFood, entryIngredients, fillScannedIngredient, portionGrams } from "@/lib/food-log-draft";
import { useAppData, type FoodLogEntry } from "@/state/app-data";
import { useAppTheme } from "@/theme";
import ingredients from "@/data/ingredients.json";
import usdaFoods from "@/data/usda-foods.json";
import Svg, { Circle, Path } from "react-native-svg";

function LogIcon({ kind, color }: { kind: "search" | "scan" | "saved" | "recent"; color: string }) {
  return <Svg width={21} height={21} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    {kind === "search" ? <><Circle cx={10.5} cy={10.5} r={6.5} /><Path d="m16 16 4.5 4.5" /></> : kind === "scan" ? <Path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 8v8m4-9v10m3-10v10m3-9v8" /> : kind === "saved" ? <Path d="M6 3h12v18l-6-4-6 4V3Z" /> : <><Circle cx={12} cy={12} r={9} /><Path d="M12 7v5l3 2" /></>}
  </Svg>;
}

const catalog = [...ingredients, ...usdaFoods] as CommonFood[];
const meals: FoodLogEntry["meal"][] = ["Breakfast", "Lunch", "Dinner", "Snack"];
const labels = { calories: "Calories", protein: "Protein (g)", carbs: "Carbs (g)", fats: "Fat (g)" };
function useFoodKeyboard() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const update = () => setOpen(document.documentElement.classList.contains("keyboard-open"));
      const observer = new MutationObserver(update);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      update(); return () => observer.disconnect();
    }
    const show = Keyboard.addListener("keyboardDidShow", () => setOpen(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return open;
}
type Props = { date: string; initialMeal: FoodLogEntry["meal"]; entry: FoodLogEntry | null; recipeOnly: boolean; onClose: () => void };

// Mounted once per logging session; all sources append to the same draft.
function FoodLogForm({ date, initialMeal, entry, recipeOnly, onClose }: Props) {
  const theme = useAppTheme(), c = theme.colors;
  const keyboardOpen = useFoodKeyboard();
  const [showGramReference, setShowGramReference] = useState(false);
  const { foodEntries, savedMeals, foodJournalReady, recipesReady, foodJournalError, recipeStorageError, addFoodEntry, updateFoodEntry, saveMeal, accountUserId } = useAppData();
  const account = useRef(accountUserId);
  useEffect(() => { if (account.current !== accountUserId) onClose(); }, [accountUserId, onClose]);
  const [meal, setMeal] = useState(initialMeal);
  const [name, setName] = useState(entry?.name ?? "");
  const [items, setItems] = useState<ScanIngredient[]>(() => entry ? entryIngredients(entry) : []);
  const [panel, setPanel] = useState<"search" | "saved" | "recent" | null>(null);
  const [query, setQuery] = useState("");
  const [scanner, setScanner] = useState(false);
  const [scanIntoEditor, setScanIntoEditor] = useState(false);
  const [editor, setEditor] = useState<ScanIngredient | null>(() => entry ? null : scannedIngredient({ name: "", basis: "1 serving", source: "manual", calories: null, protein: null, carbs: null, fats: null }));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const editorTouched = !!editor && (!!editingId || editor.source !== "manual" || nutritionKeys.some(key => editor[key].trim()));
  const baseGrams = editor ? portionGrams(editor) : null;
  const editorItem = editor && editorTouched ? { ...editor, name: editor.name.trim() || name.trim() || "My meal", ...Object.fromEntries(nutritionKeys.map(key => [key, editor.source === "manual" && key !== "calories" && !editor[key].trim() ? "0" : editor[key]])) } as ScanIngredient : null;
  const draftItems = editorItem ? editingId ? items.map(item => item.id === editingId ? editorItem : item) : [...items, editorItem] : items;
  const totals = ingredientTotals(draftItems);
  const ready = recipeOnly ? recipesReady : foodJournalReady;
  const choices = useMemo(() => panel === "search" ? query.trim() ? foodChoices([], [], query, catalog).slice(0, 8) : [] : panel === "saved" ? foodChoices([], savedMeals, "") : panel === "recent" ? foodChoices(foodEntries, [], "").slice(0, 10) : [], [foodEntries, savedMeals, query, panel]);
  function append(item: ScanIngredient) { setItems(previous => [...previous, item]); setQuery(""); setPanel(null); setError(null); }
  function choose(choice: FoodChoice) {
    if (choice.source === "common") append(scannedIngredient({ name: choice.food.name, ...choice.food.per100g, basis: "100 g", source: "manual" }));
    else { setItems(previous => [...previous, ...entryIngredients(choice.food)]); if (!items.length && !name.trim()) setName(choice.food.name); setQuery(""); setError(null); }
  }
  function manual() { setShowGramReference(false); setEditingId(null); setEditor(scannedIngredient({ name: query.trim() || (!items.length ? name : ""), basis: "1 serving", source: "manual", calories: null, protein: null, carbs: null, fats: null })); setError(null); }
  function confirmEditor() {
    if (!editor || !editorItem) return false;
    const next = editorItem!;
    if (!ingredientTotals([next]).complete) { setError("Enter a name, valid calories and a portion greater than zero. Nutrition values must be between 0 and 100,000."); return false; }
    setItems(previous => editingId ? previous.map(item => item.id === editingId ? next : item) : [...previous, next]);
    setEditor(null); setEditingId(null); setQuery(""); setError(null);
    return true;
  }
  function nextIngredient() {
    if (!confirmEditor()) return;
    setShowGramReference(false);
    setEditor(scannedIngredient({ name: "", basis: "1 serving", source: "manual", calories: null, protein: null, carbs: null, fats: null }));
  }
  function scanCurrentFood() {
    setScanIntoEditor(!!editor);
    setScanner(true);
  }
  async function save() {
    const food = draftFood(name, meal, draftItems);
    if (!food || lock.current || !ready) return;
    setItems(draftItems); setEditor(null); setEditingId(null);
    lock.current = true; setSaving(true); setError(null);
    try {
      const saved = recipeOnly ? await saveMeal(food) : entry ? await updateFoodEntry(entry.id, { ...food, artwork: entry.artwork }) : await addFoodEntry(food, date);
      if (saved) onClose(); else setError("Could not save this meal. Your draft is still here; please try again.");
    } catch { setError("Could not save this meal. Your draft is still here; please try again."); }
    finally { lock.current = false; setSaving(false); }
  }
  const row = { flexDirection: "row" as const, alignItems: "center" as const, gap: 10 };
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[s.root, keyboardOpen && { height: "100%" }]}>
    <View style={[s.sheet, { backgroundColor: c.background, borderColor: c.border }]}>
      {!keyboardOpen ? <View style={[s.grabber, { backgroundColor: c.borderStrong }]} /> : null}
      <View style={[row, s.header, { borderBottomColor: c.border }, keyboardOpen && { paddingVertical: 4 }]}>
        <View style={{ flex: 1, gap: 4 }}>{!keyboardOpen ? <AppText size={10} weight="bold" primary style={{ letterSpacing: 2 }}>DAILY FUEL</AppText> : null}<AppText size={keyboardOpen ? 22 : 32} display>{scanner ? "Scan food" : recipeOnly ? "Save a meal" : entry ? "Edit meal" : "Log food"}</AppText>{!keyboardOpen ? <AppText size={12} muted>{new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</AppText> : null}</View>
        {keyboardOpen ? <Pressable accessibilityRole="button" accessibilityLabel="Done typing" onPress={() => { Keyboard.dismiss(); if (Platform.OS === "web" && typeof document !== "undefined") (document.activeElement as HTMLElement | null)?.blur(); }} style={s.close}><AppText primary weight="bold">Done</AppText></Pressable> : null}
        <Pressable disabled={saving} accessibilityRole="button" accessibilityLabel={scanner ? "Back to meal" : "Close food logger"} onPress={() => scanner ? setScanner(false) : onClose()} style={[s.close, { backgroundColor: c.surfaceRaised, borderRadius: 22 }]}><AppText size={23} display={false} muted>{scanner ? "‹" : "×"}</AppText></Pressable>
      </View>
      {scanner ? <FoodScanner onDetected={food => {
        const item = fillScannedIngredient(food, scanIntoEditor ? editor : null);
        setShowGramReference(false);
        setEditor(item);
        if (!scanIntoEditor) setEditingId(null);
        setScanner(false); setPanel(null);
        setError(ingredientTotals([item]).complete ? null : "This product is missing nutrition. Check the package and fill it in.");
      }} onUse={(_food, scanned) => { setItems(previous => [...previous, ...scanned]); setScanner(false); }} onClose={() => setScanner(false)} /> : <>
      <ScrollBody style={{ flex: 1, minHeight: 0 }} keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
        <View style={[s.mealStrip, { backgroundColor: c.surface }]}>{meals.map(option => <Pressable disabled={saving} key={option} accessibilityRole="button" accessibilityState={{ selected: meal === option }} onPress={() => setMeal(option)} style={[s.meal, { backgroundColor: meal === option ? c.primary : "transparent" }]}><AppText size={12} weight="semibold" color={meal === option ? c.primaryText : c.muted}>{option}</AppText></Pressable>)}</View>
        <Field label="Meal name"><Input accessibilityLabel="Meal name" bordered placeholder="e.g. Chicken & rice bowl" value={name} onChangeText={setName} editable={!saving} style={{ height: 48, backgroundColor: c.surface }} /></Field>
        <View style={{ gap: 10 }}>
          <AppText size={10} weight="bold" muted style={{ letterSpacing: 1.6 }}>ADD TO YOUR MEAL</AppText>
          <View style={[row, { gap: 8 }]}>{([
            { kind: "search", label: "Search", action: () => { setPanel(panel === "search" ? null : "search"); setQuery(""); } },
            ...(Platform.OS === "web" ? [{ kind: "scan", label: "Scan", action: scanCurrentFood }] : []),
            { kind: "saved", label: "Saved", action: () => setPanel(panel === "saved" ? null : "saved") },
            { kind: "recent", label: "Recent", action: () => setPanel(panel === "recent" ? null : "recent") },
          ] as { kind: "search" | "scan" | "saved" | "recent"; label: string; action: () => void }[]).map(tool => <Pressable key={tool.kind} accessibilityRole="button" accessibilityLabel={tool.kind === "search" ? "Search food" : tool.kind === "saved" ? "Saved recipes" : tool.kind === "recent" ? "Recent meals" : "Scan"} accessibilityState={{ expanded: panel === tool.kind }} disabled={saving} onPress={tool.action} style={({ pressed }) => [s.tool, { borderColor: panel === tool.kind ? c.accent : c.border, backgroundColor: panel === tool.kind ? c.primaryTint : c.surface, opacity: pressed ? 0.65 : 1 }]}><LogIcon kind={tool.kind} color={panel === tool.kind || tool.kind === "scan" ? c.accent : c.text} /><AppText size={12} weight="semibold" color={panel === tool.kind ? c.accent : c.text}>{tool.label}</AppText></Pressable>)}</View>
        </View>
        {panel ? <View style={{ gap: 8 }}>
          <View style={row}><AppText weight="semibold" style={{ flex: 1 }}>{panel === "search" ? "Search the food database" : panel === "saved" ? "Add a saved recipe" : "Add a recent meal"}</AppText><Pressable accessibilityRole="button" accessibilityLabel="Close food picker" onPress={() => setPanel(null)} style={s.close}><AppText muted>Close</AppText></Pressable></View>
          {panel === "search" ? <Input bordered accessibilityLabel="Search food database" placeholder="Search foods" value={query} onChangeText={setQuery} /> : null}
          {choices.map(choice => <Pressable key={choice.key} disabled={saving} accessibilityRole="button" accessibilityLabel={`Add ${choice.food.name}`} onPress={() => choose(choice)} style={[s.result, { borderBottomColor: c.border }]}><View style={{ flex: 1, gap: 3 }}><AppText weight="semibold">{choice.food.name}</AppText><AppText size={12} muted>{choice.source === "common" ? `${choice.food.per100g.calories} kcal / 100 g` : `${choice.food.calories} kcal`}</AppText></View><AppText size={22} display={false} primary>+</AppText></Pressable>)}
          {!choices.length ? <AppText size={12} muted>{panel === "search" ? query.trim() ? "No match. Try another food name." : "Type a food name to search." : panel === "saved" ? recipesReady ? "No saved recipes yet." : "Loading saved recipes…" : foodJournalReady ? "Your logged meals will appear here." : "Loading recent meals…"}</AppText> : null}
        </View> : null}
        {editor ? <View style={[s.editor, { borderColor: c.border, backgroundColor: c.surface }]}>
          <View style={row}><AppText weight="bold" style={{ flex: 1 }}>{editingId ? "Edit ingredient" : "Nutrition"}</AppText>{Platform.OS === "web" ? <Pressable accessibilityRole="button" accessibilityLabel="Scan to fill this ingredient" disabled={saving} onPress={scanCurrentFood} style={[row, { minHeight: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: c.primaryTint, gap: 7 }]}><LogIcon kind="scan" color={c.accent} /><AppText size={12} weight="semibold" primary>Scan</AppText></Pressable> : null}<Pressable accessibilityRole="button" accessibilityLabel="Cancel nutrition entry" onPress={() => { setEditor(null); setError(null); }} style={s.close}><AppText size={20} muted>×</AppText></Pressable></View>
          <Input accessibilityLabel="Ingredient name" bordered placeholder="Food or ingredient name" value={editor.name} onChangeText={value => setEditor({ ...editor, name: value })} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Field label="Servings" style={{ flex: 1 }}><Input bordered accessibilityLabel="Ingredient servings" keyboardType="decimal-pad" value={editor.servings} onChangeText={servings => setEditor({ ...editor, servings })} /></Field>
            {baseGrams !== null ? <Field label="Amount (g)" style={{ flex: 1 }}><Input bordered accessibilityLabel="Ingredient amount in grams" keyboardType="decimal-pad" value={editor.servings.trim() && Number.isFinite(Number(editor.servings.replace(",", "."))) ? String(Math.round(Number(editor.servings.replace(",", ".")) * baseGrams * 1000) / 1000) : ""} onChangeText={text => { const grams = Number(text.replace(",", ".")); setEditor({ ...editor, servings: text.trim() && Number.isFinite(grams) ? String(grams / baseGrams) : "" }); }} /></Field> : null}
          </View>
          {baseGrams === null && !showGramReference ? <Pressable accessibilityRole="button" onPress={() => setShowGramReference(true)} style={{ minHeight: 44, justifyContent: "center" }}><AppText size={12} primary>Enter grams per serving</AppText></Pressable> : null}
          {showGramReference ? <Field label="Grams in one base serving"><Input bordered accessibilityLabel="Grams per base serving" keyboardType="decimal-pad" value={editor.gramsPerServing ? String(editor.gramsPerServing) : ""} placeholder="Check the package" onChangeText={text => { const value = Number(text.replace(",", ".")); setEditor({ ...editor, gramsPerServing: Number.isFinite(value) && value > 0 ? value : undefined }); }} /></Field> : null}
          <AppText size={11} muted>Per {editor.basis} · {editor.source === "manual" ? "Unentered macros count as 0" : "Check any missing values on the package"}</AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>{nutritionKeys.map(key => <Field key={key} label={labels[key]} style={{ width: "46%", flexGrow: 1 }}><Input bordered style={{ height: 46, backgroundColor: c.background, fontSize: 18 }} accessibilityLabel={`Ingredient ${labels[key]}`} keyboardType="decimal-pad" value={editor[key]} placeholder={key === "calories" ? "Required" : "0"} onChangeText={value => setEditor({ ...editor, [key]: value })} /></Field>)}</View>
          <SecondaryButton height={42} fontSize={13} style={{ borderStyle: "dashed", backgroundColor: c.primaryTint, borderColor: editorTouched ? c.accent : c.border, opacity: editorTouched ? 1 : 0.6 }} textColor={c.accent} disabled={!editorTouched} onPress={editingId ? confirmEditor : nextIngredient}>{editingId ? "Update ingredient" : "+ Add another ingredient"}</SecondaryButton>
        </View> : <Pressable disabled={saving} accessibilityRole="button" onPress={manual} style={{ minHeight: 44, justifyContent: "center" }}><AppText size={13} weight="semibold" primary>+ Add ingredient manually</AppText></Pressable>}
        {items.length ? <View style={{ gap: 4 }}><AppText size={11} weight="bold" muted upper>In this meal</AppText>{items.map(item => {
          const grams = item.basis === "100 g", value = ingredientTotals([item]);
          return <View key={item.id} style={[s.item, { borderBottomColor: c.border }]}>
            <Pressable disabled={saving || editorTouched} accessibilityRole="button" accessibilityLabel={`Edit nutrition for ${item.name}`} onPress={() => { setEditor({ ...item }); setEditingId(item.id); setError(null); }} style={{ flex: 1, gap: 3, minWidth: 0, minHeight: 44, justifyContent: "center" }}><AppText size={14} weight="semibold">{item.name}</AppText><AppText size={11} muted>{value.calories ?? "—"} kcal · {grams ? "per 100 g" : item.basis}</AppText></Pressable>
            <Input bordered editable={!saving && !editorTouched} accessibilityLabel={`Amount for ${item.name} in ${grams ? "grams" : "servings"}`} keyboardType="decimal-pad" style={{ width: 65, textAlign: "center", paddingHorizontal: 5, fontSize: 16 }} value={grams ? item.servings.trim() && Number.isFinite(Number(item.servings.replace(",", "."))) ? String(Math.round(Number(item.servings.replace(",", ".")) * 100 * 1000) / 1000) : "" : item.servings} onChangeText={text => { const number = Number(text.replace(",", ".")); const servings = grams ? text.trim() && Number.isFinite(number) ? String(number / 100) : "" : text; setItems(previous => previous.map(i => i.id === item.id ? { ...i, servings } : i)); }} />
            <AppText size={11} muted>{grams ? "g" : "×"}</AppText>
            <Pressable disabled={saving || editorTouched} accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`} onPress={() => setItems(previous => previous.filter(i => i.id !== item.id))} style={s.remove}><AppText size={22} muted>×</AppText></Pressable>
          </View>;
        })}</View> : !editor ? <AppText size={13} muted>Scan a food, search, or enter the nutrition yourself. Add more foods to build a meal.</AppText> : null}
        {error || (recipeOnly ? recipeStorageError : foodJournalError) ? <AppText accessibilityLiveRegion="polite" size={13} color={c.danger}>{error ?? (recipeOnly ? recipeStorageError : foodJournalError)}</AppText> : null}
        {error ? <SaveFeedback area={recipeOnly ? "recipes" : "food"} onRetried={onClose} /> : null}
      </ScrollBody>
      {!keyboardOpen ? <View style={[s.footer, { borderTopColor: c.border, backgroundColor: c.surface }]}>
        <View style={[row, { justifyContent: "space-between", marginBottom: 10 }]}><AppText size={10} weight="bold" muted style={{ letterSpacing: 1.5 }}>MEAL TOTAL</AppText><AppText size={11} muted>{draftItems.length} {draftItems.length === 1 ? "ingredient" : "ingredients"}</AppText></View>
        {draftItems.length ? <View style={[row, { justifyContent: "space-between", marginBottom: 12 }]}>{nutritionKeys.map(key => <View key={key} style={{ gap: 3 }}><AppText size={key === "calories" ? 23 : 16} weight="bold">{totals[key] ?? "—"}{key === "calories" ? "" : "g"}</AppText><AppText size={11} muted>{key === "calories" ? "kcal" : key === "fats" ? "Fat" : key === "carbs" ? "Carbs" : "Protein"}</AppText></View>)}</View> : null}
        <PrimaryButton height={50} style={{ borderRadius: 14, opacity: saving || !ready || !totals.complete ? 0.45 : 1 }} disabled={saving || !ready || !totals.complete} onPress={() => void save()}>{saving ? "Saving…" : recipeOnly ? "Save meal" : entry ? "Save changes" : `Log to ${meal.toLowerCase()}`}</PrimaryButton>
      </View> : null}
      </>}
    </View>
  </KeyboardAvoidingView>;
}

export function FoodLogSheet({ visible, ...props }: Props & { visible: boolean }) {
  const c = useAppTheme().colors;
  return <Modal animationType="slide" transparent visible={visible} onRequestClose={props.onClose}><View style={[s.overlay, { backgroundColor: c.sheetOverlay }]}>{visible ? <FoodLogForm {...props} /> : null}</View></Modal>;
}
const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", alignItems: "center" }, root: { width: "100%", maxWidth: 402, height: "96%" },
  sheet: { flex: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, overflow: "hidden" }, grabber: { width: 32, height: 3, borderRadius: 2, alignSelf: "center", marginTop: 9 }, header: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 14, borderBottomWidth: 1 },
  close: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }, body: { padding: 20, gap: 16 },
  mealStrip: { flexDirection: "row", gap: 3, padding: 4, borderRadius: 13 }, meal: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 36, borderRadius: 10 }, tool: { flex: 1, minHeight: 64, gap: 7, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12 }, editor: { padding: 16, borderRadius: 18, borderWidth: 1, gap: 12 },
  result: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12, borderBottomWidth: 1 }, item: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 10, borderBottomWidth: 1 },
  remove: { width: 32, minHeight: 44, alignItems: "center", justifyContent: "center" }, footer: { borderTopWidth: 1, padding: 20 },
});
