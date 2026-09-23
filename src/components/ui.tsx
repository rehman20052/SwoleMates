import { Image, ImageSource } from "expo-image";
import { PropsWithChildren, ReactNode, useRef, useState } from "react";
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  PressableProps,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  View,
  ViewStyle,
} from "react-native";

import { icons } from "@/assets";
import { AppTheme, useAppTheme } from "@/theme";

type Weight = keyof AppTheme["fonts"];

export function AppText({
  children,
  size = 14,
  weight = "regular",
  color,
  muted,
  primary,
  upper,
  style,
  ...props
}: TextProps &
  PropsWithChildren<{
    size?: number;
    weight?: Weight;
    color?: string;
    muted?: boolean;
    primary?: boolean;
    upper?: boolean;
  }>) {
  const theme = useAppTheme();
  const tone = color ?? (primary ? theme.colors.primary : muted ? theme.colors.muted : theme.colors.text);

  return (
    <Text
      {...props}
      style={[
        {
          color: tone,
          fontFamily: theme.fonts[weight],
          fontSize: size,
          textTransform: upper ? "uppercase" : "none",
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Icon({ source, size, width, height }: { source: ImageSource; size?: number; width?: number; height?: number }) {
  return <Image source={source} style={{ width: width ?? size, height: height ?? size }} contentFit="contain" />;
}

export function Avatar({ source, size }: { source: ImageSource; size: number }) {
  return (
    <Image source={source} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />
  );
}

// Safe areas are handled by the app shell in app/index.tsx.
export function Screen({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const theme = useAppTheme();

  return <View style={[styles.screen, { backgroundColor: theme.colors.background }, style]}>{children}</View>;
}

export function ScrollBody({ children, contentContainerStyle, ...props }: ScrollViewProps) {
  return (
    <ScrollView
      {...props}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scrollBody, contentContainerStyle]}
    >
      {children}
    </ScrollView>
  );
}

export function TitleBar({ title, right, onBack }: { title: string; right?: ReactNode; onBack?: () => void }) {
  return (
    <View style={styles.titleBar}>
      <View style={styles.titleLeft}>
        {onBack ? <IconButton source={icons.arrowLeft} label="Back" onPress={onBack} /> : null}
        <AppText size={20} weight="extrabold">
          {title}
        </AppText>
      </View>
      {right}
    </View>
  );
}

export function IconButton({
  source,
  size = 20,
  onPress,
  label,
}: {
  source: ImageSource;
  size?: number;
  onPress?: () => void;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Icon source={source} size={size} />
    </Pressable>
  );
}

export function Brand({ size = "lg" }: { size?: "sm" | "md" | "lg" }) {
  const theme = useAppTheme();
  const config = {
    sm: { bar: { width: 8, height: 20, borderRadius: 2 }, font: 18 },
    md: { bar: { width: 12, height: 28, borderRadius: 4 }, font: 32 },
    lg: { bar: { width: 12, height: 28, borderRadius: 4 }, font: 38 },
  }[size];

  return (
    <View style={styles.brand}>
      <View style={[config.bar, { backgroundColor: theme.colors.primary }]} />
      <AppText size={config.font} weight="black">
        SwoleMates
      </AppText>
    </View>
  );
}

export function Card({
  children,
  style,
  padding = 18,
  radius = 20,
  gap = 16,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle>; padding?: number; radius?: number; gap?: number }>) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: radius,
          borderWidth: 1,
          gap,
          padding,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionLabel({ children, color }: PropsWithChildren<{ color?: string }>) {
  return (
    <AppText size={13} weight="extrabold" upper primary={!color} color={color}>
      {children}
    </AppText>
  );
}

export function FieldLabel({ children, size = 12 }: PropsWithChildren<{ size?: number }>) {
  return (
    <AppText size={size} weight="bold" muted upper>
      {children}
    </AppText>
  );
}

export function Divider() {
  const theme = useAppTheme();
  return <View style={{ backgroundColor: theme.colors.border, height: 1, width: "100%" }} />;
}

export function Field({ label, labelSize, children, style }: PropsWithChildren<{ label: string; labelSize?: number; style?: StyleProp<ViewStyle> }>) {
  return (
    <View style={[styles.field, style]}>
      <FieldLabel size={labelSize}>{label}</FieldLabel>
      {children}
    </View>
  );
}

export function Input({
  bordered,
  style,
  multiline,
  ...props
}: TextInputProps & { bordered?: boolean }) {
  const theme = useAppTheme();

  return (
    <TextInput
      {...props}
      multiline={multiline}
      placeholderTextColor={theme.colors.muted}
      selectionColor={theme.colors.primary}
      style={[
        styles.input,
        {
          backgroundColor: theme.colors.surfaceRaised,
          borderColor: bordered ? theme.colors.border : "transparent",
          color: theme.colors.text,
          fontFamily: theme.fonts.regular,
        },
        multiline && styles.inputMultiline,
        style,
      ]}
    />
  );
}

export function SelectField<T extends string>({
  value,
  options,
  onChange,
  renderLabel,
  leading,
  icon = icons.chevronDown,
}: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  renderLabel?: (value: T) => string;
  leading?: (value: T) => ReactNode;
  icon?: ImageSource;
}) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  const label = renderLabel ?? ((option: T) => option);

  return (
    <View style={{ gap: 6 }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen((current) => !current)}
        style={[styles.select, { backgroundColor: theme.colors.surfaceRaised }]}
      >
        <View style={styles.selectValue}>
          {leading?.(value)}
          <AppText numberOfLines={1} style={{ flexShrink: 1 }}>
            {label(value)}
          </AppText>
        </View>
        <Icon source={icon} size={16} />
      </Pressable>
      {open ? (
        <View style={[styles.selectMenu, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border }]}>
          {options.map((option) => {
            const selected = option === value;
            return (
              <Pressable
                key={option}
                onPress={() => {
                  onChange(option);
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.selectOption, pressed && { backgroundColor: theme.colors.border }]}
              >
                {leading?.(option)}
                <AppText weight={selected ? "bold" : "regular"} primary={selected}>
                  {label(option)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

type ButtonProps = Omit<PressableProps, "children" | "style"> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({ children, style, height = 52, fontSize = 15, ...props }: ButtonProps & { height?: number; fontSize?: number }) {
  const theme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.colors.primary, height, opacity: pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {typeof children === "string" ? (
        <AppText size={fontSize} weight="extrabold" color={theme.colors.primaryText}>
          {children}
        </AppText>
      ) : (
        children
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  children,
  style,
  height = 52,
  fontSize = 15,
  textColor,
  ...props
}: ButtonProps & { height?: number; fontSize?: number; textColor?: string }) {
  const theme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: 1,
          height,
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <AppText size={fontSize} weight="bold" color={textColor}>
        {children}
      </AppText>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  shape = "pill",
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  shape?: "pill" | "tag";
}) {
  const theme = useAppTheme();
  const pill = shape === "pill";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.colors.primary : pill ? theme.colors.surface : theme.colors.surfaceRaised,
          borderColor: selected && !pill ? theme.colors.primary : theme.colors.border,
          borderRadius: pill ? 100 : 8,
        },
      ]}
    >
      <AppText size={12} weight="semibold" color={selected ? theme.colors.primaryText : theme.colors.text}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  height = 44,
  badges,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  height?: number;
  badges?: Partial<Record<T, number>>;
}) {
  const theme = useAppTheme();

  return (
    <View style={[styles.segmented, { backgroundColor: theme.colors.surface, height }]}>
      {options.map((option) => {
        const active = option.value === value;
        const badge = badges?.[option.value];
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && { backgroundColor: theme.colors.surfaceRaised }]}
          >
            <AppText
              size={height > 40 ? 14 : 13}
              weight={active ? "bold" : height > 40 ? "medium" : "semibold"}
              color={active ? theme.colors.primary : theme.colors.muted}
            >
              {option.label}
            </AppText>
            {badge ? (
              <View style={[styles.segmentBadge, { backgroundColor: theme.colors.primary }]}>
                <AppText size={10} weight="extrabold" color={theme.colors.primaryText}>
                  {badge}
                </AppText>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function OptionRow<T extends string>({
  options,
  value,
  onChange,
  variant = "outline",
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  variant?: "outline" | "solid";
}) {
  const theme = useAppTheme();
  const outline = variant === "outline";

  return (
    <View style={styles.optionRow}>
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option)}
            style={[
              styles.option,
              outline
                ? {
                    backgroundColor: active ? theme.colors.primaryTint : theme.colors.surface,
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                    borderRadius: 10,
                    borderWidth: 1,
                    height: 40,
                  }
                : {
                    backgroundColor: active ? theme.colors.primary : theme.colors.surfaceRaised,
                    borderRadius: 8,
                    height: 36,
                  },
            ]}
          >
            <AppText
              size={outline ? 12 : 13}
              weight="bold"
              color={
                outline
                  ? active
                    ? theme.colors.primary
                    : theme.colors.muted
                  : active
                    ? theme.colors.primaryText
                    : theme.colors.text
              }
            >
              {option}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function StatBox({
  label,
  value,
  labelSize = 9,
  valueSize = 14,
  valueWeight = "extrabold",
  valueColor,
  padding = 10,
  radius = 12,
  background,
}: {
  label: string;
  value: string;
  labelSize?: number;
  valueSize?: number;
  valueWeight?: Weight;
  valueColor?: string;
  padding?: number;
  radius?: number;
  background?: string;
}) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.statBox,
        {
          backgroundColor: background ?? theme.colors.background,
          borderColor: theme.colors.border,
          borderRadius: radius,
          padding,
        },
      ]}
    >
      <AppText size={labelSize} weight="bold" muted upper>
        {label}
      </AppText>
      <AppText size={valueSize} weight={valueWeight} color={valueColor}>
        {value}
      </AppText>
    </View>
  );
}

export function ProgressBar({ progress }: { progress: number }) {
  const theme = useAppTheme();

  return (
    <View style={[styles.progressTrack, { backgroundColor: theme.colors.surfaceRaised }]}>
      <View
        style={[
          styles.progressFill,
          { backgroundColor: theme.colors.primary, width: `${Math.max(0, Math.min(1, progress)) * 100}%` },
        ]}
      />
    </View>
  );
}

function useTrack() {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);

  function onLayout(event: LayoutChangeEvent) {
    widthRef.current = event.nativeEvent.layout.width;
    setWidth(event.nativeEvent.layout.width);
  }

  return { width, widthRef, onLayout };
}

function toValue(x: number, width: number, min: number, max: number, step: number) {
  if (width <= 0) return min;
  const ratio = Math.max(0, Math.min(1, x / width));
  return Math.round((min + ratio * (max - min)) / step) * step;
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  accessibilityLabel,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
}) {
  const theme = useAppTheme();
  const track = useTrack();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const update = (event: GestureResponderEvent) =>
    onChangeRef.current(toValue(event.nativeEvent.locationX, track.widthRef.current, min, max, step));

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: update,
      onPanResponderMove: update,
    }),
  ).current;

  const ratio = (value - min) / (max - min);
  const fill = ratio * track.width;

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event) =>
        onChange(Math.max(min, Math.min(max, value + (event.nativeEvent.actionName === "increment" ? step : -step))))
      }
      style={styles.sliderHitArea}
      onLayout={track.onLayout}
      {...responder.panHandlers}
    >
      <View pointerEvents="none" style={[styles.sliderTrack, { backgroundColor: theme.colors.border }]} />
      <View pointerEvents="none" style={[styles.sliderTrack, styles.sliderFill, { backgroundColor: theme.colors.primary, width: fill }]} />
      <View pointerEvents="none" style={[styles.sliderThumb, { left: Math.max(0, fill - 9) }]}>
        <Icon source={icons.sliderThumb} size={18} />
      </View>
    </View>
  );
}

