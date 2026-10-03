import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Dimensions, Easing, Platform, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useAppTheme } from "@/theme";

// Finite animations: no perpetual shimmer or work running between updates.
export function LiftProgressBar({ progress, name, replay = 0, onMotionPreference }: { progress: number; name: string; replay?: number; onMotionPreference?: (reduced: boolean) => void }) {
  const theme = useAppTheme();
  const target = Math.max(0, Math.min(1, progress));
  const fill = useRef(new Animated.Value(target)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const swell = useRef(new Animated.Value(0)).current;
  const container = useRef<View>(null);
  const fillElement = useRef<View>(null);
  const swellElement = useRef<View>(null);
  const shineElement = useRef<View>(null);
  const haloElement = useRef<View>(null);
  const previousReplay = useRef(replay);
  const [visible, setVisible] = useState(false);
  const previous = useRef<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);

  // A user pressing Replay is already viewing this row. This also provides a
  // direct start if Safari has missed a visibility notification.
  useEffect(() => { if (replay > 0) setVisible(true); }, [replay]);

  useEffect(() => {
    if (Platform.OS === "web") {
      const element = container.current as unknown as HTMLElement | null;
      if (!element) return;
      let frame = 0;
      const measure = () => {
        frame = 0;
        if (document.hidden) { setVisible(false); return; }
        const box = element.getBoundingClientRect();
        let top = 0;
        let bottom = window.visualViewport?.height ?? window.innerHeight;
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          if (/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowY)) {
            const bounds = parent.getBoundingClientRect();
            top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom);
          }
        }
        const ratio = box.height > 0 ? Math.max(0, Math.min(box.bottom, bottom) - Math.max(box.top, top)) / box.height : 0;
        setVisible(current => ratio >= (current ? 0.05 : 0.6));
      };
      const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
      const resume = () => { if (document.hidden) setVisible(false); else schedule(); };
      // A scroll container clips intersections too. Start only after most of
      // the bar appears; rearm after it leaves, not on tiny scroll movements.
      const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(schedule, { threshold: [0, 0.05, 0.6, 1] });
      observer?.observe(element);
      // Installed Safari can resume without a fresh intersection callback.
      // Capture inner scroller events and rearm on foregrounding as well.
      document.addEventListener("scroll", schedule, true);
      document.addEventListener("visibilitychange", resume);
      window.addEventListener("pageshow", schedule);
      window.addEventListener("resize", schedule);
      schedule();
      return () => {
        observer?.disconnect(); cancelAnimationFrame(frame);
        document.removeEventListener("scroll", schedule, true);
        document.removeEventListener("visibilitychange", resume);
        window.removeEventListener("pageshow", schedule);
        window.removeEventListener("resize", schedule);
      };
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
    const entered = last === null || previousReplay.current !== replay;
    previousReplay.current = replay;
    const increased = last !== null && target > last;
    const reached = last !== null && last < 1 && target >= 1;
    const webFill = fillElement.current as unknown as HTMLElement | null;
    if (Platform.OS === "web" && webFill && typeof webFill.animate === "function") {
      // Browser animations avoid routing every Safari frame through RN's JS driver.
      fill.setValue(target);
      const browserAnimations: Animation[] = [webFill.animate(
        [{ width: `${(entered ? 0 : last ?? target) * 100}%` }, { width: `${target * 100}%` }],
        { duration: entered ? 1200 : 700, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      )];
      const webSwell = swellElement.current as unknown as HTMLElement | null;
      const webShine = shineElement.current as unknown as HTMLElement | null;
      const webHalo = haloElement.current as unknown as HTMLElement | null;
      if (entered && webSwell) browserAnimations.push(webSwell.animate([
        { transform: "scale(1, 1)", offset: 0 },
        { transform: "scale(1.025, 1.35)", offset: 0.2 },
        { transform: "scale(1.025, 1.35)", offset: 0.6 },
        { transform: "scale(1, 1)", offset: 1 },
      ], { duration: 1400, easing: "ease-in-out" }));
      if ((entered || increased) && target > 0 && webShine) browserAnimations.push(webShine.animate([
        { left: "-25%", opacity: 0 }, { left: "0%", opacity: 0.45 },
        { left: "90%", opacity: 0.45 }, { left: "110%", opacity: 0 },
      ], { duration: 1400, easing: "ease-in-out" }));
      if (increased && webHalo) browserAnimations.push(webHalo.animate([
        { opacity: 0, transform: "scaleY(1)" },
        { opacity: 0.65, transform: "scaleY(1.55)" },
        { opacity: 0, transform: "scaleY(1)" },
      ], { duration: reached ? 1400 : 900 }));
      return () => browserAnimations.forEach(animation => animation.cancel());
    }
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
  }, [target, reducedMotion, visible, replay, fill, sweep, pulse, swell]);

  useEffect(() => { if (reducedMotion !== null) onMotionPreference?.(reducedMotion); }, [reducedMotion, onMotionPreference]);

  const bright = theme.isDark ? "#CCFF00" : "#73B600";
  return <View ref={container} collapsable={false} accessibilityRole="progressbar" accessibilityLabel={`${name} goal progress`} accessibilityValue={{ min: 0, max: 100, now: Math.round(target * 100) }} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(target * 100)} style={styles.wrapper}>
    <Animated.View ref={swellElement} style={[styles.wrapper, { transform: [{ scaleX: swell.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) }, { scaleY: swell.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }] }]}>
    <Animated.View ref={haloElement} pointerEvents="none" style={[styles.halo, { borderColor: bright, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, theme.isDark ? 0.8 : 0.45] }), transform: [{ scaleY: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) }] }]} />
    <View style={[styles.track, { backgroundColor: theme.colors.border }]}>
      <Animated.View ref={fillElement} style={[styles.fill, { width: fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]}>
        <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 16">
          <Defs><LinearGradient id="energy" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={theme.isDark ? "#729F00" : "#375F00"} />
            <Stop offset="65%" stopColor={theme.colors.primary} />
            <Stop offset="100%" stopColor={bright} />
          </LinearGradient></Defs>
          <Rect width="100" height="16" fill="url(#energy)" />
          <Rect x="0" y="0" width="100" height="2" fill="white" opacity="0.23" />
        </Svg>
        <Animated.View ref={shineElement} pointerEvents="none" style={[styles.shine, { left: sweep.interpolate({ inputRange: [0, 1], outputRange: ["-25%", "110%"] }), opacity: sweep.interpolate({ inputRange: [0, 0.12, 0.82, 1], outputRange: [0, 0.45, 0.45, 0] }) }]} />
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
