import { Pressable } from "react-native";

import { AppText, Card, Screen, ScrollBody, SectionLabel } from "@/components/ui";
import { useAppTheme } from "@/theme";

export function RecipesScreen({ embedded = false, onBack }: { embedded?: boolean; onBack?: () => void }) {
  const theme = useAppTheme();
  const body = (
    <ScrollBody contentContainerStyle={{ gap: 16, paddingBottom: 30 }}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back to tracker" hitSlop={8} onPress={onBack}>
          <AppText size={13} weight="extrabold" primary>
            ‹ Tracker
          </AppText>
        </Pressable>
      ) : null}
      <SectionLabel>Recipes</SectionLabel>
      <AppText size={28} weight="black">
        Build meals that match your macros.
      </AppText>
      <AppText muted style={{ lineHeight: 21 }}>
        Save recipes, swap ingredients, and tweak meals with AI so they hit your calorie and protein targets.
      </AppText>
      <Card padding={16} radius={18} gap={8} style={{ backgroundColor: theme.colors.primaryDeep }}>
        <AppText size={12} weight="bold" muted upper>
          Coming soon
        </AppText>
        <AppText weight="bold">Personal recipe maker</AppText>
        <AppText size={13} muted style={{ lineHeight: 20 }}>
          This Fuel page is ready for recipes. The tracker stays next door so Home stays about training.
        </AppText>
      </Card>
    </ScrollBody>
  );
  if (embedded) return body;
  return <Screen>{body}</Screen>;
}
