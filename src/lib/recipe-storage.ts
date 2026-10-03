import type { SavedMeal } from "@/state/app-data";
import { createDurableList, type ListStorage } from "./durable-list";

export const recipeStorageKey = "swolemates.saved-recipes";

// Recipes have their own durable record, independent of dashboard snapshots.
// Serialize edits so a slower write cannot overwrite a newer recipe list.
export function createRecipeStore(storage: ListStorage) {
  let store: ReturnType<typeof createDurableList<SavedMeal>> | null = null;
  return {
    load(fallback: SavedMeal[], validate: (value: unknown) => value is SavedMeal) {
      store ??= createDurableList(storage, recipeStorageKey, validate,
        (recipes) => recipes.filter((meal) => !["saved-1", "saved-2", "saved-3"].includes(meal.id)));
      return store.load(fallback);
    },
    change(edit: (current: SavedMeal[]) => SavedMeal[]) {
      if (!store) return Promise.reject(new Error("Your recipes are still loading. Please try again."));
      return store.change(edit);
    },
  };
}
