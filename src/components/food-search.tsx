import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { AppText, Icon, Input, SecondaryButton } from "./ui";
import { TrainingCard } from "./training-card";
import { icons } from "@/assets";
import { foodChoices, type FoodChoice } from "@/lib/food-search";
import type { FoodLogEntry, SavedMeal } from "@/state/app-data";
import { useAppTheme } from "@/theme";

export function FoodSearch({ entries, recipes, ready, onSelect }: {
  entries: FoodLogEntry[]; recipes: SavedMeal[]; ready: boolean; onSelect: (choice: FoodChoice) => void;
}) {
  const theme = useAppTheme();
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(3);
  const choices = useMemo(() => foodChoices(entries, recipes, query), [entries, recipes, query]);
  return <TrainingCard padding={16} gap={12}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><Icon source={icons.zap} size={24} tint={theme.colors.accent} /><View style={{ flex: 1, gap: 3 }}><AppText size={16} weight="bold">Quick log</AppText><AppText size={12} muted>Recent foods & saved recipes</AppText></View></View>
    <Input bordered placeholder="Search recent foods and recipes" accessibilityLabel="Search recent foods and recipes" value={query} onChangeText={value => { setQuery(value); setLimit(3); }} />
    {query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear food search" onPress={() => { setQuery(""); setLimit(3); }}><AppText size={12} primary>Clear search</AppText></Pressable> : null}
    {!ready ? <AppText size={12} muted>Loading your foods and recipes…</AppText> : choices.length ? <>
      {choices.slice(0, limit).map(choice => <Pressable key={choice.key} accessibilityRole="button" accessibilityLabel={`Use ${choice.source === "recent" ? "recent food" : "saved recipe"} ${choice.food.name}`} onPress={() => onSelect(choice)} style={({ pressed }) => ({ paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: theme.colors.border, backgroundColor: pressed ? theme.colors.primaryTint : "transparent", flexDirection: "row", alignItems: "center", gap: 12 })}>
        <View style={{ flex: 1, gap: 4 }}><AppText size={13} weight="bold">{choice.food.name}</AppText><AppText size={10} muted>{choice.source === "recent" ? "Recent" : "Recipe"} · {choice.food.calories} cal · {choice.food.protein}g protein</AppText></View>
        <View style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: theme.colors.primaryTint }}><AppText size={12} weight="bold" primary>Use</AppText></View>
      </Pressable>)}
      {choices.length > limit ? <SecondaryButton height={34} fontSize={12} onPress={() => setLimit(value => value + 10)}>Show more foods ({choices.length - limit})</SecondaryButton> : null}
    </> : <AppText size={12} muted>{query.trim() ? "No matching foods or recipes. Use Add food to enter something new." : "Foods you log will appear here. Your saved recipes are searchable here too."}</AppText>}
  </TrainingCard>;
}
