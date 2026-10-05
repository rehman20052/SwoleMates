import { useState } from "react";
import { Image } from "expo-image";
import { foodArtworkKind, type FoodArtworkKind } from "@/lib/food-artwork";
import { artworkPhotoUrl, type ArtworkDraft } from "@/lib/artwork-photo";

const artwork = {
  coffee: require("../../assets/brand/food-coffee.jpg"),
  chicken: require("../../assets/brand/food-chicken.jpg"),
  kebab: require("../../assets/brand/food-kebab.jpg"),
  chips: require("../../assets/brand/food-chips.jpg"),
  pasta: require("../../assets/brand/food-pasta.jpg"),
  yogurt: require("../../assets/brand/food-yogurt.jpg"),
  eggs: require("../../assets/brand/food-eggs.jpg"), fish: require("../../assets/brand/food-fish.jpg"),
  steak: require("../../assets/brand/food-steak.jpg"), burger: require("../../assets/brand/food-burger.jpg"),
  pizza: require("../../assets/brand/food-pizza.jpg"), rice: require("../../assets/brand/food-rice.jpg"),
  salad: require("../../assets/brand/food-salad.jpg"), sandwich: require("../../assets/brand/food-sandwich.jpg"),
  fruit: require("../../assets/brand/food-fruit.jpg"), smoothie: require("../../assets/brand/food-smoothie.jpg"),
  oats: require("../../assets/brand/food-oats.jpg"), dessert: require("../../assets/brand/food-dessert.jpg"),
  other: require("../../assets/brand/food-neutral.svg"),
};

export function FoodThumbnail({ name, selection, size = 44 }: { name: string; selection?: ArtworkDraft; size?: number }) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const uri = artworkPhotoUrl(selection);
  const preset = selection?.kind === "preset" && selection.key in artwork ? selection.key as FoodArtworkKind : foodArtworkKind(name);
  return <Image accessible={false} source={uri && failedUri !== uri ? { uri } : artwork[preset]} contentFit="cover" cachePolicy="memory-disk"
    recyclingKey={`${name}-${uri ?? preset}`} onError={() => { if (uri) setFailedUri(uri); }} style={{ width: size, height: size, borderRadius: 11 }} />;
}
