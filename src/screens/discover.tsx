import { Image } from "expo-image";
import { ReactNode, useMemo, useRef } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import { icons } from "@/assets";
import { AppText, Brand, Icon, IconButton, Screen } from "@/components/ui";
import { Partner, partners } from "@/data/partners";
import { useNavigation } from "@/navigation";
import { useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";

const SWIPE_THRESHOLD = 120;

export function DiscoverScreen({ empty }: { empty: ReactNode }) {
  const nav = useNavigation();
  const { swiped, blocked, preferences, swipe } = useAppData();

  const deck = useMemo(() => {
    const maxDistance = preferences.distance * (preferences.expandScope ? 1.2 : 1);
    return partners.filter(
      (partner) => !swiped.includes(partner.id) && !blocked.includes(partner.id) && partner.distance <= maxDistance,
    );
  }, [swiped, blocked, preferences.distance, preferences.expandScope]);

  const current = deck[0];

  if (!current) {
    return empty;
  }

  return (
    <Screen>
      <View style={styles.actionBar}>
        <Brand size="sm" />
        <View style={styles.actionIcons}>
          <IconButton source={icons.sliders} label="Match settings" onPress={() => nav.setTab("Profile")} />
          <IconButton source={icons.bell} label="Partner invites" onPress={() => nav.push({ name: "invites" })} />
        </View>
      </View>

      <SwipeDeck key={current.id} partner={current} onSwipe={(liked) => swipe(current.id, liked)} />
    </Screen>
  );
}

function SwipeDeck({ partner, onSwipe }: { partner: Partner; onSwipe: (liked: boolean) => void }) {
  const theme = useAppTheme();
  const nav = useNavigation();
  const { width } = useWindowDimensions();
  const position = useRef(new Animated.ValueXY()).current;
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;

  function flyOut(liked: boolean) {
    Animated.timing(position, {
      toValue: { x: (liked ? 1 : -1) * width * 1.5, y: 0 },
      duration: 220,
      useNativeDriver: false,
    }).start(() => onSwipeRef.current(liked));
  }

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: Animated.event([null, { dx: position.x, dy: position.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) flyOut(true);
        else if (gesture.dx < -SWIPE_THRESHOLD) flyOut(false);
        else Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      },
    }),
  ).current;

  const rotate = position.x.interpolate({ inputRange: [-width, 0, width], outputRange: ["-12deg", "0deg", "12deg"] });

  return (
    <>
      <View style={styles.viewport}>
        <Animated.View
          {...responder.panHandlers}
          style={[styles.cardWrap, { transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }] }]}
        >
          <MatchCard partner={partner} />
        </Animated.View>
      </View>

      <View style={styles.deckActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Pass on ${partner.name}`}
          onPress={() => flyOut(false)}
          style={[styles.roundButton, styles.large, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
        >
          <Icon source={icons.x} size={24} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Message ${partner.name}`}
          onPress={() => nav.push({ name: "chat", id: partner.id })}
          style={[styles.roundButton, styles.small, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
        >
          <Icon source={icons.messageSquare} size={20} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Send ${partner.name} a partner invite`}
          onPress={() => flyOut(true)}
          style={[styles.roundButton, styles.large, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}
        >
          <Icon source={icons.check} size={26} />
        </Pressable>
      </View>
    </>
  );
}

function MatchCard({ partner }: { partner: Partner }) {
  const theme = useAppTheme();
  const nav = useNavigation();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${partner.name}'s profile`}
      onPress={() => nav.push({ name: "partner", id: partner.id })}
      style={styles.card}
    >
      <Image source={partner.photos[0]} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0, 0, 0, 0.35)" }]} />

      <View style={styles.badges}>
        <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
          <AppText size={13} weight="extrabold" color={theme.colors.primaryText}>
            {partner.match}% Match
          </AppText>
        </View>
        <View style={[styles.badge, styles.safetyBadge, { backgroundColor: theme.colors.scrim }]}>
          <Icon source={icons.shield} size={14} />
          <AppText size={12} weight="bold">
            {partner.safety} Safety
          </AppText>
        </View>
      </View>

      <View style={styles.details}>
        <View style={{ gap: 4 }}>
          <AppText size={26} weight="black">
            {partner.name}, {partner.age}
          </AppText>
          <AppText weight="semibold" primary>
            {partner.style} • {partner.gym}
          </AppText>
        </View>
        <View style={styles.metrics}>
          <View style={[styles.metric, { backgroundColor: theme.colors.glass }]}>
            <AppText size={12} weight="medium">
              {partner.distance} miles away
            </AppText>
          </View>
          <View style={[styles.metric, { backgroundColor: theme.colors.glass }]}>
            <AppText size={12} weight="medium">
              {partner.frequency} Availability
            </AppText>
          </View>
        </View>
        <View style={styles.prGrid}>
          {(
            [
              ["Bench", partner.lifts.bench],
              ["Squat", partner.lifts.squat],
              ["Deadlift", partner.lifts.deadlift],
            ] as const
          ).map(([label, value]) => (
            <View key={label} style={[styles.pr, { borderColor: theme.colors.border }]}>
              <AppText size={9} weight="bold" muted upper>
                {label}
              </AppText>
              <AppText size={13} weight="extrabold">
                {value} lb
              </AppText>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  actionIcons: {
    flexDirection: "row",
    gap: 12,
  },
  viewport: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  cardWrap: {
    flex: 1,
  },
  card: {
    borderRadius: 28,
    flex: 1,
    overflow: "hidden",
  },
  badges: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
  },
  badge: {
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  safetyBadge: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  details: {
    bottom: 0,
    gap: 12,
    left: 0,
    padding: 20,
    position: "absolute",
    right: 0,
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metric: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  prGrid: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 8,
  },
  pr: {
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    padding: 8,
  },
  deckActions: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 48,
    paddingVertical: 12,
  },
  roundButton: {
    alignItems: "center",
    borderWidth: 1,
    justifyContent: "center",
  },
  large: {
    borderRadius: 28,
    height: 56,
    width: 56,
  },
  small: {
    borderRadius: 25,
    height: 50,
    width: 50,
  },
});
