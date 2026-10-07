import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { AppText, Icon, Input, SecondaryButton } from "./ui";
import { TrainingCard } from "./training-card";
import { icons } from "@/assets";
import { foodChoices, type CommonFood, type FoodChoice } from "@/lib/food-search";
import ingredients from "@/data/ingredients.json";
import usdaFoods from "@/data/usda-foods.json";
import type { FoodLogEntry, SavedMeal } from "@/state/app-data";
import { useAppTheme } from "@/theme";

const commonFoods = [...ingredients, ...usdaFoods] as CommonFood[];

export function FoodSearch({ entries, recipes, ready, onSelect, mode = "recent", compact = false }: { entries: FoodLogEntry[]; recipes: SavedMeal[]; ready: boolean; onSelect: (choice: FoodChoice) => void; mode?: "recent" | "find"; compact?: boolean }) {
  const theme = useAppTheme();
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(3);
  const finding = mode === "find";
  const choices = useMemo(() => foodChoices(finding ? [] : entries, finding ? [] : recipes, query, finding ? commonFoods : []), [entries, recipes, query, finding]);
  if (compact && finding) return <View style={{ width: "42%", minWidth: 150, gap: 7, zIndex: 30 }}>
    <AppText size={12} weight="bold" muted>LOOK UP FOOD MACROS</AppText>
    <Input bordered placeholder="Search foods" accessibilityLabel="Look up food macros" value={query} onChangeText={value => { setQuery(value); setLimit(3); }} />
    {query.trim() ? <View style={{ paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, maxHeight: 220, overflow: "hidden" }}>
      {!ready ? <AppText size={11} muted>Loading foods...</AppText> : choices.length ? choices.slice(0, limit).map(choice => choice.source === "common" ? <Pressable key={choice.key} accessibilityRole="button" accessibilityLabel={`Use common food ${choice.food.name}`} onPress={() => { onSelect(choice); setQuery(""); setLimit(3); }} style={({ pressed }) => ({ paddingVertical: 9, borderBottomWidth: 1, borderColor: theme.colors.border, backgroundColor: pressed ? theme.colors.primaryTint : "transparent" })}><AppText size={12} weight="bold" numberOfLines={1}>{choice.food.name}</AppText><AppText size={10} muted>{choice.food.per100g.calories} cal · {choice.food.per100g.protein}g protein / 100g</AppText></Pressable> : null) : <AppText size={11} muted>No foods found. Try another name.</AppText>}
    </View> : null}
  </View>;
  const content = <>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><Icon source={finding ? icons.zap : icons.clock} size={finding ? 18 : 24} tint={theme.colors.accent} /><View style={{ flex: 1, gap: 3 }}><AppText size={finding ? 13 : 16} weight="bold">{finding ? "Look up food macros" : "Recent foods"}</AppText>{!finding ? <AppText size={12} muted>Quickly reuse foods and saved recipes</AppText> : null}</View>{ready && limit > 3 && choices.length > 3 ? <SecondaryButton height={34} fontSize={12} onPress={() => setLimit(3)}>Show less</SecondaryButton> : null}</View>
    <Input bordered placeholder={finding ? "Search common foods" : "Search recent foods and recipes"} accessibilityLabel={finding ? "Search common foods for macro information" : "Search recent foods and recipes"} value={query} onChangeText={value => { setQuery(value); setLimit(3); }} />
    {query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear food search" onPress={() => { setQuery(""); setLimit(3); }}><AppText size={12} primary>Clear search</AppText></Pressable> : null}
    {!ready ? <AppText size={12} muted>Loading your foods and recipes…</AppText> : choices.length ? <>
      {choices.slice(0, limit).map(choice => {
        const common = choice.source === "common";
        const calories = common ? choice.food.per100g.calories : choice.food.calories;
        const protein = common ? choice.food.per100g.protein : choice.food.protein;
        const source = common ? "Common food · per 100 g" : choice.source === "recent" ? "Recent" : "Recipe";
        return <Pressable key={choice.key} accessibilityRole="button" accessibilityLabel={`Use ${common ? "common food" : choice.source === "recent" ? "recent food" : "saved recipe"} ${choice.food.name}`} onPress={() => { onSelect(choice); if (finding) { setQuery(""); setLimit(3); } }} style={({ pressed }) => ({ paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: theme.colors.border, backgroundColor: pressed ? theme.colors.primaryTint : "transparent", flexDirection: "row", alignItems: "center", gap: 12 })}>
          <View style={{ flex: 1, gap: 4 }}><AppText size={13} weight="bold">{choice.food.name}</AppText><AppText size={10} muted>{source} · {calories} cal · {protein}g protein</AppText></View>
          <View style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: theme.colors.primaryTint }}><AppText size={12} weight="bold" primary>Use</AppText></View>
        </Pressable>;
      })}
      {choices.length > limit ? <SecondaryButton height={34} fontSize={12} onPress={() => setLimit(value => value + 10)}>Show more foods ({choices.length - limit})</SecondaryButton> : null}
    </> : query.trim() || !finding ? <AppText size={12} muted>{query.trim() ? (finding ? "No common food found. Try a simpler name." : "No matching foods or recipes. Use Add food to enter something new.") : "Foods you log will appear here. Your saved recipes are searchable here too."}</AppText> : null}
  </>;
  return finding
    ? <View style={{ gap: 8, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border }}>{content}</View>
    : <TrainingCard padding={16} gap={12}>{content}</TrainingCard>;
}
