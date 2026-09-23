import { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";

import {
  AppText,
  Card,
  Divider,
  OptionRow,
  RangeSlider,
  Screen,
  ScrollBody,
  SecondaryButton,
  SectionLabel,
  Slider,
  Toggle,
} from "@/components/ui";
import { experienceLevels } from "@/data/partners";
import { useNavigation } from "@/navigation";
import { Gender, useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";

const genders: readonly Gender[] = ["Male", "Female", "Any"];
const shortLevels = ["Beg.", "Int.", "Adv.", "Elite"];

function experienceLabel([low, high]: [number, number]) {
  if (low === high) return experienceLevels[low];
  return `${shortLevels[low]} to ${experienceLevels[high]}`;
}

// The Profile tab: the profile summary (passed in as children) followed by match settings.
export function ProfileScreen({ children }: PropsWithChildren) {
  const nav = useNavigation();
  const { preferences, updatePreferences, resetDeck } = useAppData();

  function update(values: Parameters<typeof updatePreferences>[0]) {
    updatePreferences(values);
    resetDeck();
  }

  return (
    <Screen>
      <ScrollBody>
        {children}
        <AppText size={20} weight="extrabold">
          Match Settings
        </AppText>
        <Card>
          <SectionLabel>Location & Distance</SectionLabel>
          <View style={styles.setting}>
            <View style={styles.settingHeader}>
              <AppText>Maximum Distance</AppText>
              <AppText weight="bold" primary>
                {preferences.distance} miles
              </AppText>
            </View>
            <Slider
              accessibilityLabel="Maximum distance in miles"
              value={preferences.distance}
              min={1}
              max={50}
              onChange={(distance) => update({ distance })}
            />
          </View>
          <Divider />
          <View style={styles.setting}>
            <AppText>Workout Partner Gender</AppText>
            <OptionRow variant="solid" options={genders} value={preferences.gender} onChange={(gender) => update({ gender })} />
          </View>
        </Card>

        <Card>
          <SectionLabel>Compatibility & Style</SectionLabel>
          <View style={styles.setting}>
            <View style={styles.settingHeader}>
              <AppText>Experience Match Range</AppText>
              <AppText size={13} weight="bold" muted>
                {experienceLabel(preferences.experienceRange)}
              </AppText>
            </View>
            <RangeSlider
              accessibilityLabel="Experience match range"
              low={preferences.experienceRange[0]}
              high={preferences.experienceRange[1]}
              min={0}
              max={experienceLevels.length - 1}
              onChange={(low, high) => update({ experienceRange: [low, high] })}
            />
          </View>
          <Divider />
          <View style={styles.setting}>
            <View style={styles.settingHeader}>
              <AppText>Strength Compatibility</AppText>
              <AppText weight="bold" primary>
                +/- {preferences.strengthRange}% Maxes
              </AppText>
            </View>
            <Slider
              accessibilityLabel="Strength compatibility range in percent"
              value={preferences.strengthRange}
              min={5}
              max={50}
              step={5}
              onChange={(strengthRange) => update({ strengthRange })}
            />
          </View>
        </Card>

        <Card padding={16} radius={16} style={styles.switchRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText weight="bold">Expand search scope</AppText>
            <AppText size={11} muted>
              Show profiles slightly outside my limits
            </AppText>
          </View>
          <Toggle
            accessibilityLabel="Expand search scope"
            value={preferences.expandScope}
            onChange={(expandScope) => update({ expandScope })}
          />
        </Card>

        <SecondaryButton height={44} fontSize={13} onPress={nav.signOut}>
          Sign Out
        </SecondaryButton>
      </ScrollBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  setting: {
    gap: 8,
  },
  settingHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});
