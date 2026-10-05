import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { AppText, Input } from "./ui";
import { FoodThumbnail } from "./food-thumbnail";
import { LiftThumbnail } from "./lift-thumbnail";
import { foodArtworkChoices } from "@/lib/food-artwork";
import { catalogLiftArtwork, liftArtworkChoices } from "@/lib/lift-artwork";
import { pickArtworkPhoto, type ArtworkDraft } from "@/lib/artwork-photo";
import { useAppTheme } from "@/theme";

export function ArtworkCredit({ name }: { name: string }) {
  const entry = catalogLiftArtwork(name);
  if (!entry?.image) return null;
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(entry.source)}><AppText size={10} muted>Image: {entry.author} · wger</AppText></Pressable>
    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(entry.licenseUrl)}><AppText size={10} primary>{entry.license}</AppText></Pressable>
  </View>;
}
export function ArtworkPicker({ kind, name, value, onChange, disabled = false }: {
  kind: "food" | "lift"; name: string; value: ArtworkDraft; onChange: (value: ArtworkDraft) => void; disabled?: boolean;
}) {
  const theme = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choices = kind === "food" ? foodArtworkChoices : liftArtworkChoices;
  const Thumbnail = kind === "food" ? FoodThumbnail : LiftThumbnail;
  return <View style={{ gap: 9 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Thumbnail name={name} selection={value} size={54} />
      <View style={{ flex: 1, gap: 3 }}><AppText size={13} weight="bold">{value?.kind === "local" || value?.kind === "photo" ? "Your photo" : value?.kind === "preset" ? "Selected image" : "Automatic image"}</AppText><AppText size={11} muted>{kind === "food" && !value ? "Suggested from the food name" : !value ? "Based on the exercise name" : "Saved with this entry"}</AppText></View>
      <Pressable disabled={disabled || picking} accessibilityRole="button" accessibilityLabel={`Change ${kind} image`} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}><AppText size={12} primary weight="bold">Change</AppText></Pressable>
    </View>
    {kind === "lift" && !value ? <ArtworkCredit name={name} /> : null}
    {expanded ? <View style={{ gap: 10, borderRadius: 14, padding: 12, backgroundColor: theme.colors.surfaceRaised }}>
      <View style={{ flexDirection: "row", gap: 14, flexWrap: "wrap" }}>
        <Pressable disabled={disabled || picking} accessibilityRole="button" accessibilityLabel={`Use automatic ${kind} image`} onPress={() => { onChange(undefined); setError(null); setExpanded(false); }} style={{ minHeight: 44, justifyContent: "center" }}><AppText size={12} primary>Automatic</AppText></Pressable>
        <Pressable disabled={disabled || picking} accessibilityRole="button" accessibilityLabel={`Choose ${kind} photo`} onPress={() => {
          // Start the web picker in this synchronous tap handler.
          const picked = pickArtworkPhoto(); setPicking(true); setError(null);
          void picked.then(uri => { if (uri) { onChange({ kind: "local", uri }); setExpanded(false); } }).catch(err => setError(err.message)).finally(() => setPicking(false));
        }} style={{ minHeight: 44, justifyContent: "center" }}><AppText size={12} primary>{picking ? "Opening photos…" : "Choose photo"}</AppText></Pressable>
      </View>
      <Input bordered placeholder="Search images" accessibilityLabel={`Search ${kind} images`} value={query} onChangeText={setQuery} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {choices.filter(choice => choice.label.toLowerCase().includes(query.trim().toLowerCase())).map(choice => <Pressable key={choice.key} disabled={disabled || picking} accessibilityRole="button" accessibilityLabel={`Use ${choice.label} image`} onPress={() => { onChange({ kind: "preset", key: choice.key }); setExpanded(false); setError(null); }} style={{ width: 74, gap: 4, alignItems: "center", padding: 6, borderRadius: 10, borderWidth: 1, borderColor: value?.kind === "preset" && value.key === choice.key ? theme.colors.primary : theme.colors.border }}>
          <Thumbnail name="" selection={{ kind: "preset", key: choice.key }} size={48} /><AppText size={10} style={{ textAlign: "center" }}>{choice.label}</AppText>
        </Pressable>)}
      </View>
      {error ? <AppText size={12} color={theme.colors.danger}>{error}</AppText> : null}
    </View> : null}
  </View>;
}
