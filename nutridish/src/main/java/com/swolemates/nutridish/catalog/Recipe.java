package com.swolemates.nutridish.catalog;

import java.util.List;

public record Recipe(
        String id,
        String name,
        String cuisine,
        String region,
        String blueZone,
        String description,
        int minutes,
        int servings,
        List<String> mealTypes,
        List<Line> ingredients,
        List<String> steps) {

    public Recipe {
        mealTypes = mealTypes == null ? List.of() : List.copyOf(mealTypes);
        ingredients = List.copyOf(ingredients);
        steps = steps == null ? List.of() : List.copyOf(steps);
    }

    public record Line(String ingredientId, double grams, String amount, boolean optional) {}
}
