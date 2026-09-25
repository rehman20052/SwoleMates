import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui";
import { useAppTheme } from "@/theme";

export function WorkoutHandshake({ name, onDone }: { name: string; onDone: () => void }) {
  const theme = useAppTheme();
  const meet = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let alive = true;
    const animation = Animated.sequence([
      Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.spring(meet, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(shake, { toValue: 1, duration: 70, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -1, duration: 90, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0.6, duration: 80, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 80, useNativeDriver: true }),
      ]),
      Animated.delay(420),
    ]);
    animation.start(({ finished }) => {
      if (alive && finished) done.current();
    });
    return () => {
      alive = false;
      animation.stop();
    };
  }, [fade, meet, shake]);

  const slide = meet.interpolate({ inputRange: [0, 1], outputRange: [78, 0] });
  const lift = meet.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const scale = meet.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] });

  return (
    <Animated.View style={[styles.overlay, { backgroundColor: theme.colors.background, opacity: fade }]}>
      <Animated.View style={{ transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-7, 7] }) }] }}>
        <View style={styles.scene}>
          <Animated.View style={{ transform: [{ translateX: Animated.multiply(slide, -1) }] }}>
            <Hand />
          </Animated.View>
          <Animated.View style={{ transform: [{ translateY: lift }, { scale }] }}>
            <Dumbbell color={theme.colors.primary} />
          </Animated.View>
          <Animated.View style={{ transform: [{ translateX: slide }, { scaleX: -1 }] }}>
            <Hand />
          </Animated.View>
        </View>
      </Animated.View>
      <AppText size={13} weight="bold" primary upper>
        Let's train
      </AppText>
      <AppText size={28} weight="black">
        {name}
      </AppText>
    </Animated.View>
  );
}

function Hand() {
  const theme = useAppTheme();
  const skin = theme.colors.surfaceRaised;
  const edge = theme.colors.primary;
  return (
    <View style={styles.hand}>
      <View style={[styles.fingers, { borderColor: edge }]}>
        <View style={[styles.finger, { backgroundColor: skin, borderColor: edge }]} />
        <View style={[styles.finger, { backgroundColor: skin, borderColor: edge }]} />
        <View style={[styles.finger, { backgroundColor: skin, borderColor: edge }]} />
        <View style={[styles.finger, styles.fingerShort, { backgroundColor: skin, borderColor: edge }]} />
      </View>
      <View style={[styles.palm, { backgroundColor: skin, borderColor: edge }]} />
      <View style={[styles.thumb, { backgroundColor: skin, borderColor: edge }]} />
    </View>
  );
}

function Dumbbell({ color }: { color: string }) {
  return (
    <View style={styles.bell}>
      <View style={[styles.plate, { backgroundColor: color }]} />
      <View style={[styles.plateInner, { backgroundColor: color }]} />
      <View style={[styles.bar, { backgroundColor: color }]} />
      <View style={[styles.plateInner, { backgroundColor: color }]} />
      <View style={[styles.plate, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
    zIndex: 20,
  },
  scene: {
    alignItems: "center",
    flexDirection: "row",
    height: 120,
    justifyContent: "center",
    marginBottom: 18,
  },
  hand: {
    height: 78,
    width: 74,
  },
  fingers: {
    flexDirection: "row",
    gap: 3,
    justifyContent: "flex-end",
    paddingRight: 8,
  },
  finger: {
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderWidth: 2,
    height: 28,
    width: 12,
  },
  fingerShort: {
    height: 22,
    marginTop: 6,
  },
  palm: {
    borderRadius: 16,
    borderWidth: 2,
    height: 46,
    marginTop: -6,
    width: 62,
  },
  thumb: {
    borderRadius: 10,
    borderWidth: 2,
    height: 18,
    position: "absolute",
    right: 0,
    top: 34,
    width: 16,
  },
  bell: {
    alignItems: "center",
    flexDirection: "row",
    marginHorizontal: -8,
    zIndex: 2,
  },
  plate: {
    borderRadius: 8,
    height: 58,
    width: 16,
  },
  plateInner: {
    borderRadius: 5,
    height: 36,
    marginHorizontal: 2,
    width: 8,
  },
  bar: {
    borderRadius: 4,
    height: 10,
    width: 36,
  },
});
