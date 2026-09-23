import { Pressable, StyleSheet, View } from "react-native";

import { icons } from "@/assets";
import { AppText, Icon } from "@/components/ui";
import { relativeDay, Workout } from "@/state/app-data";
import { useAppTheme } from "@/theme";

export function SessionCard({ workout, label, onPress }: { workout: Workout; label: string; onPress?: () => void }) {
  const theme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
    >
      <View style={[styles.accent, { backgroundColor: theme.colors.primary }]} />
      <View style={styles.body}>
        <View style={styles.row}>
          <View style={[styles.row, { gap: 6 }]}>
            <Icon source={icons.calendarLime} size={16} />
            <AppText size={11} weight="extrabold" primary upper>
              {label}
            </AppText>
          </View>
          <View style={[styles.when, { backgroundColor: theme.colors.surfaceRaised }]}>
            <AppText size={11} weight="bold">
              {relativeDay(workout.date)}
            </AppText>
          </View>
        </View>
        <View style={{ gap: 4 }}>
          <AppText size={15} weight="extrabold">
            {workout.title}
          </AppText>
          <AppText size={13} muted>
            {workout.gym} • {workout.time}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  accent: {
    width: 6,
  },
  body: {
    flex: 1,
    gap: 12,
    padding: 16,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  when: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
});
