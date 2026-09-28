import { useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, View } from "react-native";

import { AppText, Card, Screen, ScrollBody, SectionLabel, TitleBar } from "@/components/ui";
import { discoverExperienceLevels, type DiscoverFilters } from "@/lib/discover";
import type { UserProfile } from "@/lib/profile";
import { useAppTheme } from "@/theme";

type DiscoverFiltersScreenProps = {
  filters: DiscoverFilters;
  profile: UserProfile;
  onChange: (filters: DiscoverFilters) => void;
  onClose: () => void;
};

export function DiscoverFiltersScreen({ filters, profile, onChange, onClose }: DiscoverFiltersScreenProps) {
  const canMatchAvailability = profile.availabilityDays.length > 0 && profile.availabilityTimes.length > 0;
  const availability = [profile.availabilityDays.join(", "), profile.availabilityTimes.join(", ")].filter(Boolean).join(" · ");
  const [draggingSlider, setDraggingSlider] = useState(false);

  return (
    <Screen>
      <TitleBar title="Filters" onBack={onClose} />
      <ScrollBody style={{ flex: 1 }} scrollEnabled={!draggingSlider}>
        <AppText size={13} muted>
          Every filter you set is required. Leave a filter open to include more people.
        </AppText>

        <Card>
          <SectionLabel>Distance</SectionLabel>
          <AppText weight="extrabold">{filters.distance} miles</AppText>
          <RangeSlider
            min={5}
            max={50}
            value={filters.distance}
            onChange={(distance) => onChange({ ...filters, distance })}
            onDragging={setDraggingSlider}
          />
          <AppText size={12} muted>
            People within this many miles of your zip code.
          </AppText>
        </Card>

        <Card>
          <SectionLabel>Gender</SectionLabel>
          <View style={styles.choices}>
            {(
              [
                ["Both", []],
                ["Males", ["Male"]],
                ["Females", ["Female"]],
              ] as const
            ).map(([label, genders]) => (
              <Choice
                key={label}
                label={label}
                selected={filters.genders.length === genders.length && genders.every((gender) => filters.genders.includes(gender))}
                onPress={() => onChange({ ...filters, genders: [...genders] })}
              />
            ))}
          </View>
          <AppText size={12} muted>
            Both includes every gender. Males or females leaves other profiles out.
          </AppText>
        </Card>

        <Card>
          <SectionLabel>Age</SectionLabel>
          <AppText weight="extrabold">
            {filters.ageMin}–{filters.ageMax}
          </AppText>
          <AppText size={12} muted>
            Minimum age
          </AppText>
          <RangeSlider
            min={18}
            max={70}
            value={filters.ageMin}
            onChange={(ageMin) => onChange({ ...filters, ageMin, ageMax: Math.max(filters.ageMax, ageMin) })}
            onDragging={setDraggingSlider}
          />
          <AppText size={12} muted>
            Maximum age
          </AppText>
          <RangeSlider
            min={18}
            max={70}
            value={filters.ageMax}
            onChange={(ageMax) => onChange({ ...filters, ageMax, ageMin: Math.min(filters.ageMin, ageMax) })}
            onDragging={setDraggingSlider}
          />
        </Card>

        <Card>
          <SectionLabel>Experience</SectionLabel>
          <View style={styles.choices}>
            {discoverExperienceLevels.map((level) => (
              <Choice
                key={level}
                label={level}
                selected={filters.experience.includes(level)}
                onPress={() =>
                  onChange({
                    ...filters,
                    experience: filters.experience.includes(level)
                      ? filters.experience.filter((item) => item !== level)
                      : [...filters.experience, level],
                  })
                }
              />
            ))}
          </View>
          <AppText size={12} muted>
            Leave every level unselected to include all of them.
          </AppText>
        </Card>

        <Card>
          <SectionLabel>Availability</SectionLabel>
          <Choice
            label={filters.matchAvailability ? "Overlapping my schedule" : "Any schedule"}
            selected={filters.matchAvailability}
            onPress={() => {
              if (!canMatchAvailability) return;
              onChange({ ...filters, matchAvailability: !filters.matchAvailability });
            }}
          />
          <AppText size={12} muted>
            {canMatchAvailability
              ? `Matches people who share a day and a time with you: ${availability}.`
              : "Add days and times on your profile before using this filter."}
          </AppText>
        </Card>
      </ScrollBody>
    </Screen>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.choice,
        {
          backgroundColor: selected ? theme.colors.primaryTint : theme.colors.surfaceRaised,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
        },
      ]}
    >
      <AppText size={13} weight="bold" color={selected ? theme.colors.accent : theme.colors.text}>
        {label}
      </AppText>
    </Pressable>
  );
}

