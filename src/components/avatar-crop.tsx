import { useMemo, useRef, useState } from "react";
import { Modal, PanResponder, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { AppText, PrimaryButton, SecondaryButton } from "@/components/ui";
import { avatarCrop } from "@/lib/avatar-crop";
import { photoDisplayUri } from "@/lib/heic-media";
import { rememberPickedMime } from "@/lib/profile";
import { useAppTheme } from "@/theme";

export function AvatarCrop({ uri, onCancel, onConfirm }: { uri: string; onCancel: () => void; onConfirm: (uri: string) => void }) {
  const theme = useAppTheme();
  const screen = useWindowDimensions();
  const diameter = Math.max(120, Math.min(280, screen.width - 80, screen.height - 280));
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0, zoom: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(position);
  current.current = position;
  const start = useRef(position);
  const scale = size ? diameter / Math.min(size.width, size.height) * position.zoom : 1;
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { start.current = current.current; },
    onPanResponderMove: (_, gesture) => {
      if (!size) return;
      const next = avatarCrop(size.width, size.height, start.current.zoom, start.current.x - gesture.dx / scale, start.current.y - gesture.dy / scale);
      setPosition({ zoom: start.current.zoom, x: next.originX - (size.width - next.width) / 2, y: next.originY - (size.height - next.height) / 2 });
    },
  }), [size, scale]);
  const save = async () => {
    if (!size || busy) return;
    setBusy(true); setError(null);
    try {
      const result = await manipulateAsync(photoDisplayUri(uri), [
        { crop: avatarCrop(size.width, size.height, position.zoom, position.x, position.y) },
        { resize: { width: 512, height: 512 } },
      ], { format: SaveFormat.JPEG, compress: 0.9 });
      rememberPickedMime(result.uri, "image/jpeg");
      onConfirm(result.uri);
    } catch { setError("Could not crop this photo. Try another photo."); }
    finally { setBusy(false); }
  };
  return <Modal visible transparent animationType="fade" onRequestClose={busy ? undefined : onCancel}>
    <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", padding: 20 }}>
      <View style={{ backgroundColor: theme.colors.surface, borderRadius: 24, padding: 20, gap: 16, alignItems: "center" }}>
        <AppText size={22} weight="extrabold">Your profile icon</AppText>
        <AppText muted style={{ textAlign: "center" }}>Drag to position your photo. Zoom to fit the circle.</AppText>
        <View accessibilityLabel="Circular profile photo preview" {...pan.panHandlers} style={{ width: diameter, height: diameter, borderRadius: diameter / 2, overflow: "hidden", borderWidth: 2, borderColor: theme.colors.primary, backgroundColor: theme.colors.surfaceRaised, ...({ touchAction: "none" } as object) }}>
          <Image pointerEvents="none" source={{ uri: photoDisplayUri(uri) }} onLoad={({ source }) => setSize({ width: source.width, height: source.height })} onError={() => setError("Could not open this photo. Try another photo.")} contentFit="fill" style={size ? { position: "absolute", width: size.width * scale, height: size.height * scale, left: (diameter - size.width * scale) / 2 - position.x * scale, top: (diameter - size.height * scale) / 2 - position.y * scale } : { width: "100%", height: "100%" }} />
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <SecondaryButton disabled={busy || position.zoom <= 1} onPress={() => setPosition({ x: 0, y: 0, zoom: Math.max(1, position.zoom - 0.25) })}>Zoom out</SecondaryButton>
          <SecondaryButton disabled={busy || position.zoom >= 4} onPress={() => setPosition({ ...position, zoom: Math.min(4, position.zoom + 0.25) })}>Zoom in</SecondaryButton>
        </View>
        {error ? <AppText color={theme.colors.danger}>{error}</AppText> : null}
        <View style={{ alignSelf: "stretch", gap: 10 }}>
          <PrimaryButton disabled={!size || busy} onPress={save}>{busy ? "Saving…" : "Use profile icon"}</PrimaryButton>
          <SecondaryButton disabled={busy} onPress={onCancel}>Cancel</SecondaryButton>
        </View>
      </View>
    </View>
  </Modal>;
}
