import { useState } from "react";
import { Image } from "expo-image";
import { catalogLiftArtwork, liftArtworkKind, type LiftArtworkKind } from "@/lib/lift-artwork";
import { artworkPhotoUrl, type ArtworkDraft } from "@/lib/artwork-photo";

const artwork = {
  bench: require("../../assets/brand/lift-bench.svg"), cable: require("../../assets/brand/lift-cable.svg"),
  barbell: require("../../assets/brand/lift-barbell.svg"), dumbbell: require("../../assets/brand/lift-dumbbell.svg"),
  kettlebell: require("../../assets/brand/lift-kettlebell.svg"), legs: require("../../assets/brand/lift-legs.svg"),
  bodyweight: require("../../assets/brand/lift-bodyweight.svg"), other: require("../../assets/brand/lift-other.svg"),
};
export function LiftThumbnail({ name, selection, size = 44 }: { name: string; selection?: ArtworkDraft; size?: number }) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const photo = artworkPhotoUrl(selection);
  const catalog = !selection ? catalogLiftArtwork(name) : undefined;
  const uri = photo ?? catalog?.image;
  const preset = selection?.kind === "preset" && selection.key in artwork ? selection.key as LiftArtworkKind : liftArtworkKind(name);
  return <Image accessible={false} source={uri && failedUri !== uri ? { uri } : artwork[preset]} contentFit={photo ? "cover" : "contain"}
    cachePolicy="memory-disk" recyclingKey={`${name}-${uri ?? preset}`} onError={() => { if (uri) setFailedUri(uri); }}
    style={{ width: size, height: size, borderRadius: 10, backgroundColor: uri && !photo ? "#F4F5F0" : "transparent" }} />;
}
