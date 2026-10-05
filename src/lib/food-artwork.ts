export type FoodArtworkKind = "coffee" | "chicken" | "kebab" | "chips" | "pasta" | "yogurt" | "eggs" | "fish" | "steak" | "burger" | "pizza" | "rice" | "salad" | "sandwich" | "fruit" | "smoothie" | "oats" | "dessert" | "other";
export const foodArtworkChoices: { key: FoodArtworkKind; label: string }[] = [
  { key: "chicken", label: "Chicken" }, { key: "steak", label: "Steak" }, { key: "fish", label: "Fish" },
  { key: "eggs", label: "Eggs" }, { key: "rice", label: "Rice" }, { key: "pasta", label: "Pasta" },
  { key: "sandwich", label: "Sandwich" }, { key: "burger", label: "Burger" }, { key: "pizza", label: "Pizza" },
  { key: "kebab", label: "Kebab" }, { key: "salad", label: "Salad" }, { key: "fruit", label: "Fruit" },
  { key: "smoothie", label: "Shake" }, { key: "oats", label: "Oats" }, { key: "yogurt", label: "Yogurt" },
  { key: "coffee", label: "Coffee" }, { key: "chips", label: "Chips" }, { key: "dessert", label: "Dessert" }, { key: "other", label: "Other" },
];

// These are decorative category photos, never ingredient or nutrition guesses.
export function foodArtworkKind(name: string): FoodArtworkKind {
  const text = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ");
  // Specific dishes before ingredients: chicken salad/sandwich should stay a salad/sandwich.
  if (/\b(chips?|crisps?|popcorn|crackers?)\b/.test(text)) return "chips";
  if (/\b(coffee|espresso|latte|cappuccino|mocha|cold brew)\b/.test(text)) return "coffee";
  if (/\b(smoothies?|shakes?|protein drink|whey|fairlife|muscle milk)\b/.test(text)) return "smoothie";
  if (/\b(burgers?|cheeseburgers?|hamburgers?)\b/.test(text)) return "burger";
  if (/\b(pizzas?)\b/.test(text)) return "pizza";
  if (/\b(sandwich(?:es)?|subs?|panini|wraps?|toasties?|bagels?)\b/.test(text)) return "sandwich";
  if (/\b(salads?|caesar)\b/.test(text)) return "salad";
  if (/\b(yog[uh]urt|parfait)\b/.test(text)) return "yogurt";
  if (/\b(oats?|oatmeal|porridge|granola|muesli)\b/.test(text)) return "oats";
  if (/\b(cakes?|cookies?|biscuits?|brownies?|ice cream|chocolate|donuts?|doughnuts?|pudding)\b/.test(text)) return "dessert";
  if (/\b(k[ae]b[ao]bs?|shawarma|naan|gyro)\b/.test(text)) return "kebab";
  if (/\b(pasta|spaghetti|penne|macaroni|lasagna|fettuccine)\b/.test(text)) return "pasta";
  if (/\b(eggs?|omelet(?:te)?|scrambled|frittata)\b/.test(text)) return "eggs";
  if (/\b(salmon|tuna|fish|cod|tilapia|trout|shrimp|prawns?|sushi)\b/.test(text)) return "fish";
  if (/\b(steak|beef|lamb|pork|brisket|meatballs?)\b/.test(text)) return "steak";
  if (/\b(chicken|turkey|poultry)\b/.test(text)) return "chicken";
  if (/\b(rice|biryani|pilaf|pulao|risotto)\b/.test(text)) return "rice";
  if (/\b(apples?|bananas?|berries|strawberries|blueberries|raspberries|oranges?|mango(?:es)?|grapes?|pineapple|watermelon|fruit)\b/.test(text)) return "fruit";
  return "other";
}
