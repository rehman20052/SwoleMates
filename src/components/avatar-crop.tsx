import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, PanResponder, Platform, View, useWindowDimensions, type GestureResponderEvent } from "react-native";
import { Image } from "expo-image";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { AppText, PrimaryButton, SecondaryButton } from "@/components/ui";
import { avatarCrop, photoCrop } from "@/lib/avatar-crop";
import { photoDisplayUri } from "@/lib/heic-media";
import { rememberPickedMime } from "@/lib/profile";
import { useAppTheme } from "@/theme";

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

type Position = { x: number; y: number; zoom: number };

// One finger drags. Two fingers pinch to zoom and drag by their midpoint.
function touchPoints(event: GestureResponderEvent) {
  const touches = event.nativeEvent.touches ?? [];
  if (touches.length >= 2) {
    const [a, b] = touches;
    return {
      fingers: 2,
      distance: Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY),
      midX: (a.pageX + b.pageX) / 2,
      midY: (a.pageY + b.pageY) / 2,
    };
  }
  const point = touches[0] ?? event.nativeEvent;
  return { fingers: 1, distance: 0, midX: point.pageX, midY: point.pageY };
}

type CropProps = { uri: string; onCancel: () => void; onConfirm: (uri: string) => void };

// The round chat and social icon cut from the first photo.
export function AvatarCrop(props: CropProps) {
  return <PhotoCrop {...props} aspect={1} round title="Your profile icon" confirmLabel="Use profile icon" outputWidth={512} />;
}

// Full-size profile photos are framed as 4:5 portraits, like Instagram and Hinge.
export function ProfilePhotoCrop(props: CropProps) {
  return <PhotoCrop {...props} aspect={4 / 5} title="Frame your photo" confirmLabel="Use photo" outputWidth={1080} />;
}

function PhotoCrop({ uri, onCancel, onConfirm, aspect, round = false, title, confirmLabel, outputWidth }: CropProps & {
  aspect: number;
  round?: boolean;
  title: string;
  confirmLabel: string;
  outputWidth: number;
}) {
  const theme = useAppTheme();
  const screen = useWindowDimensions();
  // The frame fits the screen with room for the title and buttons.
  const frameWidth = Math.max(120, Math.min(round ? 280 : 300, screen.width - 80, (screen.height - 280) * aspect));
  const frameHeight = frameWidth / aspect;
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0, zoom: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(position);
  current.current = position;
  const start = useRef<{ fingers: number; distance: number; midX: number; midY: number; position: Position } | null>(null);
  const previewRef = useRef<View>(null);
  const cropAt = (zoom: number, x: number, y: number) =>
    size ? (round ? avatarCrop(size.width, size.height, zoom, x, y) : photoCrop(size.width, size.height, aspect, zoom, x, y)) : null;
  const baseScale = size ? frameWidth / (cropAt(1, 0, 0)?.width ?? size.width) : 1;
  const scale = baseScale * position.zoom;

  // Keeps the photo covering the frame at any zoom.
  const settle = (zoom: number, x: number, y: number): Position => {
    const next = cropAt(zoom, x, y);
    if (!size || !next) return { zoom, x, y };
    return { zoom, x: next.originX - (size.width - next.width) / 2, y: next.originY - (size.height - next.height) / 2 };
  };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (event) => { start.current = { ...touchPoints(event), position: current.current }; },
    onPanResponderMove: (event) => {
      if (!size) return;
      const now = touchPoints(event);
      const began = start.current;
      // A finger was added or lifted: start measuring again from here so the photo doesn't jump.
      if (!began || began.fingers !== now.fingers) {
        start.current = { ...now, position: current.current };
        return;
      }
      const zoom = now.fingers === 2 && began.distance > 0
        ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, began.position.zoom * now.distance / began.distance))
        : began.position.zoom;
      const moveScale = baseScale * zoom;
      setPosition(settle(zoom, began.position.x - (now.midX - began.midX) / moveScale, began.position.y - (now.midY - began.midY) / moveScale));
    },
    onPanResponderRelease: () => { start.current = null; },
    onPanResponderTerminate: () => { start.current = null; },
  }), [size, baseScale]);

  // Trackpad pinch on a computer arrives as a wheel event with ctrlKey set.
  useEffect(() => {
    if (Platform.OS !== "web" || !size) return;
    const node = previewRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const was = current.current;
      setPosition(settle(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, was.zoom * Math.exp(-event.deltaY / 100))), was.x, was.y));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [size]);
  const save = async () => {
    const crop = cropAt(position.zoom, position.x, position.y);
    if (!crop || busy) return;
    setBusy(true); setError(null);
    try {
      const result = await manipulateAsync(photoDisplayUri(uri), [
        { crop },
        { resize: { width: outputWidth, height: Math.round(outputWidth / aspect) } },
      ], { format: SaveFormat.JPEG, compress: 0.9 });
      rememberPickedMime(result.uri, "image/jpeg");
      onConfirm(result.uri);
    } catch { setError("Could not crop this photo. Try another photo."); }
    finally { setBusy(false); }
  };
  return <Modal visible transparent animationType="fade" onRequestClose={busy ? undefined : onCancel}>
    <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", padding: 20 }}>
      <View style={{ backgroundColor: theme.colors.surface, borderRadius: 24, padding: 20, gap: 16, alignItems: "center" }}>
        <AppText size={22} weight="extrabold">{title}</AppText>
        <AppText muted style={{ textAlign: "center" }}>Drag to position your photo. Pinch to zoom.</AppText>
        <View ref={previewRef} accessibilityLabel={round ? "Circular profile photo preview" : "Profile photo preview"} {...pan.panHandlers} style={{ width: frameWidth, height: frameHeight, borderRadius: round ? frameWidth / 2 : 18, overflow: "hidden", borderWidth: 2, borderColor: theme.colors.primary, backgroundColor: theme.colors.surfaceRaised, ...({ touchAction: "none" } as object) }}>
          <Image pointerEvents="none" source={{ uri: photoDisplayUri(uri) }} onLoad={({ source }) => setSize({ width: source.width, height: source.height })} onError={() => setError("Could not open this photo. Try another photo.")} contentFit="fill" style={size ? { position: "absolute", width: size.width * scale, height: size.height * scale, left: (frameWidth - size.width * scale) / 2 - position.x * scale, top: (frameHeight - size.height * scale) / 2 - position.y * scale } : { width: "100%", height: "100%" }} />
        </View>
        {error ? <AppText color={theme.colors.danger}>{error}</AppText> : null}
        <View style={{ alignSelf: "stretch", gap: 10 }}>
          <PrimaryButton disabled={!size || busy} onPress={save}>{busy ? "Saving…" : confirmLabel}</PrimaryButton>
          <SecondaryButton disabled={busy} onPress={onCancel}>Cancel</SecondaryButton>
        </View>
      </View>
    </View>
  </Modal>;
}
