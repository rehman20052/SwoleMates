import { AppText } from "./ui";
import type { ScanIngredient, ScannedFood } from "@/lib/food-scanner";

export function FoodScanner(_props: { initialIngredients?: ScanIngredient[]; onChange?: (items: ScanIngredient[]) => void; onUse: (food: ScannedFood, items: ScanIngredient[]) => void; onClose: () => void }) {
  return <AppText>Camera food scanning is available in the SwoleMates Home Screen web app. You can enter nutrition manually here.</AppText>;
}