export function RangeSlider({
  low,
  high,
  min,
  max,
  onChange,
  accessibilityLabel,
}: {
  low: number;
  high: number;
  min: number;
  max: number;
  onChange: (low: number, high: number) => void;
  accessibilityLabel: string;
}) {
  const theme = useAppTheme();
  const track = useTrack();
  const state = useRef({ low, high, onChange, active: "low" as "low" | "high" });
  state.current.low = low;
  state.current.high = high;
  state.current.onChange = onChange;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        const next = toValue(event.nativeEvent.locationX, track.widthRef.current, min, max, 1);
        const current = state.current;
        current.active = Math.abs(next - current.low) <= Math.abs(next - current.high) ? "low" : "high";
        if (current.low === current.high) current.active = next > current.high ? "high" : "low";
        move(next);
      },
      onPanResponderMove: (event) => move(toValue(event.nativeEvent.locationX, track.widthRef.current, min, max, 1)),
    }),
  ).current;

  function move(next: number) {
    const current = state.current;
    if (current.active === "low") current.onChange(Math.min(next, current.high), current.high);
    else current.onChange(current.low, Math.max(next, current.low));
  }

  const position = (value: number) => ((value - min) / (max - min)) * track.width;

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={styles.sliderHitArea}
      onLayout={track.onLayout}
      {...responder.panHandlers}
    >
      <View pointerEvents="none" style={[styles.sliderTrack, { backgroundColor: theme.colors.border }]} />
      <View
        pointerEvents="none"
        style={[
          styles.sliderTrack,
          styles.sliderFill,
          { backgroundColor: theme.colors.primary, left: position(low), width: position(high) - position(low) },
        ]}
      />
      {[low, high].map((value, index) => (
        <View key={index} pointerEvents="none" style={[styles.rangeThumb, { left: Math.max(0, position(value) - 7) }]}>
          <Icon source={icons.rangeThumb} size={14} />
        </View>
      ))}
    </View>
  );
}

