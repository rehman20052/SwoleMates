import { useEffect, useRef, type ReactNode } from "react";
import { AppState, Platform, Pressable, type StyleProp, type ViewStyle } from "react-native";
import { createPressRepeater } from "@/lib/press-repeater";

export function RepeatStepButton({ value, min, max, direction, onChange, label, style, children }: {
  value: number; min: number; max: number; direction: -1 | 1;
  onChange: (value: number) => void; label: string;
  style: StyleProp<ViewStyle>; children: ReactNode;
}) {
  const latest = useRef({ value, min, max, onChange, direction });
  latest.current = { value, min, max, onChange, direction };
  const pressed = useRef(false);
  const repeater = useRef<ReturnType<typeof createPressRepeater> | null>(null);
  function step() {
    const current = latest.current;
    const next = Math.max(current.min, Math.min(current.max, current.value + current.direction));
    if (next === current.value) return false;
    current.value = next;
    current.onChange(next);
    return next > current.min && next < current.max;
  }
  if (!repeater.current) repeater.current = createPressRepeater(step, {
    schedule: (callback, delay) => setTimeout(callback, delay),
    cancel: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  });
  const disabled = direction < 0 ? value <= min : value >= max;
  useEffect(() => { if (disabled) repeater.current?.stop(); }, [disabled]);
  useEffect(() => {
    const stop = () => repeater.current?.stop();
    const subscription = AppState.addEventListener("change", (state) => { if (state !== "active") stop(); });
    if (Platform.OS === "web") {
      window.addEventListener("blur", stop);
      document.addEventListener("visibilitychange", stop);
      window.addEventListener("pointercancel", stop);
      window.addEventListener("pointerup", stop);
    }
    return () => {
      stop(); subscription.remove();
      if (Platform.OS === "web") {
        window.removeEventListener("blur", stop);
        document.removeEventListener("visibilitychange", stop);
        window.removeEventListener("pointercancel", stop);
        window.removeEventListener("pointerup", stop);
      }
    };
  }, []);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
    onPressIn={() => { pressed.current = true; repeater.current?.start(); }}
    onPressOut={() => repeater.current?.stop()}
    onPress={() => { if (!pressed.current) step(); pressed.current = false; }}
    style={[style, { opacity: disabled ? 0.4 : 1 }, Platform.OS === "web" && ({ touchAction: "none", userSelect: "none" } as ViewStyle)]}
  >{children}</Pressable>;
}
