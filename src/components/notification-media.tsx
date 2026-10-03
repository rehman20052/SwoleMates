import { useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { AppText } from "@/components/ui";
import type { PostMedia } from "@/lib/social";
import { useAppTheme } from "@/theme";

// Repeated likes/comments on one clip share a single decoded preview.
const previews = new Map<string, Promise<string | null>>();
let previewQueue: Promise<unknown> = Promise.resolve();
function webPreview(uri: string) {
  const cached = previews.get(uri);
  if (cached) return cached;
  const result = previewQueue.then(() => new Promise<string | null>((resolve) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    let finished = false;
    const finish = (image: string | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      resolve(image);
    };
    const timer = setTimeout(() => finish(null), 10000);
    const capture = () => {
      try {
        if (!video.videoWidth || !video.videoHeight) return finish(null);
        const canvas = document.createElement("canvas");
        const scale = 96 / Math.max(video.videoWidth, video.videoHeight);
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) return finish(null);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL("image/jpeg", 0.75));
      } catch { finish(null); }
    };
    video.onloadeddata = () => {
      if (video.duration > 0.1) video.currentTime = Math.min(0.1, video.duration / 2);
      else capture();
    };
    video.onseeked = capture;
    video.onerror = () => finish(null);
    video.src = uri;
  }));
  previewQueue = result.catch(() => undefined);
  if (previews.size >= 100) previews.delete(previews.keys().next().value!);
  previews.set(uri, result);
  return result;
}

export function NotificationMedia({ media }: { media: PostMedia }) {
  const theme = useAppTheme();
  return (
    <View accessible accessibilityLabel={media.type === "video" ? "Related video" : "Related photo"} style={[styles.thumb, { backgroundColor: theme.colors.surfaceRaised }]}>
      {media.type === "image" ? <Image source={{ uri: media.uri }} style={styles.fill} contentFit="cover" />
        : Platform.OS === "web" ? <WebClip key={media.uri} uri={media.uri} /> : <NativeClip key={media.uri} uri={media.uri} />}
      {media.type === "video" ? <View pointerEvents="none" style={styles.play}><AppText size={11} color="#FFFFFF">▶</AppText></View> : null}
    </View>
  );
}

function WebClip({ uri }: { uri: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void webPreview(uri).then((image) => { if (active) setPreview(image); });
    return () => { active = false; };
  }, [uri]);
  return preview ? <Image source={{ uri: preview }} style={styles.fill} contentFit="cover" /> : null;
}

function NativeClip({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (clip) => { clip.muted = true; });
  return <VideoView player={player} style={styles.fill} contentFit="cover" nativeControls={false} allowsPictureInPicture={false} fullscreenOptions={{ enable: false }} />;
}

const styles = StyleSheet.create({
  thumb: { width: 44, height: 52, borderRadius: 7, overflow: "hidden", flexShrink: 0 },
  fill: { width: "100%", height: "100%" },
  play: { position: "absolute", right: 2, bottom: 2, backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 4, paddingHorizontal: 3 },
});
