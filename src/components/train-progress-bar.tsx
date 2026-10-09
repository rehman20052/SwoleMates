import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, ScrollView, View, useWindowDimensions } from "react-native";

type Visibility = { register: (check: () => void) => () => void; check: () => void; setViewport: (node: ScrollView | null) => void; bounds: () => { top: number; bottom: number } | null };
const VisibilityContext = createContext<Visibility>({ register: () => () => undefined, check: () => undefined, setViewport: () => undefined, bounds: () => null });

export function useProgressVisibility() { return useContext(VisibilityContext); }
export function ProgressVisibilityProvider({ children }: { children: ReactNode }) {
  const checks = useRef(new Set<() => void>());
  const frame = useRef<number | null>(null);
  const viewport = useRef<(ScrollView & { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void }) | null>(null);
  const viewportBounds = useRef<{ top: number; bottom: number } | null>(null);
  const setViewport = useCallback((node: ScrollView | null) => { viewport.current = node as typeof viewport.current; }, []);
  const bounds = useCallback(() => viewportBounds.current, []);
  const register = useCallback((check: () => void) => { checks.current.add(check); return () => { checks.current.delete(check); }; }, []);
  const check = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (viewport.current) viewport.current.measureInWindow((_x, y, _w, h) => { viewportBounds.current = { top: y, bottom: y + h }; checks.current.forEach(callback => callback()); });
      else checks.current.forEach(callback => callback());
    });
  }, []);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  return <VisibilityContext.Provider value={{ register, check, setViewport, bounds }}>{children}</VisibilityContext.Provider>;
}

export function TrainProgressBar({ progress, label, track, color }: { progress: number; label: string; track: string; color: string }) {
  const node = useRef<View>(null);
  const amount = useRef(new Animated.Value(0)).current;
  const visible = useRef(false);
  const reduced = useRef(false);
  const target = useRef(progress);
  const mounted = useRef(true);
  const { height } = useWindowDimensions();
  const { register, check, bounds } = useProgressVisibility();
  target.current = Math.min(1, Math.max(0, progress));
  const animate = useCallback(() => {
    amount.stopAnimation();
    if (reduced.current) amount.setValue(target.current);
    else Animated.timing(amount, { toValue: target.current, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [amount]);
  useEffect(() => {
    mounted.current = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted.current) { reduced.current = value; if (value && visible.current) amount.setValue(target.current); } });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", value => { reduced.current = value; if (value && visible.current) { amount.stopAnimation(); amount.setValue(target.current); } });
    return () => { mounted.current = false; subscription.remove(); amount.stopAnimation(); };
  }, [amount]);
  useEffect(() => {
    const unregister = register(() => {
      if (visible.current) return;
      node.current?.measureInWindow((_x, y, _width, h) => {
        const viewport = bounds();
        if (!mounted.current || visible.current || h <= 0 || y + h <= (viewport?.top ?? 0) || y >= Math.min(viewport?.bottom ?? height, height)) return;
        visible.current = true; animate();
      });
    });
    check();
    return unregister;
  }, [register, check, bounds, height, animate]);
  useEffect(() => { if (visible.current) animate(); }, [progress, animate]);
  return <View ref={node} onLayout={check} accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(target.current * 100) }} style={{ height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: track }}>
    <Animated.View style={{ height: 8, borderRadius: 4, backgroundColor: color, width: amount.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }} />
  </View>;
}
