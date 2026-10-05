package com.swolemates.nutridish.catalog;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Component
public class LocalCatalog implements RecipeProvider, IngredientCatalog {

    private final Map<String, Ingredient> ingredients;
    private final Map<String, Recipe> recipes;
    private final Map<String, List<SwapRule>> swapRules;

    @Autowired
    public LocalCatalog(JsonMapper json) {
        this(json, "catalog/");
    }

    LocalCatalog(JsonMapper mapper, String directory) {
        JsonMapper json = mapper.rebuild().disable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES).build();
        List<Ingredient> ingredientList = read(json, directory + "ingredients.json", new TypeReference<>() {});
        List<Recipe> recipeList = read(json, directory + "recipes.json", new TypeReference<>() {});
        JsonNode swapTree = read(json, directory + "substitutions.json", new TypeReference<>() {});

        Map<String, Ingredient> ingredientMap = new LinkedHashMap<>();
        ingredientList.forEach(i -> ingredientMap.put(i.id(), i));
        Map<String, Recipe> recipeMap = new LinkedHashMap<>();
        recipeList.forEach(r -> recipeMap.put(r.id(), r));
        Map<String, List<SwapRule>> swapMap = new LinkedHashMap<>();
        for (Map.Entry<String, JsonNode> entry : swapTree.properties()) {
            List<SwapRule> rules = json.convertValue(entry.getValue(), new TypeReference<List<SwapRule>>() {});
            swapMap.put(entry.getKey(), rules.stream()
                    .map(r -> new SwapRule(r.to(), r.omits() ? 0 : r.ratio(), r.note()))
                    .toList());
        }

        List<String> problems = validate(ingredientList, ingredientMap, recipeList, recipeMap, swapMap);
        if (!problems.isEmpty()) {
            throw new IllegalStateException("NutriDish catalog is invalid:\n  " + String.join("\n  ", problems));
        }
        this.ingredients = Collections.unmodifiableMap(ingredientMap);
        this.recipes = Collections.unmodifiableMap(recipeMap);
        this.swapRules = Collections.unmodifiableMap(swapMap);
    }

    @Override
    public List<Recipe> recipes() {
        return List.copyOf(recipes.values());
    }

    @Override
    public Optional<Recipe> recipe(String id) {
        return Optional.ofNullable(recipes.get(id));
    }

    @Override
    public Collection<Ingredient> ingredients() {
        return ingredients.values();
    }

    @Override
    public Optional<Ingredient> ingredient(String id) {
        return Optional.ofNullable(id == null ? null : ingredients.get(id));
    }

    public List<SwapRule> swapRules(String ingredientId) {
        return swapRules.getOrDefault(ingredientId, List.of());
    }

    private static <T> T read(JsonMapper json, String path, TypeReference<T> type) {
        try (InputStream in = new ClassPathResource(path).getInputStream()) {
            return json.readValue(in, type);
        } catch (IOException e) {
            throw new IllegalStateException("Could not read " + path, e);
        }
    }

    private static List<String> validate(
            List<Ingredient> ingredientList,
            Map<String, Ingredient> ingredients,
            List<Recipe> recipeList,
            Map<String, Recipe> recipes,
            Map<String, List<SwapRule>> swaps) {
        List<String> problems = new ArrayList<>();
        if (ingredients.size() != ingredientList.size()) {
            problems.add("duplicate ingredient ids");
        }
        if (recipes.size() != recipeList.size()) {
            problems.add("duplicate recipe ids");
        }
        for (Ingredient ingredient : ingredientList) {
            if (ingredient.nutrition() == null || ingredient.nutrition().per100g() == null) {
                problems.add("ingredient " + ingredient.id() + " has no nutrient data");
            }
        }
        for (Recipe recipe : recipeList) {
            if (recipe.servings() < 1 || recipe.minutes() < 1) {
                problems.add("recipe " + recipe.id() + " needs positive servings and minutes");
            }
            if (recipe.ingredients().isEmpty() || recipe.steps().isEmpty()) {
                problems.add("recipe " + recipe.id() + " needs ingredients and steps");
            }
            Set<String> seen = new HashSet<>();
            for (Recipe.Line line : recipe.ingredients()) {
                if (!ingredients.containsKey(line.ingredientId())) {
                    problems.add("recipe " + recipe.id() + " uses unknown ingredient " + line.ingredientId());
                }
                if (!(line.grams() > 0)) {
                    problems.add("recipe " + recipe.id() + " has a non-positive amount of " + line.ingredientId());
                }
                if (!seen.add(line.ingredientId())) {
                    problems.add("recipe " + recipe.id() + " lists " + line.ingredientId() + " twice");
                }
            }
        }
        swaps.forEach((from, rules) -> {
            if (!ingredients.containsKey(from)) {
                problems.add("substitutions.json has rules for unknown ingredient " + from);
            }
            for (SwapRule rule : rules) {
                if (!rule.omits() && !ingredients.containsKey(rule.to())) {
                    problems.add("substitution " + from + " -> unknown ingredient " + rule.to());
                }
                if (!rule.omits() && !(rule.ratio() > 0 && rule.ratio() <= 3)) {
                    problems.add("substitution " + from + " -> " + rule.to() + " needs a ratio between 0 and 3");
                }
                if (from.equals(rule.to())) {
                    problems.add("substitution " + from + " swaps to itself");
                }
            }
        });
        return problems;
    }
}
