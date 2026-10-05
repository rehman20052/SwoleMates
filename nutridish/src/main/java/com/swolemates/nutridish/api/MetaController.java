package com.swolemates.nutridish.api;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.swolemates.nutridish.catalog.Allergen;
import com.swolemates.nutridish.catalog.Ingredient;
import com.swolemates.nutridish.catalog.IngredientCatalog;
import com.swolemates.nutridish.catalog.Recipe;
import com.swolemates.nutridish.recipe.GoalTag;
import com.swolemates.nutridish.rules.DietaryRestriction;
import com.swolemates.nutridish.rules.LifeStage;
import com.swolemates.nutridish.search.RecipeSearchService;
import com.swolemates.nutridish.search.SortOrder;
import com.swolemates.nutridish.substitution.SubstitutionReason;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api/nutrition")
public class MetaController {

    private final RecipeSearchService recipes;
    private final IngredientCatalog ingredients;

    public MetaController(RecipeSearchService recipes, IngredientCatalog ingredients) {
        this.recipes = recipes;
        this.ingredients = ingredients;
    }

    @GetMapping("/meta")
    public Views.MetaResponse meta() {
        Map<String, Set<String>> cuisinesByRegion = new LinkedHashMap<>();
        Map<String, Integer> counts = new LinkedHashMap<>();
        Set<String> mealTypes = new LinkedHashSet<>(List.of("breakfast", "lunch", "dinner", "snack"));
        for (Recipe recipe : recipes.all()) {
            cuisinesByRegion.computeIfAbsent(recipe.region(), r -> new LinkedHashSet<>()).add(recipe.cuisine());
            counts.merge(recipe.region(), 1, Integer::sum);
        }
        List<Views.RegionView> regions = new ArrayList<>();
        cuisinesByRegion.forEach((region, cuisines) -> regions.add(new Views.RegionView(region, List.copyOf(cuisines), counts.get(region))));
        return new Views.MetaResponse(
                regions,
                List.copyOf(mealTypes),
                Arrays.stream(DietaryRestriction.values()).map(r -> RecipeViews.option(r, r.disclaimer())).toList(),
                Arrays.stream(Allergen.values()).map(a -> RecipeViews.option(a, null)).toList(),
                Arrays.stream(LifeStage.values()).map(l -> RecipeViews.option(l, l.guidance())).toList(),
                Arrays.stream(GoalTag.values()).map(g -> RecipeViews.option(g, g.rule())).toList(),
                Arrays.stream(SortOrder.values()).map(s -> RecipeViews.option(s, null)).toList(),
                Arrays.stream(SubstitutionReason.values()).map(s -> RecipeViews.option(s, null)).toList());
    }

    @GetMapping("/ingredients")
    public List<Map<String, Object>> ingredients(
            @RequestParam(defaultValue = "") @Size(max = 40) String q,
            @RequestParam(defaultValue = "20") @Min(1) @Max(200) int limit) {
        String needle = q.trim().toLowerCase(Locale.ROOT);
        List<Map<String, Object>> results = new ArrayList<>();
        for (Ingredient ingredient : ingredients.ingredients()) {
            if (results.size() >= limit) {
                break;
            }
            boolean match = needle.isEmpty()
                    || ingredient.name().toLowerCase(Locale.ROOT).contains(needle)
                    || ingredient.aliases().stream().anyMatch(a -> a.toLowerCase(Locale.ROOT).contains(needle))
                    || ingredient.groups().stream().anyMatch(g -> g.toLowerCase(Locale.ROOT).contains(needle));
            if (match) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", ingredient.id());
                row.put("name", ingredient.name());
                row.put("groups", ingredient.groups());
                results.add(row);
            }
        }
        return results;
    }
}
