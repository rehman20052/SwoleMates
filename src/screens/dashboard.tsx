import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { icons } from "@/assets";
import {
  AppText,
  Card,
  Icon,
  ProgressBar,
  Screen,
  ScrollBody,
  SectionLabel,
  TitleBar,
} from "@/components/ui";
import { daysFromToday, formatShortDate, useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";

const WEEKLY_GOAL = 5;

function liftGoal(current: number) {
  return Math.ceil((current * 1.1) / 5) * 5;
}

// Personal records come from the profile as strings like "315 lbs" or "N/A".
export function DashboardScreen({ empty, lifts: records }: { empty: ReactNode; lifts: { squat: string; bench: string } }) {
  const theme = useAppTheme();
  const { logs, streak, nutrition } = useAppData();

  if (logs.length === 0) {
    return empty;
  }

  const thisWeek = logs.filter((log) => log.date >= daysFromToday(-6)).length;
  const weekly = Math.min(thisWeek, WEEKLY_GOAL);
  const remaining = WEEKLY_GOAL - weekly;
  const verified = logs.filter((log) => log.verified).length;
  const reliability = Math.round((verified / logs.length) * 100);

  const lifts = (
    [
      ["Squat", parseInt(records.squat, 10)],
      ["Bench", parseInt(records.bench, 10)],
    ] as const
  )
    .filter(([, current]) => current > 0)
    .map(([label, current]) => ({ label, current, goal: liftGoal(current) }));

  return (
    <Screen>
      <TitleBar
        title="Lifting Hub"
        right={
          <View style={styles.tier}>
            <Icon source={icons.award} size={20} />
            <AppText weight="extrabold" primary>
              GOLD TIER
            </AppText>
          </View>
        }
      />

      <ScrollBody>
        <View style={styles.statsRow}>
          <Card padding={14} radius={16} gap={10} style={styles.flex}>
            <View style={styles.statHeader}>
              <AppText size={12} weight="bold" muted>
                Weekly Workouts
              </AppText>
              <Icon source={icons.zap} size={16} />
            </View>
            <View style={[styles.row, { gap: 12 }]}>
              <ProgressRing progress={weekly / WEEKLY_GOAL} label={`${weekly}/${WEEKLY_GOAL}`} />
              <View style={{ gap: 2 }}>
                <AppText size={18} weight="black">
                  {Math.round((weekly / WEEKLY_GOAL) * 100)}%
                </AppText>
                <AppText size={10} primary>
                  {remaining > 0 ? `${remaining} left to goal` : "Goal reached!"}
                </AppText>
              </View>
            </View>
          </Card>

          <Card padding={14} radius={16} gap={10} style={styles.flex}>
            <View style={styles.statHeader}>
              <AppText size={12} weight="bold" muted>
                Lifting Streak
              </AppText>
              <Icon source={icons.flame} size={16} />
            </View>
            <View style={{ gap: 2 }}>
              <AppText size={28} weight="black">
                {streak} {streak === 1 ? "Day" : "Days"}
              </AppText>
              <AppText size={10} muted>
                Partner reliability: {reliability}%
              </AppText>
            </View>
          </Card>
        </View>

        {lifts.length ? (
          <Card padding={16} radius={18} gap={12}>
            <SectionLabel>Strength Progress</SectionLabel>
            {lifts.map((lift) => (
              <View key={lift.label} style={{ gap: 6 }}>
                <View style={styles.statHeader}>
                  <AppText size={13} weight="bold">
                    {lift.label}
                  </AppText>
                  <AppText size={11} muted>
                    {lift.current} lbs / {lift.goal} lbs
                  </AppText>
                </View>
                <ProgressBar progress={lift.current / lift.goal} />
              </View>
            ))}
          </Card>
        ) : null}

        <View style={{ gap: 8 }}>
          <AppText size={13} weight="extrabold" upper>
            Matched Sessions Log
          </AppText>
          {logs.map((log) => (
            <Card key={log.id} padding={12} radius={12} style={styles.logRow}>
              <View style={[styles.row, { flex: 1, gap: 12 }]}>
                <View style={[styles.dateChip, { backgroundColor: theme.colors.surfaceRaised }]}>
                  <AppText size={11} weight="extrabold" primary>
                    {formatShortDate(log.date)}
                  </AppText>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText size={13} weight="bold" numberOfLines={1}>
                    {log.title}
                  </AppText>
                  <AppText size={11} muted>
                    {log.verified ? "Verified partner attendance" : "Self-logged session"}
                  </AppText>
                </View>
              </View>
              {log.verified ? <Icon source={icons.checkCircle} size={16} /> : null}
            </Card>
          ))}
        </View>

        {nutrition ? (
          <View style={{ gap: 8 }}>
            <AppText size={13} weight="extrabold" upper>
              Today's Nutrition Intake
            </AppText>
            <View style={styles.macroRow}>
              {(
                [
                  ["Calories", nutrition.calories],
                  ["Protein", nutrition.protein],
                  ["Carbs", nutrition.carbs],
                  ["Fats", nutrition.fats],
                ] as const
              ).map(([label, value]) => (
                <Macro key={label} label={label} value={value} />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollBody>
    </Screen>
  );
}

function Macro({ label, value }: { label: string; value: string }) {
  const theme = useAppTheme();

  return (
    <View style={[styles.macro, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <AppText weight="black">{value}</AppText>
      <AppText size={10} muted>
        {label}
      </AppText>
    </View>
  );
}

function ProgressRing({ progress, label }: { progress: number; label: string }) {
  const theme = useAppTheme();
  const size = 42;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <View style={styles.ring}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.colors.border} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.colors.primary}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - Math.min(1, progress))}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <AppText size={11} weight="extrabold">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tier: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  flex: {
    flex: 1,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
  },
  statHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  ring: {
    alignItems: "center",
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  logRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dateChip: {
    borderRadius: 8,
    padding: 8,
  },
  macroRow: {
    flexDirection: "row",
    gap: 8,
  },
  macro: {
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    padding: 10,
  },
});
