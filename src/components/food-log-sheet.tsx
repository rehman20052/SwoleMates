import { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppText, Field, Icon, Input, PrimaryButton, ScrollBody, SecondaryButton } from "./ui";
import { FoodScanner } from "./food-scanner";
import { SaveFeedback } from "./save-feedback";
import { foodChoices, type CommonFood, type FoodChoice } from "@/lib/food-search";
import { ingredientTotals, nutritionKeys, scannedIngredient, validScanIngredients, type ScanIngredient } from "@/lib/food-scanner";
import { draftFood, emptyMealTotals, entryIngredients, fillScannedIngredient, mealAt, mealFromTotals, mealTotalsInput, portionGrams, recentMeals, recipeFood, withPortion, type MealTotals } from "@/lib/food-log-draft";
import { useAppData, type FoodLogEntry, type SavedMeal } from "@/state/app-data";
import { useSavedDraft } from "@/lib/use-saved-draft";
import { useAppTheme } from "@/theme";
import { icons } from "@/assets";
import ingredients from "@/data/ingredients.json";
import usdaFoods from "@/data/usda-foods.json";

const catalog = [...ingredients, ...usdaFoods] as CommonFood[];
const meals: FoodLogEntry["meal"][] = ["Breakfast", "Lunch", "Dinner", "Snack"];
const labels = { calories: "Calories", protein: "Protein (g)", carbs: "Carbs (g)", fats: "Fat (g)" };
type Step = "meal" | "portion" | "manual" | "scan" | "recent" | "saved";
type Unit = "g" | "oz" | "serving";
type Props = { date: string; entry: FoodLogEntry | SavedMeal | null; recipeOnly: boolean; addingSavedMealId: string | null; onAddSavedMeal: (recipe: SavedMeal, date: string) => Promise<FoodLogEntry["meal"] | null>; onClose: () => void };
const read = (text: string) => Number(text.replace(",", "."));
const display = (value: number) => String(Math.round(value * 10) / 10);
const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

function mealSeed(entry: FoodLogEntry | SavedMeal | null, recipeOnly = false) {
  const items = recipeOnly && entry?.recipe ? entry.recipe.ingredients.map(item => ({ ...item })) : entry ? entryIngredients(entry) : [];
  const hasIngredients = recipeOnly || items.some(item => item.provider !== "legacy");
  return { name: entry?.name ?? "", hasIngredients,
    items: hasIngredients ? items : [], totals: entry && !hasIngredients ? mealTotalsInput(entry) : emptyMealTotals };
}

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