const THUMB = 28;

function RangeSlider({
  min,
  max,
  value,
  onChange,
  onDragging,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  onDragging: (dragging: boolean) => void;
}) {
  const theme = useAppTheme();
  const trackRef = useRef<View>(null);
  const width = useRef(1);
  const originX = useRef(0);
  const change = useRef(onChange);
  const dragging = useRef(onDragging);
  const active = useRef(false);
  change.current = onChange;
  dragging.current = onDragging;
  const [trackWidth, setTrackWidth] = useState(0);
  const [shown, setShown] = useState(value);
  if (!active.current && shown !== value) setShown(value);

  const rememberTrack = () => {
    trackRef.current?.measureInWindow((x, _y, measuredWidth) => {
      originX.current = x;
      if (measuredWidth > 0) width.current = measuredWidth;
    });
  };

  const setFromPageX = (pageX: number) => {
    const span = Math.max(1, width.current - THUMB);
    const ratio = Math.min(1, Math.max(0, (pageX - originX.current - THUMB / 2) / span));
    const next = Math.round(min + ratio * (max - min));
    setShown(next);
    change.current(next);
  };

  const finishDrag = () => {
    active.current = false;
    dragging.current(false);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (event) => {
        active.current = true;
        dragging.current(true);
        const pageX = event.nativeEvent.pageX;
        trackRef.current?.measureInWindow((x, _y, measuredWidth) => {
          originX.current = x;
          if (measuredWidth > 0) width.current = measuredWidth;
          setFromPageX(pageX);
        });
      },
      onPanResponderMove: (event) => setFromPageX(event.nativeEvent.pageX),
      onPanResponderRelease: finishDrag,
      onPanResponderTerminate: finishDrag,
    }),
  ).current;

  const span = Math.max(1, trackWidth - THUMB);
  const ratio = (shown - min) / (max - min);
  const thumbLeft = ratio * span;

  return (
    <View
      ref={trackRef}
      accessibilityRole="adjustable"
      accessibilityLabel={`${shown}`}
      collapsable={false}
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width || 1;
        width.current = nextWidth;
        setTrackWidth(nextWidth);
        rememberTrack();
      }}
      {...pan.panHandlers}
      style={styles.hit}
    >
      <View pointerEvents="none" style={[styles.track, { backgroundColor: theme.colors.surfaceRaised }]} />
      <View
        pointerEvents="none"
        style={[styles.fill, { width: thumbLeft + THUMB / 2, backgroundColor: theme.colors.primary }]}
      />
      <View pointerEvents="none" style={[styles.thumb, { left: thumbLeft, backgroundColor: theme.colors.primary }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  choices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  choice: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  hit: {
    height: 44,
    justifyContent: "center",
  },
  track: {
    borderRadius: 999,
    height: 6,
  },
  fill: {
    borderRadius: 999,
    height: 6,
    left: 0,
    position: "absolute",
  },
  thumb: {
    borderRadius: THUMB / 2,
    height: THUMB,
    position: "absolute",
    top: (44 - THUMB) / 2,
    width: THUMB,
  },
});
