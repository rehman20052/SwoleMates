import { type ReactNode, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Platform, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { AppText } from "@/components/ui";
import { useAppTheme } from "@/theme";

export type ChatAction = "hide" | "show" | "unmatch" | "block";

export function SwipeChatRow({ children, name, hidden, onOpen, onAction }: {
  children: ReactNode;
  name: string;
  hidden?: boolean;
  onOpen: () => void;
  onAction: (action: ChatAction) => void;
}) {
  const theme = useAppTheme();
  const offset = useRef(new Animated.Value(0)).current;
  const opened = useRef(false);
  const width = useRef(240);
  const start = useRef(0);
  const swiping = useRef(false);
  const [exposed, setExposed] = useState(false);
  const settle = (open: boolean) => {
    opened.current = open;
    Animated.timing(offset, { toValue: open ? -width.current : 0, duration: 160, useNativeDriver: true })
      .start(() => { if (!opened.current) setExposed(false); });
    if (open) setExposed(true);
  };
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, gesture) => Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
    onPanResponderGrant: () => {
      swiping.current = true;
      offset.stopAnimation();
      start.current = opened.current ? -width.current : 0;
      setExposed(true);
    },
    onPanResponderMove: (_event, gesture) => offset.setValue(Math.max(-width.current, Math.min(0, start.current + gesture.dx))),
    onPanResponderRelease: (_event, gesture) => {
      settle(gesture.vx < -0.4 || (gesture.vx <= 0.4 && start.current + gesture.dx < -width.current / 3));
      setTimeout(() => { swiping.current = false; }, 0);
    },
    onPanResponderTerminate: () => { settle(opened.current); swiping.current = false; },
    onPanResponderTerminationRequest: () => false,
  }), []);
  return (
    <View style={styles.wrap} onLayout={({ nativeEvent }) => { width.current = Math.min(240, nativeEvent.layout.width * 0.8); }}>
      {exposed ? (
        <View style={[styles.actions, { width: width.current }]}>
          {([hidden ? "show" : "hide", "unmatch", "block"] as ChatAction[]).map((action) => (
            <Pressable key={action} accessibilityRole="button" accessibilityLabel={`${action === "show" ? "Show" : action === "hide" ? "Hide" : action === "unmatch" ? "Unmatch" : "Block"} ${name}`}
              onPress={() => { settle(false); onAction(action); }}
              style={[styles.action, { backgroundColor: action === "block" ? theme.colors.danger : theme.colors.surfaceRaised }]}>
              <AppText size={11} weight="bold" color={action === "block" ? "#FFFFFF" : theme.colors.text}>
                {action === "show" ? "Show" : action === "hide" ? "Hide" : action === "unmatch" ? "Unmatch" : "Block"}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Animated.View {...pan.panHandlers} style={[
        { backgroundColor: theme.colors.background, transform: [{ translateX: offset }] },
        Platform.OS === "web" && ({ touchAction: "pan-y" } as unknown as ViewStyle),
      ]}>
        <View style={styles.front}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Chat with ${name}`} style={styles.content}
            onPress={() => { if (swiping.current) return; if (opened.current) settle(false); else onOpen(); }}>
            {children}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Chat actions for ${name}`} hitSlop={8}
            onPress={() => settle(!opened.current)} style={styles.more}>
            <AppText size={20} muted>⋯</AppText>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden", borderRadius: 12 },
  front: { flexDirection: "row", alignItems: "center" },
  content: { flex: 1, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12 },
  more: { paddingHorizontal: 8, paddingVertical: 12 },
  actions: { position: "absolute", right: 0, top: 0, bottom: 0, flexDirection: "row", gap: 2 },
  action: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 3 },
});
