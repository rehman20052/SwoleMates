import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Dimensions, Easing, Platform, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useAppTheme } from "@/theme";

// Finite animations: no perpetual shimmer or work running between updates.
export function LiftProgressBar({ progress, name }: { progress: number; name: string }) {
  const theme = useAppTheme();
  const target = Math.max(0, Math.min(1, progress));
  const fill = useRef(new Animated.Value(target)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const swell = useRef(new Animated.Value(0)).current;
  const container = useRef<View>(null);
  const [visible, setVisible] = useState(false);
  const previous = useRef<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") {
      const element = container.current as unknown as HTMLElement | null;
      if (!element || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
      // A scroll container clips intersections too. Start only after most of
      // the bar appears; rearm after it leaves, not on tiny scroll movements.
      const observer = new IntersectionObserver(([entry]) => {
        setVisible(current => current ? entry.isIntersecting && entry.intersectionRatio > 0.05 : entry.isIntersecting && entry.intersectionRatio >= 0.6);
      }, { threshold: [0, 0.05, 0.6, 1] });
      observer.observe(element);
      return () => observer.disconnect();
    }
    let active = true;
    const measure = () => container.current?.measureInWindow((_x, y, _width, height) => {
      if (!active || height <= 0) return;
      const intersection = Math.max(0, Math.min(y + height, Dimensions.get("window").height) - Math.max(0, y));
      setVisible(current => intersection / height >= (current ? 0.05 : 0.6));
    });
    measure();
    const timer = setInterval(measure, 250);
    return () => { active = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      const update = () => setReducedMotion(media.matches);
      update(); media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReducedMotion(value); }).catch(() => { if (active) setReducedMotion(true); });
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    return () => { active = false; listener.remove(); };
  }, []);

  useEffect(() => {
    fill.stopAnimation(); sweep.stopAnimation(); pulse.stopAnimation(); swell.stopAnimation();
    sweep.setValue(0); pulse.setValue(0); swell.setValue(0);
    if (!visible) {
      previous.current = null;
      fill.setValue(reducedMotion ? target : 0);
      return;
    }
    if (reducedMotion === null) { fill.setValue(target); return; }
    const last = previous.current;
    previous.current = target;
    if (reducedMotion) { fill.setValue(target); return; }
    const entered = last === null;
    const increased = last !== null && target > last;
    const reached = last !== null && last < 1 && target >= 1;
    if (entered) fill.setValue(0);
    const animations = [Animated.timing(fill, { toValue: target, duration: entered ? 950 : 700, easing: Easing.out(Easing.cubic), useNativeDriver: false })];
    if (entered) animations.push(Animated.sequence([
      Animated.timing(swell, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.delay(400),
      Animated.timing(swell, { toValue: 0, duration: 430, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ]));
    if ((entered || increased) && target > 0) animations.push(Animated.timing(sweep, { toValue: 1, duration: 1150, easing: Easing.inOut(Easing.quad), useNativeDriver: false }));
    if (increased) animations.push(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: reached ? 350 : 220, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0, duration: reached ? 1050 : 650, useNativeDriver: false }),
    ]));
    const animation = Animated.parallel(animations);
    animation.start();
    return () => animation.stop();
  }, [target, reducedMotion, visible, fill, sweep, pulse, swell]);

  const bright = theme.isDark ? "#CCFF00" : "#73B600";
  return <View ref={container} collapsable={false} accessibilityRole="progressbar" accessibilityLabel={`${name} goal progress`} accessibilityValue={{ min: 0, max: 100, now: Math.round(target * 100) }} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(target * 100)} style={styles.wrapper}>
    <Animated.View style={[styles.wrapper, { transform: [{ scaleX: swell.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) }, { scaleY: swell.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }] }]}>
    <Animated.View pointerEvents="none" style={[styles.halo, { borderColor: bright, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, theme.isDark ? 0.8 : 0.45] }), transform: [{ scaleY: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) }] }]} />
    <View style={[styles.track, { backgroundColor: theme.colors.border }]}>
      <Animated.View style={[styles.fill, { width: fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]}>
        <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 16">
          <Defs><LinearGradient id="energy" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={theme.isDark ? "#729F00" : "#375F00"} />
            <Stop offset="65%" stopColor={theme.colors.primary} />
            <Stop offset="100%" stopColor={bright} />
          </LinearGradient></Defs>
          <Rect width="100" height="16" fill="url(#energy)" />
          <Rect x="0" y="0" width="100" height="2" fill="white" opacity="0.23" />
        </Svg>
        <Animated.View pointerEvents="none" style={[styles.shine, { left: sweep.interpolate({ inputRange: [0, 1], outputRange: ["-25%", "110%"] }), opacity: sweep.interpolate({ inputRange: [0, 0.12, 0.82, 1], outputRange: [0, 0.45, 0.45, 0] }) }]} />
      </Animated.View>
      {[25, 50, 75].map(mark => <View key={mark} pointerEvents="none" style={[styles.tick, { left: `${mark}%`, backgroundColor: theme.colors.surfaceRaised }]} />)}
    </View>
    {target >= 1 ? <View pointerEvents="none" style={[styles.goalDot, { backgroundColor: bright, borderColor: theme.colors.surfaceRaised }]} /> : null}
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  wrapper: { height: 24, justifyContent: "center" },
  track: { height: 16, borderRadius: 8, overflow: "hidden" },
  fill: { height: "100%", overflow: "hidden", borderRadius: 8 },
  shine: { position: "absolute", top: 0, bottom: 0, width: "20%", backgroundColor: "#FFFFFF", transform: [{ skewX: "-20deg" }] },
  tick: { position: "absolute", top: 0, bottom: 0, width: 2 },
  halo: { position: "absolute", left: 0, right: 0, height: 18, borderRadius: 9, borderWidth: 2 },
  goalDot: { position: "absolute", right: -2, height: 12, width: 12, borderRadius: 6, borderWidth: 2 },
});
