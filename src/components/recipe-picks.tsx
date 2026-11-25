import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { RecipeCard } from "@/components/recipe-card";
import { AppText, Card, SecondaryButton } from "@/components/ui";
import { type QuickPick, quickPicks, recipesForPick } from "@/lib/quick-picks";
import { type Diet, type Recipe } from "@/lib/recipes";
import { useAppTheme } from "@/theme";

export function RecipePicks({ pickId, onPick, diets, allergies, onOpen, onOpenInBuild }: {
  pickId: string | null;
  onPick: (pickId: string) => void;
  diets: Diet[];
  allergies: string[];
  onOpen: (recipe: Recipe) => void;
  onOpenInBuild: (pick: QuickPick) => void;
}) {
  const theme = useAppTheme();
  const pick = quickPicks.find((item) => item.id === pickId) ?? null;
  const recipes = useMemo(() => (pick ? recipesForPick(pick, diets, allergies) : []), [pick, diets, allergies]);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <AppText size={18} weight="extrabold">What are you after?</AppText>
        <AppText size={13} muted>Tap one to see recipes that fit.</AppText>
      </View>

      <View style={styles.grid}>
        {quickPicks.map((item) => {
          const selected = item.id === pickId;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onPick(item.id)}
              style={[
                styles.tile,
                {
                  backgroundColor: selected ? theme.colors.primaryTint : theme.colors.surface,
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                },
              ]}
            >
              <AppText weight="bold">{item.title}</AppText>
              <AppText size={12} muted>{item.subtitle}</AppText>
            </Pressable>
          );
        })}
      </View>

      {pick && recipes.length ? (
        <>
          <View style={styles.header}>
            <AppText size={18} weight="extrabold">{pick.title}</AppText>
            <AppText size={13} muted>{pick.subtitle}. Tap one to see the steps or add it to today.</AppText>
          </View>
          {recipes.map((item) => (
            <RecipeCard key={item.recipe.id} recipe={item.recipe} macros={item.macros} onPress={() => onOpen(item.recipe)} />
          ))}
          <SecondaryButton onPress={() => onOpenInBuild(pick)}>Customize in Build</SecondaryButton>
        </>
      ) : null}
      {pick && !recipes.length ? (
        <Card padding={18} radius={18} gap={6}>
          <AppText weight="bold">No recipes match this yet</AppText>
          <AppText size={13} muted>Try another pick, or loosen your diet and allergy filters.</AppText>
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  header: { gap: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { borderRadius: 16, borderWidth: 1, flexBasis: "47%", flexGrow: 1, gap: 4, minHeight: 76, padding: 14 },
});
