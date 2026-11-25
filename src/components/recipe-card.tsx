import { Pressable, StyleSheet, View } from "react-native";

import { AppText, Card } from "@/components/ui";
import { type Macros, type Recipe } from "@/lib/recipes";
import { useAppTheme } from "@/theme";

export function RecipeCard({ recipe, macros, note, warning, faded = false, onPress }: { recipe: Recipe; macros: Macros; note?: string; warning?: string; faded?: boolean; onPress: () => void }) {
  const theme = useAppTheme();
  const details = [recipe.cuisine, `${recipe.minutes} min`];
  if (recipe.blueZone) details.push("Blue Zone");
  const pills = [`${macros.carbs}g carbs`, `${macros.fats}g fat`];

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${recipe.name}`} onPress={onPress}>
      <Card padding={16} radius={18} gap={8} style={{ opacity: faded ? 0.55 : 1 }}>
        <AppText size={11} weight="bold" muted upper>{details.join(" · ")}</AppText>
        <AppText size={17} weight="extrabold">{recipe.name}</AppText>
        <AppText size={13} muted numberOfLines={2}>{recipe.description}</AppText>
        <View style={styles.pills}>
          <View style={[styles.pill, { backgroundColor: theme.colors.surfaceRaised }]}>
            <AppText size={12} weight="bold">{macros.calories} cal</AppText>
          </View>
          <View style={[styles.pill, { backgroundColor: theme.colors.primaryTint }]}>
            <AppText size={12} weight="bold" color={theme.colors.accent}>{macros.protein}g protein</AppText>
          </View>
          {pills.map((pill) => (
            <View key={pill} style={[styles.pill, { backgroundColor: theme.colors.surfaceRaised }]}>
              <AppText size={12} weight="semibold" muted>{pill}</AppText>
            </View>
          ))}
        </View>
        {note ? <AppText size={12} weight="semibold" color={theme.colors.accent}>{note}</AppText> : null}
        {warning ? <AppText size={12} color={theme.colors.danger}>{warning}</AppText> : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
});
