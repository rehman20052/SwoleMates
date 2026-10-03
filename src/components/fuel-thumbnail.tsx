import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from "react-native-svg";

// Local vector artwork stays sharp at phone sizes and loads without a network.
export function FuelThumbnail({ kind, size = 88 }: { kind: "plan" | "weight"; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 100 100" accessible={false}>
    <Defs><LinearGradient id={`fuel-${kind}`} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#334D16" /><Stop offset="1" stopColor="#111C0A" /></LinearGradient></Defs>
    <Rect width="100" height="100" rx="24" fill={`url(#fuel-${kind})`} />
    <Circle cx="83" cy="15" r="27" fill="#CBFF74" opacity="0.12" />
    <Circle cx="8" cy="96" r="36" fill="#CBFF74" opacity="0.08" />
    {kind === "plan" ? <>
      <Ellipse cx="51" cy="73" rx="31" ry="8" fill="#000" opacity="0.25" />
      <Circle cx="50" cy="49" r="33" fill="#DCE5CD" />
      <Circle cx="50" cy="49" r="27" fill="#F9FBEF" />
      <Path d="M29 42 Q39 28 52 40 L55 52 Q38 61 29 48Z" fill="#D5A55D" />
      <Path d="M33 40 L44 46 M36 35 L48 42 M32 46 L44 52" stroke="#AA7541" strokeWidth="2" strokeLinecap="round" />
      <Circle cx="64" cy="40" r="9" fill="#82B845" /><Circle cx="66" cy="50" r="8" fill="#A6D365" /><Circle cx="56" cy="37" r="6" fill="#B6DE77" />
      <Path d="M36 60 Q50 53 64 59 L65 65 Q50 76 36 65Z" fill="#E7C990" />
      <Path d="M42 62 L45 63 M49 60 L52 61 M56 63 L59 64" stroke="#FFF9E7" strokeWidth="2" strokeLinecap="round" />
      <Circle cx="76" cy="76" r="13" fill="#CCFF00" /><Path d="M70 76 L74 80 L82 71" fill="none" stroke="#254000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </> : <>
      <Ellipse cx="50" cy="80" rx="28" ry="6" fill="#000" opacity="0.25" />
      <Rect x="23" y="22" width="55" height="55" rx="15" fill="#EAF0DF" />
      <Rect x="31" y="29" width="39" height="23" rx="7" fill="#BACDA6" />
      <Path d="M36 45 A16 16 0 0 1 65 45" fill="none" stroke="#506E36" strokeWidth="2" />
      <Path d="M50 44 L57 35" stroke="#334D16" strokeWidth="3" strokeLinecap="round" />
      <Circle cx="50" cy="44" r="3" fill="#334D16" />
      <Path d="M33 60 L42 60 M59 60 L68 60 M33 66 L42 66 M59 66 L68 66" stroke="#CAD9BA" strokeWidth="3" strokeLinecap="round" />
      <Circle cx="77" cy="76" r="13" fill="#CCFF00" /><Path d="M71 76 H82 M77 71 V82" stroke="#254000" strokeWidth="3" strokeLinecap="round" />
    </>}
  </Svg>;
}