function FoodLogForm({ date, entry, recipeOnly, addingSavedMealId, onAddSavedMeal, onClose }: Props) {
  const c = useAppTheme().colors, data = useAppData();
  const keyboardOpen = useFoodKeyboard();
  const owner = useRef(data.accountUserId), lock = useRef(false), finished = useRef(false), hasDraft = useRef(false);
  const currentAccount = useRef(data.accountUserId);
  currentAccount.current = data.accountUserId;
  const recordId = useRef<string | undefined>(undefined);
  const [seed] = useState(() => mealSeed(entry, recipeOnly));
  const [step, setStep] = useState<Step>("meal");
  const [meal, setMeal] = useState(() => entry?.meal ?? mealAt());
  const [name, setName] = useState(seed.name), [nameRequired, setNameRequired] = useState(false);
  const [useIngredientTotals, setUseIngredientTotals] = useState(seed.hasIngredients);
  const [ingredientsOpen, setIngredientsOpen] = useState(seed.hasIngredients);
  const [totalsInput, setTotalsInput] = useState(seed.totals);
  const scrollRef = useRef<ScrollView>(null);
  const [items, setItems] = useState<ScanIngredient[]>(seed.items);
  const [query, setQuery] = useState(""), [showLookup, setShowLookup] = useState(false);
  const [recentQuery, setRecentQuery] = useState(""), [replaceWith, setReplaceWith] = useState<FoodLogEntry | null>(null);
  const [failedRecipeId, setFailedRecipeId] = useState<string | null>(null);
  const [editor, setEditor] = useState<ScanIngredient | null>(null), [editingId, setEditingId] = useState<string | null>(null);
  const [unit, setUnit] = useState<Unit>("serving"), [amount, setAmount] = useState("1");
  const [details, setDetails] = useState(false), [gramReference, setGramReference] = useState(false);
  const [saveRecipe, setSaveRecipe] = useState(false), [recipeOptions, setRecipeOptions] = useState(false);
  const [batchServings, setBatchServings] = useState(String(entry?.recipe?.servings ?? 1));
  const [batchWeight, setBatchWeight] = useState(entry?.recipe?.finishedWeightGrams ? String(entry.recipe.finishedWeightGrams) : "");
  const [saving, setSaving] = useState(false), [logged, setLogged] = useState(false);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState("");
  const [undo, setUndo] = useState<{ item: ScanIngredient; index: number; usedInTotal: boolean; until: number } | null>(null);
  useEffect(() => { if (owner.current !== data.accountUserId) onClose(); }, [data.accountUserId, onClose]);
  useEffect(() => { if (!undo) return; const timer = setTimeout(() => setUndo(null), Math.max(0, undo.until - Date.now())); return () => clearTimeout(timer); }, [undo]);
  const recovery = useSavedDraft(`draft:food:${date}:${recipeOnly ? "recipe" : "log"}:${entry?.id ?? "new"}`, content => {
    try {
      const value = JSON.parse(content);
      if (!validScanIngredients(value.items) || typeof value.name !== "string" || !meals.includes(value.meal) || (value.editor && !validScanIngredients([value.editor]))) return;
      hasDraft.current = true;
      setItems(value.items); setName(value.name); setMeal(value.meal);
      setUseIngredientTotals(recipeOnly || (value.items.length > 0 && value.mode !== "totals"));
      setIngredientsOpen(recipeOnly || (typeof value.ingredientsOpen === "boolean" ? value.ingredientsOpen : Boolean(value.items.length || value.editor)));
      if (value.totals && nutritionKeys.every(key => typeof value.totals[key] === "string")) setTotalsInput(value.totals as MealTotals);
      setEditor(value.editor ?? null); setEditingId(value.editingId ?? null);
      setUnit(["g", "oz", "serving"].includes(value.unit) ? value.unit : "serving");
      setAmount(typeof value.amount === "string" ? value.amount : "1");
      setStep(value.editor && (value.step === "portion" || value.step === "manual") ? value.step : "meal");
      setDetails(Boolean(value.details)); setLogged(Boolean(value.logged)); setSaveRecipe(Boolean(value.saveRecipe));
      setBatchServings(typeof value.batchServings === "string" ? value.batchServings : "1");
      setBatchWeight(typeof value.batchWeight === "string" ? value.batchWeight : "");
      if (typeof value.recordId === "string") recordId.current = value.recordId;
    } catch { /* Preserve the journal when a recoverable draft is damaged. */ }
  });
  const hasManualTotals = nutritionKeys.some(key => totalsInput[key].trim());
  const dirty = Boolean(name.trim() || items.length || editor || hasManualTotals);
  useEffect(() => {
    if (!recovery.ready || finished.current || (!dirty && !hasDraft.current)) return;
    hasDraft.current = true;
    void recovery.save(draftContent());
  }, [recovery.ready, dirty, name, meal, useIngredientTotals, ingredientsOpen, totalsInput, items, editor, editingId, unit, amount, step, details, logged, saveRecipe, batchServings, batchWeight]);

  function draftContent() {
    return JSON.stringify({ version: 5, name, meal, mode: useIngredientTotals ? "ingredients" : "totals", ingredientsOpen, totals: totalsInput, items, editor, editingId, unit, amount,
      step: step === "portion" || step === "manual" ? step : "meal", details, logged, saveRecipe, batchServings, batchWeight, recordId: recordId.current });
  }

  const searching = Boolean(query.trim());
  const choices = useMemo(() => searching ? foodChoices([], [], query, catalog).slice(0, 30) : [], [query, searching]);
  const recent = step === "recent" ? recentMeals(data.foodEntries, recentQuery) : [];
  const total = ingredientTotals(items);
  const usesIngredients = recipeOnly || (useIngredientTotals && items.length > 0);
  const canEdit = !saving && !logged;
  const ingredientHeading = items.length || ingredientsOpen ? "Ingredients" : "Add ingredients";
  const selected = editor ? withPortion(editor, amount, unit) : null;
  const portion = ingredientTotals(selected ? [selected] : []);
  const validPortion = portion.loggable && selected?.reviewed !== false && (editingId !== null || items.length < 100);
  const ready = recovery.ready && (recipeOnly ? data.recipesReady : data.foodJournalReady);
  const mealActionDisabled = saving || !ready || (usesIngredients && !total.loggable);

  function dismissKeyboard() { Keyboard.dismiss(); if (Platform.OS === "web" && typeof document !== "undefined") (document.activeElement as HTMLElement | null)?.blur(); }
  function openPortion(item: ScanIngredient, id: string | null = null) {
    setEditor({ ...item }); setEditingId(id); setDetails(false); setError(null); setGramReference(false);
    const grams = portionGrams(item);
    const preferred = item.portion?.unit;
    const nextUnit = preferred && (preferred === "serving" || grams !== null) ? preferred : grams !== null ? "g" : "serving";
    setUnit(nextUnit);
    setAmount(preferred === nextUnit && item.portion?.text !== undefined ? item.portion.text : display(read(item.servings) * (nextUnit === "serving" ? 1 : (grams ?? 1) / (nextUnit === "oz" ? 28.349523125 : 1))));
    setStep("portion");
  }
  function choose(choice: FoodChoice) {
    if (choice.source === "common") openPortion({ ...scannedIngredient({ ...choice.food.per100g, name: choice.food.name, basis: "100 g", source: "manual" }), provider: choice.food.id.startsWith("usda-") ? "USDA" : "SwoleMates catalog", externalId: choice.food.id });
  }
  function addPortion() {
    if (!selected || !validPortion || logged) return;
    setItems(current => editingId ? current.map(item => item.id === editingId ? selected : item) : [...current, selected]);
    if (!editingId) setUseIngredientTotals(true);
    setIngredientsOpen(true); setNotice("");
    dismissKeyboard(); setEditor(null); setEditingId(null); setStep("meal"); setQuery(""); setShowLookup(false);
  }
  function removeIngredient(item: ScanIngredient, index: number) {
    setUndo({ item, index, usedInTotal: usesIngredients, until: Date.now() + 10000 });
    setItems(current => current.filter(food => food.id !== item.id));
    if (items.length === 1 && !recipeOnly) setUseIngredientTotals(false);
  }
  function undoRemove() {
    if (!undo) return;
    if (Date.now() < undo.until && items.length < 100) {
      setItems(current => [...current.slice(0, undo.index), undo.item, ...current.slice(undo.index)]);
      if (undo.usedInTotal) setUseIngredientTotals(true);
    }
    setUndo(null);
  }
  function manual() { dismissKeyboard(); setEditor(scannedIngredient({ name: query.trim(), basis: "1 serving", source: "manual", calories: null, protein: null, carbs: null, fats: null })); setEditingId(null); setDetails(false); setAmount("1"); setUnit("serving"); setStep("manual"); setError(null); }
  function fillRecent(previous: FoodLogEntry) {
    const next = mealSeed(previous);
    setName(next.name); setUseIngredientTotals(next.hasIngredients); setIngredientsOpen(next.hasIngredients); setItems(next.items); setTotalsInput(next.totals);
    setUndo(null); setSaveRecipe(false); setNameRequired(false); setQuery(""); setShowLookup(false);
    setReplaceWith(null); setRecentQuery(""); setNotice(""); back();
  }
  async function addRecipe(recipe: SavedMeal) {
    if (lock.current || addingSavedMealId !== null || !data.foodJournalReady) return;
    lock.current = true; setSaving(true); setFailedRecipeId(null); setError(null);
    try {
      const category = await onAddSavedMeal(recipe, date);
      if (owner.current !== currentAccount.current) return;
      if (!category) { setFailedRecipeId(recipe.id); setError(`Could not log ${recipe.name}. Please try again.`); return; }
      back(); setNotice(`${recipe.name} logged to ${category.toLowerCase()}.`);
    } finally { lock.current = false; setSaving(false); }
  }
  async function finish() { finished.current = true; await recovery.clear(); onClose(); }
  async function save() {
    if (lock.current || !ready || (usesIngredients && (!total.loggable || items.some(item => item.reviewed === false)))) return;
    const title = name.trim();
    if (!title) { setNameRequired(true); scrollRef.current?.scrollTo({ y: 0, animated: true }); return; }
    const category = entry || logged ? meal : mealAt();
    const food = usesIngredients ? draftFood(title, category, items) : mealFromTotals(title, category, totalsInput);
    if (!food) { setError("Enter calories and use valid numbers for any macros you know."); return; }
    const shouldSaveRecipe = recipeOnly || (saveRecipe && usesIngredients);
    const recipe = shouldSaveRecipe ? recipeFood(title, category, items, recipeOnly ? read(batchServings) : 1, recipeOnly && batchWeight.trim() ? read(batchWeight) : undefined) : null;
    if (shouldSaveRecipe && !recipe) { setError("Enter a positive recipe yield (up to 100 servings) and a valid finished weight."); return; }
    lock.current = true; setSaving(true); setError(null);
    let mealLogged = logged;
    try {
      if (!recordId.current) {
        recordId.current = `food-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        await recovery.save(draftContent());
      }
      if (owner.current !== currentAccount.current) return;
      if (!recipeOnly && !logged) {
        const saved = entry ? await data.updateFoodEntry(entry.id, { ...food, artwork: entry.artwork }) : await data.addFoodEntry(food, date, recordId.current);
        if (!saved) { setError("Could not save this meal. Your draft is kept; please retry."); return; }
        mealLogged = true; setLogged(true); setMeal(category);
      }
      if (owner.current !== currentAccount.current) return;
      if (recipe) {
        const saved = recipeOnly && entry ? await data.updateSavedMeal(entry.id, { ...recipe, artwork: entry.artwork }) : await data.saveMeal(recipe, `recipe-${recordId.current}`);
        if (!saved) { setError(recipeOnly ? "Could not save your recipe. Your draft is kept." : "Your meal is logged. The recipe could not be saved; retry or finish without it."); return; }
      }
      if (owner.current !== currentAccount.current) return;
      const confirmed = usesIngredients ? items.filter(item => item.barcode && item.reviewed === true) : [];
      const accountId = data.accountUserId;
      if (confirmed.length && accountId) {
        void import("@/scanning/product-memory").then(({ rememberConfirmedIngredients }) => rememberConfirmedIngredients(confirmed, accountId)).catch(() => undefined);
      }
      await finish();
    } catch { setError(mealLogged ? "Your meal is logged. Retry the recipe save, or finish without it." : "Could not save. Your draft is kept; retry when ready."); }
    finally { lock.current = false; setSaving(false); }
  }
  function back() { dismissKeyboard(); setStep("meal"); setError(null); setEditor(null); setEditingId(null); setReplaceWith(null); setFailedRecipeId(null); }
  function requestClose() { if (!lock.current) { if (step === "meal") onClose(); else back(); } }
  const summary = (values: ReturnType<typeof ingredientTotals>) => <View style={s.macros}>{nutritionKeys.map(key => <View key={key} style={{ flex: 1, gap: 3 }}><AppText size={key === "calories" ? 24 : 18} weight="bold">{display(values[key] ?? values.known[key])}{key !== "calories" ? "g" : ""}</AppText><AppText size={11} muted>{values[key] === null ? "Known " : ""}{key === "calories" ? "kcal" : key === "fats" ? "Fat" : key === "protein" ? "Protein" : "Carbs"}</AppText></View>)}</View>;
  const nutritionFields = () => editor ? <View style={{ gap: 12 }}>
    {<Field label="Food name"><Input bordered accessibilityLabel="Ingredient name" placeholder="e.g. Homemade soup" value={editor.name} onChangeText={value => setEditor({ ...editor, name: value, reviewed: editor.source === "manual" ? editor.reviewed : false })} /></Field>}
    <View style={s.fields}>{nutritionKeys.map(key => <Field key={key} label={labels[key]} style={s.nutrientField}><Input bordered accessibilityLabel={`Ingredient ${labels[key]}`} keyboardType="decimal-pad" value={editor[key]} placeholder={key === "calories" ? "Required" : "Unknown"} onChangeText={value => setEditor({ ...editor, [key]: value, reviewed: editor.source === "manual" ? editor.reviewed : false })} /></Field>)}</View>
    <AppText size={12} muted>Per {editor.basis}. Blank macros stay unknown.</AppText>
  </View> : null;
  const foodResults = () => <View>
    {choices.map(choice => <Pressable key={choice.key} accessibilityRole="button" accessibilityLabel={`Choose ${choice.food.name}`} disabled={saving} onPress={() => { dismissKeyboard(); choose(choice); }} style={[s.result, { borderColor: c.border }]}>
      <AppText weight="semibold">{choice.food.name}</AppText>
      <AppText size={11} muted>{choice.source === "common" ? `${choice.food.per100g.calories} kcal / 100 g · ${choice.food.id.startsWith("usda-") ? "USDA" : "Catalog"}` : `${choice.food.calories} kcal / saved portion`}</AppText>
    </Pressable>)}
    {!choices.length ? <AppText size={13} muted style={{ paddingVertical: 10 }}>No matching food. Try another name or add the ingredient manually.</AppText> : null}
  </View>;

  const titles = { meal: recipeOnly ? entry ? "Edit recipe" : "Save a recipe" : entry ? "Edit meal" : "Log food", portion: "Choose your amount", manual: "Add ingredient", scan: "Scan food", recent: "Recent meals", saved: "Saved recipes" };
  const picker = step === "recent" || step === "saved";
  return <Modal animationType="slide" transparent visible onRequestClose={requestClose}><View style={[s.overlay, { backgroundColor: c.sheetOverlay }]}>
    {!recovery.ready ? <View style={[s.root, { backgroundColor: c.background, padding: 24, gap: 16 }]}><AppText muted>Restoring your meal…</AppText><SecondaryButton onPress={onClose}>Close</SecondaryButton></View> :
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[s.root, keyboardOpen && { height: "100%" }]}>
    <View style={[s.sheet, { backgroundColor: c.background, borderColor: c.border }]}>
      <View style={[s.header, { borderColor: c.border }]}>
        <View style={{ flex: 1, gap: 3 }}><AppText size={keyboardOpen ? 22 : 28} weight="black" accessibilityRole="header">{titles[step]}</AppText>{!recipeOnly && !keyboardOpen && (step === "meal" || step === "saved") ? <AppText size={12} muted>{dateLabel(date)}</AppText> : null}</View>
        {keyboardOpen ? <Pressable accessibilityRole="button" accessibilityLabel="Done typing" onPress={dismissKeyboard} style={s.iconButton}><AppText primary>Done</AppText></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={step === "meal" ? "Close food logger" : "Back to meal"} disabled={saving} onPress={requestClose} style={s.iconButton}><AppText size={23} muted>{step === "meal" ? "×" : "‹"}</AppText></Pressable>
      </View>
      {step === "scan" ? <FoodScanner onDetected={food => openPortion(fillScannedIngredient(food))} onUse={(_food, scanned) => { if (scanned[0]) openPortion({ ...scanned[0], reviewed: false }); }} onClose={back} /> : <ScrollBody key={step} ref={scrollRef} style={{ flex: 1, minHeight: 0 }} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {step === "meal" ? <>
          {!entry && !recipeOnly && !logged ? <View style={s.reuseActions}>
            {([
              { label: "Recent meals", icon: icons.clock, target: "recent" },
              { label: "Saved recipes", icon: icons.chef, target: "saved" },
            ] as const).map(action => <Pressable key={action.target} accessibilityRole="button" accessibilityLabel={action.label} disabled={saving} onPress={() => {
              dismissKeyboard(); setError(null); setRecentQuery(""); setStep(action.target);
            }} style={({ pressed }) => [s.reuseButton, { backgroundColor: pressed ? c.surfaceRaised : c.surface, borderColor: pressed ? c.borderStrong : c.border }]}>
              <View style={[s.reuseIcon, { backgroundColor: c.primaryTint }]}><Icon source={action.icon} size={16} tint={c.accent} /></View>
              <AppText size={13} weight="semibold" style={{ flexShrink: 1 }}>{action.label}</AppText>
            </Pressable>)}
          </View> : null}
          {notice ? <AppText accessibilityLiveRegion="polite" size={13} weight="semibold" color={c.success}>{notice}</AppText> : null}
          <Field label={recipeOnly ? "Recipe name (required)" : "Meal name (required)"}>
            <Input bordered accessibilityLabel={recipeOnly ? "Recipe name" : "Meal name"} placeholder="e.g. Chicken and rice bowl" value={name} editable={canEdit} onChangeText={value => { setName(value); setNotice(""); if (value.trim()) setNameRequired(false); }} style={nameRequired ? { borderColor: c.danger } : undefined} />
            {nameRequired ? <AppText accessibilityLiveRegion="polite" size={12} color={c.danger}>Enter a {recipeOnly ? "recipe" : "meal"} name to continue.</AppText> : null}
          </Field>
          {usesIngredients ? items.length > 0 && <View style={[s.summary, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={s.summaryHeader}>
              <View style={{ flex: 1, gap: 3 }}><AppText size={11} weight="bold" upper>{recipeOnly ? "Batch total" : "Meal totals"}</AppText><AppText size={12} muted>Calculated from ingredients</AppText></View>
              {!recipeOnly && hasManualTotals && canEdit ? <Pressable accessibilityRole="button" accessibilityHint="Keeps your ingredients in the draft" onPress={() => { setUseIngredientTotals(false); setIngredientsOpen(true); setError(null); }} style={s.textButton}><AppText size={12} weight="semibold" primary>Use manual totals</AppText></Pressable> : null}
            </View>
            {summary(total)}
            {!total.complete ? <AppText size={12} muted>Some macros are unknown.</AppText> : null}
          </View> : <View style={s.fields}>
            {nutritionKeys.map(key => <Field key={key} label={labels[key]} style={s.nutrientField}><Input bordered accessibilityLabel={labels[key]} keyboardType="decimal-pad" value={totalsInput[key]} editable={canEdit} placeholder={key === "calories" ? "Required" : "Optional"} onChangeText={value => { setTotalsInput(current => ({ ...current, [key]: value })); setNotice(""); setError(null); }} /></Field>)}
          </View>}
          <View style={recipeOnly ? s.recipeIngredients : [s.ingredientSection, { borderColor: c.border, backgroundColor: c.surface }]}>
            {!recipeOnly ? <Pressable accessibilityRole="button" accessibilityLabel={ingredientHeading} aria-expanded={ingredientsOpen} disabled={saving} onPress={() => {
              dismissKeyboard(); setIngredientsOpen(!ingredientsOpen);
              if (ingredientsOpen) { setShowLookup(false); setQuery(""); }
            }} style={({ pressed }) => [s.ingredientHeader, { backgroundColor: pressed ? c.surfaceRaised : c.surface }]}>
              <View style={{ flex: 1, gap: 4 }}>
                <AppText size={15} weight="bold">{ingredientHeading}</AppText>
                <AppText size={12} muted>{items.length ? `${items.length} ingredient${items.length === 1 ? "" : "s"}` : "Calculate totals from the foods in your meal"}</AppText>
              </View>
              <View style={ingredientsOpen ? { transform: [{ rotate: "180deg" }] } : undefined}><Icon source={icons.chevronDown} size={18} tint={c.muted} /></View>
            </Pressable> : null}
            {recipeOnly || ingredientsOpen ? <View style={recipeOnly ? s.recipeIngredients : s.ingredientBody}>
              {canEdit ? <View style={s.row}>
                <SecondaryButton style={s.findAction} height={44} fontSize={13} disabled={items.length >= 100} onPress={manual}>Add ingredient</SecondaryButton>
                <SecondaryButton style={s.findAction} height={44} fontSize={13} aria-expanded={showLookup} disabled={items.length >= 100} onPress={() => setShowLookup(value => !value)}>{showLookup ? "Hide lookup" : "Find or scan food"}</SecondaryButton>
              </View> : null}
              {showLookup && canEdit ? <View style={[s.finder, { backgroundColor: c.background, borderColor: c.border }]}>
                <Field label="Find food"><Input bordered accessibilityLabel="Search food database" placeholder="Search foods or ingredients" value={query} onChangeText={setQuery} /></Field>
                <SecondaryButton height={44} onPress={() => { dismissKeyboard(); setStep("scan"); }}>Scan food</SecondaryButton>
                {searching ? foodResults() : null}
              </View> : null}
              {canEdit && !usesIngredients && items.length ? <View style={{ gap: 6 }}>
                <AppText size={12} muted>Your meal currently uses manual totals.</AppText>
                <SecondaryButton height={44} fontSize={13} onPress={() => { setUseIngredientTotals(true); setError(null); }}>Use ingredient totals</SecondaryButton>
              </View> : null}
              {items.length > 0 ? <View>
                {items.map((item, index) => {
                  const values = ingredientTotals([item]), grams = portionGrams(item);
                  const quantity = grams !== null ? `${display(read(item.servings) * grams)} g`
                    : item.basis === "1 serving" ? `${item.servings} serving${read(item.servings) === 1 ? "" : "s"}` : `${item.servings} × ${item.basis}`;
                  return <View key={item.id} style={[s.food, { borderColor: c.border }]}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Edit portion for ${item.name}`} disabled={!canEdit} onPress={() => openPortion(item, item.id)} style={s.ingredientRow}>
                      <AppText size={15} weight="semibold">{item.name}</AppText>
                      <AppText size={12} muted>{quantity} · {values.calories ?? "—"} kcal</AppText>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`} disabled={!canEdit} onPress={() => removeIngredient(item, index)} style={s.iconButton}><AppText size={23} muted>×</AppText></Pressable>
                  </View>;
                })}
              </View> : null}
              {undo && canEdit ? <SecondaryButton height={44} onPress={undoRemove}>Undo remove · {undo.item.name}</SecondaryButton> : null}
            </View> : null}
          </View>
          {recipeOnly ? <><Pressable accessibilityRole="button" onPress={() => setRecipeOptions(value => !value)} style={s.textButton}><AppText size={13} primary>{recipeOptions ? "Hide" : "Edit"} recipe yield · {batchServings} servings</AppText></Pressable>{recipeOptions ? <View style={{ gap: 12 }}><Field label="Batch servings"><Input bordered accessibilityLabel="Batch servings" keyboardType="decimal-pad" value={batchServings} onChangeText={setBatchServings} /></Field><Field label="Finished batch weight (g), optional"><Input bordered accessibilityLabel="Finished batch weight in grams" keyboardType="decimal-pad" value={batchWeight} onChangeText={setBatchWeight} /></Field></View> : null}</> : null}
          {entry && !recipeOnly && !logged ? <Field label="Meal group"><View accessibilityRole="radiogroup" accessibilityLabel="Meal group" style={[s.mealStrip, { backgroundColor: c.segmentSurface }]}>{meals.map(value => <Pressable key={value} disabled={saving} accessibilityRole="radio" aria-checked={meal === value} onPress={() => setMeal(value)} style={[s.meal, { backgroundColor: meal === value ? c.primaryTint : "transparent" }]}><AppText size={12} weight="semibold" primary={meal === value} muted={meal !== value}>{value}</AppText></Pressable>)}</View></Field> : null}
        </> : step === "recent" ? replaceWith ? <>
          <AppText size={18} weight="bold" accessibilityRole="header">Replace your draft?</AppText>
          <AppText size={14} muted>Using {replaceWith.name} will replace the name, totals, and ingredients you’ve entered.</AppText>
          <PrimaryButton onPress={() => fillRecent(replaceWith)}>Replace draft</PrimaryButton>
          <SecondaryButton onPress={() => setReplaceWith(null)}>Keep draft</SecondaryButton>
        </> : <>
          <Field label="Search recent meals"><Input bordered accessibilityLabel="Search recent meals" placeholder="Search by meal name" value={recentQuery} onChangeText={setRecentQuery} /></Field>
          <AppText size={12} muted>Last 7 days</AppText>
          <View>{recent.map(previous => <Pressable key={previous.id} accessibilityRole="button" accessibilityLabel={`Use ${previous.name}, ${dateLabel(previous.date)}, ${previous.calories} calories`} onPress={() => { dismissKeyboard(); if (dirty) setReplaceWith(previous); else fillRecent(previous); }} style={[s.result, { borderColor: c.border }]}>
            <AppText weight="semibold">{previous.name}</AppText><AppText size={12} muted>{dateLabel(previous.date)} · {previous.calories} kcal</AppText>
          </Pressable>)}</View>
          {!recent.length ? <AppText size={13} muted>{recentQuery.trim() ? "No meals match your search." : "Meals you log over the last 7 days appear here."}</AppText> : null}
        </> : step === "saved" ? <>
          <AppText size={13} muted>Add one serving to your journal.</AppText>
          {!data.recipesReady ? <AppText size={13} muted>Loading saved recipes…</AppText> : !data.savedMeals.length ? <AppText size={13} muted>No saved recipes yet.</AppText> : null}
          {data.recipeStorageError ? <AppText size={13} color={c.danger}>{data.recipeStorageError}</AppText> : null}
          {error ? <AppText accessibilityLiveRegion="polite" size={13} color={c.danger}>{error}</AppText> : null}
          <View>{data.savedMeals.map(recipe => <View key={recipe.id} style={[s.savedRow, { borderColor: c.border }]}>
            <View style={{ flex: 1, gap: 4 }}><AppText weight="semibold">{recipe.name}</AppText><AppText size={12} muted>{recipe.calories} kcal per serving</AppText></View>
            <SecondaryButton height={44} fontSize={12} accessibilityLabel={`${failedRecipeId === recipe.id ? "Retry logging" : "Add 1 serving of"} ${recipe.name}`} disabled={saving || addingSavedMealId !== null || !data.foodJournalReady} onPress={() => void addRecipe(recipe)}>{addingSavedMealId === recipe.id ? "Adding…" : failedRecipeId === recipe.id ? "Retry" : "Add 1 serving"}</SecondaryButton>
          </View>)}</View>
        </> : step === "manual" ? <>
          {nutritionFields()}
          <Field label="Servings eaten"><Input bordered accessibilityLabel="Food amount" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} /></Field>
        </> : step === "portion" && editor ? <>
          <View style={{ gap: 5 }}><AppText size={20} weight="bold">{editor.name}</AppText><AppText size={12} muted>{editor.provider ?? editor.source} · nutrition per {editor.basis}</AppText></View>
          <Field label="Amount"><Input bordered accessibilityLabel="Food amount" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} /></Field>
          <View accessibilityRole="radiogroup" accessibilityLabel="Portion unit" style={s.row}>{(portionGrams(editor) === null ? ["serving"] as Unit[] : ["g", "oz", "serving"] as Unit[]).map(value => <SecondaryButton key={value} accessibilityRole="radio" accessibilityState={{ checked: unit === value }} onPress={() => { const grams = portionGrams(editor); const multiplier = read(amount) * (unit === "serving" ? 1 : (unit === "oz" ? 28.349523125 : 1) / (grams ?? 1)); setAmount(Number.isFinite(multiplier) ? display(multiplier * (value === "serving" ? 1 : (grams ?? 1) / (value === "oz" ? 28.349523125 : 1))) : "1"); setUnit(value); }}>{unit === value ? "✓ " : ""}{value === "serving" ? "Servings" : value}</SecondaryButton>)}</View>
          <View style={[s.summary, { backgroundColor: c.surface, borderColor: c.border }]}>{summary(portion)}{!portion.complete ? <AppText size={12} muted>Missing macros stay unknown.</AppText> : null}</View>
          {editor.source !== "manual" ? <Pressable accessibilityRole="checkbox" accessibilityLabel="I checked the serving size and nutrition against the package" accessibilityState={{ checked: editor.reviewed === true }} onPress={() => setEditor({ ...editor, reviewed: editor.reviewed !== true })} style={s.textButton}><AppText size={13}>{editor.reviewed === true ? "☑" : "□"} I checked the serving size and nutrition against the package</AppText></Pressable> : null}
          <Pressable accessibilityRole="button" onPress={() => setDetails(value => !value)} style={s.textButton}><AppText primary size={13}>{details ? "Hide" : "Edit"} nutrition details</AppText></Pressable>
          {details ? <View style={{ gap: 12 }}>{nutritionFields()}<Field label="Nutrition basis"><Input bordered accessibilityLabel="Nutrition serving basis" value={editor.basis} onChangeText={basis => { setEditor({ ...editor, basis, gramsPerServing: undefined }); setUnit("serving"); setAmount("1"); }} /></Field>{portionGrams(editor) === null && !gramReference ? <SecondaryButton onPress={() => setGramReference(true)}>Enter grams per base serving</SecondaryButton> : null}{gramReference ? <Field label="Grams per base serving"><Input bordered accessibilityLabel="Grams per base serving" keyboardType="decimal-pad" value={editor.gramsPerServing ? String(editor.gramsPerServing) : ""} onChangeText={value => setEditor({ ...editor, gramsPerServing: read(value) > 0 ? read(value) : undefined })} /></Field> : null}</View> : null}
        </> : null}
        {!picker && error ? <AppText accessibilityLiveRegion="polite" size={13} color={c.danger}>{error}</AppText> : null}
        {step === "meal" && !error && (recipeOnly || notice) ? <SaveFeedback area={recipeOnly ? "recipes" : "food"} hideSaved /> : null}
        {logged && !saving ? <SecondaryButton onPress={() => void finish()}>Finish without saving recipe</SecondaryButton> : null}
        {step === "meal" && recovery.status && recovery.status !== "Saving draft..." && recovery.status !== "Draft saved" ? <AppText size={11} muted>{recovery.status}</AppText> : null}
      </ScrollBody>}
      {step !== "scan" && !picker && !keyboardOpen ? <View style={[s.footer, { backgroundColor: c.surface, borderColor: c.border }]}>
        {step === "meal" ? <PrimaryButton disabled={mealActionDisabled} style={mealActionDisabled ? s.disabledAction : undefined} onPress={() => void save()}>{saving ? "Saving…" : logged ? "Retry saving recipe" : recipeOnly ? entry ? "Save recipe changes" : "Save recipe" : entry ? "Save meal changes" : "Log meal"}</PrimaryButton> : <PrimaryButton disabled={!validPortion} style={!validPortion ? s.disabledAction : undefined} onPress={addPortion}>{editingId ? "Update portion" : "Add to meal"} · {portion.calories ?? "—"} kcal</PrimaryButton>}
      </View> : null}
    </View>
    </KeyboardAvoidingView>}
  </View></Modal>;
}

export function FoodLogSheet({ visible, ...props }: Props & { visible: boolean }) {
  return visible ? <FoodLogForm {...props} /> : null;
}
const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", alignItems: "center" }, root: { width: "100%", maxWidth: 402, height: "96%" },
  sheet: { flex: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", gap: 8, padding: 18, borderBottomWidth: StyleSheet.hairlineWidth }, body: { padding: 20, gap: 16 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" }, mealStrip: { flexDirection: "row", gap: 3, padding: 4, borderRadius: 13 }, meal: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  textButton: { minHeight: 44, justifyContent: "center" }, iconButton: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }, food: { flexDirection: "row", gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  finder: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 }, findAction: { flex: 1 }, disabledAction: { opacity: 0.45 },
  reuseActions: { flexDirection: "row", gap: 8 },
  reuseButton: { flex: 1, minWidth: 0, minHeight: 54, flexDirection: "row", alignItems: "center", gap: 8, padding: 9, borderWidth: 1, borderRadius: 13 },
  reuseIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  ingredientSection: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  ingredientHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, minHeight: 64 },
  ingredientBody: { paddingHorizontal: 12, paddingBottom: 12, gap: 10 },
  ingredientRow: { flex: 1, minHeight: 44, justifyContent: "center", gap: 4 },
  recipeIngredients: { gap: 12 },
  summaryHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  savedRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  summary: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 }, macros: { flexDirection: "row", gap: 8 }, fields: { flexDirection: "row", flexWrap: "wrap", gap: 12 }, nutrientField: { flexBasis: "45%", flexGrow: 1, minWidth: 0 }, result: { minHeight: 60, gap: 4, justifyContent: "center", paddingVertical: 12, borderBottomWidth: 1 }, footer: { padding: 16, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
});
