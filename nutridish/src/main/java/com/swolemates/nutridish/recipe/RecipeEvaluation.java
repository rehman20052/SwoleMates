package com.swolemates.nutridish.recipe;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.swolemates.nutridish.catalog.Allergen;
import com.swolemates.nutridish.catalog.Ingredient;
import com.swolemates.nutridish.catalog.NutrientValues;
import com.swolemates.nutridish.catalog.Recipe;
import com.swolemates.nutridish.rules.DietaryRestriction;
import com.swolemates.nutridish.rules.RestrictionVerdict;

public record RecipeEvaluation(
        Recipe recipe,
        List<Swap> swaps,
        List<ResolvedLine> lines,
        NutrientValues perServing,
        Map<DietaryRestriction, RestrictionVerdict> restrictions,
        Set<Allergen> allergens) {

    public List<Ingredient> ingredients() {
        Map<String, Ingredient> distinct = new LinkedHashMap<>();
        lines.forEach(line -> distinct.putIfAbsent(line.ingredient().id(), line.ingredient()));
        return List.copyOf(distinct.values());
    }

    public MacroSplit macroSplit() {
        return MacroSplit.of(perServing);
    }

    public List<GoalTag> goalTags() {
        NutrientValues rounded = perServing.rounded();
        return Arrays.stream(GoalTag.values()).filter(tag -> tag.appliesTo(rounded)).toList();
    }

    public boolean contains(String ingredientId) {
        return lines.stream().anyMatch(line -> line.ingredient().id().equals(ingredientId));
    }
}
