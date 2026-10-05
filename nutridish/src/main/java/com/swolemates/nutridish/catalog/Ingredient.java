package com.swolemates.nutridish.catalog;

import java.util.List;
import java.util.Set;

public record Ingredient(
        String id,
        String name,
        List<String> aliases,
        List<String> groups,
        Set<IngredientTrait> traits,
        Set<Allergen> allergens,
        String note,
        NutritionSource nutrition) {

    public Ingredient {
        aliases = aliases == null ? List.of() : List.copyOf(aliases);
        groups = groups == null ? List.of() : List.copyOf(groups);
        traits = traits == null ? Set.of() : Set.copyOf(traits);
        allergens = allergens == null ? Set.of() : Set.copyOf(allergens);
    }

    public boolean has(IngredientTrait trait) {
        return traits.contains(trait);
    }

    public record NutritionSource(
            String source,
            long fdcId,
            String fdcDescription,
            boolean proxy,
            List<String> unreportedFields,
            NutrientValues per100g) {}
}
