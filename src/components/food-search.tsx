import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { AppText, Card, Input, SecondaryButton } from "./ui";
import { foodChoices, type FoodChoice } from "@/lib/food-search";
import type { FoodLogEntry, SavedMeal } from "@/state/app-data";
import { useAppTheme } from "@/theme";

export function FoodSearch({ entries, recipes, ready, onSelect }: {
  entries: FoodLogEntry[]; recipes: SavedMeal[]; ready: boolean; onSelect: (choice: FoodChoice) => void;
}) {
  const theme = useAppTheme();
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(5);
  const choices = useMemo(() => foodChoices(entries, recipes, query), [entries, recipes, query]);
  return <Card padding={14} radius={16} gap={10}>
    <AppText weight="bold">Find food quickly</AppText>
    <AppText size={12} muted>Choose a recent food or saved recipe, then review it before adding.</AppText>
    <Input bordered placeholder="Search recent foods and recipes" accessibilityLabel="Search recent foods and recipes" value={query} onChangeText={value => { setQuery(value); setLimit(5); }} />
    {query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear food search" onPress={() => { setQuery(""); setLimit(5); }}><AppText size={12} primary>Clear search</AppText></Pressable> : null}
    {!ready ? <AppText size={12} muted>Loading your foods and recipes…</AppText> : choices.length ? <>
      {choices.slice(0, limit).map(choice => <Pressable key={choice.key} accessibilityRole="button" accessibilityLabel={`Use ${choice.source === "recent" ? "recent food" : "saved recipe"} ${choice.food.name}`} onPress={() => onSelect(choice)} style={{ paddingVertical: 10, borderTopWidth: 1, borderColor: theme.colors.border, gap: 4 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}><AppText weight="bold" style={{ flex: 1 }}>{choice.food.name}</AppText><AppText size={12} primary>{choice.food.calories} cal</AppText></View>
        <AppText size={11} muted>{choice.source === "recent" ? `Recent food · ${choice.lastLogged}` : "Saved recipe"} · {choice.food.protein}g protein</AppText>
      </Pressable>)}
      {choices.length > limit ? <SecondaryButton height={34} fontSize={12} onPress={() => setLimit(value => value + 10)}>Show more foods ({choices.length - limit})</SecondaryButton> : null}
    </> : <AppText size={12} muted>{query.trim() ? "No matching foods or recipes. Use Add food to enter something new." : "Foods you log will appear here. Your saved recipes are searchable here too."}</AppText>}
  </Card>;
}
