import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { RecipeCard } from "@/components/recipe-card";
import { AppText, Card, Chip, Input, SecondaryButton, Toggle } from "@/components/ui";
import {
  anyOption,
  breakfastStyle,
  buildGoals,
  buildMeals,
  buildRecipes,
  buildStyles,
  type BuildChoice,
  describeUsed,
  findIngredients,
  flavorsForStyle,
  ingredientName,
  popularIngredients,
  suggestIngredients,
} from "@/lib/recipe-builder";
import { type Diet, type Recipe } from "@/lib/recipes";
import { useAppTheme } from "@/theme";

export const builderPageSize = 6;

export function RecipeBuilder({ choice, onChange, shown, onShowMore, diets, allergies, onOpen }: { choice: BuildChoice; onChange: (choice: BuildChoice) => void; shown: number; onShowMore: () => void; diets: Diet[]; allergies: string[]; onOpen: (recipe: Recipe) => void }) {
  const theme = useAppTheme();
  const [text, setText] = useState("");
  const [missing, setMissing] = useState<string[]>([]);

  const result = useMemo(() => buildRecipes(choice, diets, allergies), [choice, diets, allergies]);
  const lastWord = text.split(",").pop() ?? "";
  const suggestions = suggestIngredients(lastWord, choice.picked);
  const quickPicks = popularIngredients.filter((id) => !choice.picked.includes(id)).slice(0, 10);
  const visible = result.recipes.slice(0, shown);
  const flavors = flavorsForStyle(choice.style);

  function changeStyle(style: string) {
    const flavorStillWorks = flavorsForStyle(style).some((flavor) => flavor.id === choice.flavor);
    onChange({ ...choice, style, flavor: flavorStillWorks ? choice.flavor : anyOption });
  }

  function addIngredients(ids: string[]) {
    const next = [...choice.picked];
    for (const id of ids) {
      if (!next.includes(id)) next.push(id);
    }
    onChange({ ...choice, picked: next });
  }

  function removeIngredient(id: string) {
    onChange({ ...choice, picked: choice.picked.filter((item) => item !== id) });
  }

  function addTyped() {
    const { found, missing: notFound } = findIngredients(text);
    addIngredients(found);
    setMissing(notFound);
    setText("");
  }

  function addSuggestion(id: string) {
    addIngredients([id]);
    const words = text.split(",");
    words.pop();
    setText(words.length ? `${words.join(",")}, ` : "");
    setMissing([]);
  }

  return (
    <View style={styles.wrap}>
      <Card padding={16} radius={20} gap={12}>
        <View style={styles.header}>
          <AppText size={18} weight="extrabold">What do you have?</AppText>
          <AppText size={13} muted>Type a few ingredients, or tap the ones below.</AppText>
        </View>
        <Input
          value={text}
          onChangeText={(value) => {
            setText(value);
            setMissing([]);
          }}
          onSubmitEditing={addTyped}
          returnKeyType="done"
          placeholder="e.g. chicken, rice, broccoli"
          accessibilityLabel="Type ingredients"
          bordered
        />
        {text.trim() ? (
          <View style={styles.chips}>
            {suggestions.map((id) => <Chip key={id} label={`+ ${ingredientName(id)}`} onPress={() => addSuggestion(id)} />)}
            <Chip label="Add all" selected onPress={addTyped} />
          </View>
        ) : (
          <View style={styles.chips}>
            {quickPicks.map((id) => <Chip key={id} label={`+ ${ingredientName(id)}`} onPress={() => addIngredients([id])} />)}
          </View>
        )}
        {missing.length ? <AppText size={12} color={theme.colors.danger}>{`Couldn't find ${missing.join(", ")}. Try another name.`}</AppText> : null}
        {choice.picked.length ? (
          <View style={styles.picked}>
            <View style={styles.row}>
              <AppText size={12} weight="bold" muted upper style={styles.grow}>Your ingredients</AppText>
              <Pressable accessibilityRole="button" accessibilityLabel="Clear all ingredients" hitSlop={8} onPress={() => onChange({ ...choice, picked: [] })}>
                <AppText size={12} weight="bold" primary>Clear</AppText>
              </Pressable>
            </View>
            <View style={styles.chips}>
              {choice.picked.map((id) => <Chip key={id} label={`${ingredientName(id)}  ✕`} selected onPress={() => removeIngredient(id)} />)}
            </View>
          </View>
        ) : null}
      </Card>

      <Card padding={16} radius={20} gap={12}>
        <AppText size={12} weight="bold" muted upper>Meal</AppText>
        <View style={styles.chips}>
          {buildMeals.map((meal) => <Chip key={meal} shape="tag" label={meal} selected={choice.meal === meal} onPress={() => onChange({ ...choice, meal })} />)}
        </View>
        <AppText size={12} weight="bold" muted upper>Goal</AppText>
        <View style={styles.chips}>
          {buildGoals.map((goal) => <Chip key={goal} shape="tag" label={goal} selected={choice.goal === goal} onPress={() => onChange({ ...choice, goal })} />)}
        </View>
        <AppText size={12} weight="bold" muted upper>Dish</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollChips}>
          <Chip shape="tag" label="Any" selected={choice.style === anyOption} onPress={() => changeStyle(anyOption)} />
          {buildStyles.map((style) => <Chip key={style.id} shape="tag" label={style.label} selected={choice.style === style.id} onPress={() => changeStyle(style.id)} />)}
        </ScrollView>
        {choice.style !== breakfastStyle ? (
          <>
            <AppText size={12} weight="bold" muted upper>Flavor</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollChips}>
              <Chip shape="tag" label="Any" selected={choice.flavor === anyOption} onPress={() => onChange({ ...choice, flavor: anyOption })} />
              {flavors.map((flavor) => <Chip key={flavor.id} shape="tag" label={flavor.label} selected={choice.flavor === flavor.id} onPress={() => onChange({ ...choice, flavor: flavor.id })} />)}
            </ScrollView>
          </>
        ) : null}
        <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
        <View style={styles.row}>
          <View style={styles.grow}>
            <AppText weight="semibold">Add a few extras</AppText>
            <AppText size={12} muted>{choice.extras ? "May add other ingredients to round out a dish." : "Only uses your ingredients, plus basics like oil, salt and spices."}</AppText>
          </View>
          <Toggle accessibilityLabel="Add a few extras" value={choice.extras} onChange={(extras) => onChange({ ...choice, extras })} />
        </View>
      </Card>

      {result.skipped.length ? (
        <AppText size={12} color={theme.colors.danger}>{`Left out because of your diet or allergies: ${result.skipped.join(", ")}.`}</AppText>
      ) : null}

      {result.recipes.length ? (
        <>
          <View style={styles.row}>
            <View style={[styles.header, styles.grow]}>
              <AppText size={18} weight="extrabold">{`${result.recipes.length} recipes for you`}</AppText>
              <AppText size={13} muted>Tap one to see the steps, swap ingredients or add it to today.</AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Mix it up" hitSlop={8} onPress={() => onChange({ ...choice, mix: choice.mix + 1 })}>
              <AppText size={13} weight="bold" primary>Mix it up</AppText>
            </Pressable>
          </View>
          {visible.map((item) => (
            <RecipeCard key={item.recipe.id} recipe={item.recipe} macros={item.macros} note={describeUsed(item.used)} onPress={() => onOpen(item.recipe)} />
          ))}
          {result.recipes.length > shown ? <SecondaryButton onPress={onShowMore}>Show more recipes</SecondaryButton> : null}
        </>
      ) : (
        <Card padding={18} radius={18} gap={6}>
          <AppText weight="bold">{choice.picked.length ? "No recipes yet" : "Pick a few ingredients to start"}</AppText>
          <AppText size={13} muted>
            {choice.picked.length
              ? "Add another ingredient, like a vegetable or a grain, or turn on extras."
              : "Or turn on extras to get ideas right away."}
          </AppText>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  header: { gap: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  scrollChips: { gap: 8 },
  picked: { gap: 8 },
  row: { alignItems: "center", flexDirection: "row", gap: 12 },
  grow: { flex: 1 },
  divider: { height: 1 },
});