export function Toggle({ value, onChange, accessibilityLabel }: { value: boolean; onChange: (value: boolean) => void; accessibilityLabel: string }) {
  const theme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      hitSlop={8}
      style={{ height: 24, width: 44 }}
    >
      {value ? (
        <Image source={icons.toggleOn} style={{ height: 24, width: 44 }} />
      ) : (
        <View style={[styles.toggleOff, { backgroundColor: theme.colors.border }]}>
          <View style={[styles.toggleKnob, { backgroundColor: theme.colors.muted }]} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollBody: {
    gap: 16,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  titleBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  titleLeft: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  brand: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  field: {
    gap: 6,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 14,
    height: 44,
    paddingHorizontal: 12,
  },
  inputMultiline: {
    fontSize: 13,
    height: 72,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  select: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    height: 44,
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  selectValue: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: 8,
  },
  selectMenu: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  selectOption: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 12,
  },
  button: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  chip: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  segmented: {
    borderRadius: 12,
    flexDirection: "row",
    gap: 4,
    padding: 4,
  },
  segment: {
    alignItems: "center",
    borderRadius: 8,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
  },
  segmentBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  optionRow: {
    flexDirection: "row",
    gap: 8,
  },
  option: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  statBox: {
    borderWidth: 1,
    flex: 1,
    gap: 2,
  },
  progressTrack: {
    borderRadius: 4,
    height: 8,
    overflow: "hidden",
    width: "100%",
  },
  progressFill: {
    borderRadius: 4,
    height: "100%",
  },
  sliderHitArea: {
    height: 24,
    justifyContent: "center",
    width: "100%",
  },
  sliderTrack: {
    borderRadius: 3,
    height: 6,
    width: "100%",
  },
  sliderFill: {
    left: 0,
    position: "absolute",
  },
  sliderThumb: {
    position: "absolute",
    top: 3,
  },
  rangeThumb: {
    position: "absolute",
    top: 5,
  },
  toggleOff: {
    borderRadius: 12,
    height: 24,
    justifyContent: "center",
    paddingHorizontal: 2,
    width: 44,
  },
  toggleKnob: {
    borderRadius: 10,
    height: 20,
    width: 20,
  },
});
