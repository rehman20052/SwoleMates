package com.swolemates.nutridish.search;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

import com.swolemates.nutridish.catalog.Ingredient;
import com.swolemates.nutridish.catalog.NutrientValues;
import com.swolemates.nutridish.catalog.Recipe;
import com.swolemates.nutridish.catalog.RecipeProvider;
import com.swolemates.nutridish.profile.DietProfile;
import com.swolemates.nutridish.recipe.ProfileFit;
import com.swolemates.nutridish.recipe.RecipeEvaluation;
import com.swolemates.nutridish.recipe.RecipeEvaluator;
import com.swolemates.nutridish.substitution.AdaptOutcome;
import com.swolemates.nutridish.substitution.SubstitutionService;

@Service
public class RecipeSearchService {

    private final RecipeProvider recipes;
    private final RecipeEvaluator evaluator;
    private final SubstitutionService substitutions;
    private final Map<String, RecipeEvaluation> baseEvaluations = new ConcurrentHashMap<>();

    public RecipeSearchService(RecipeProvider recipes, RecipeEvaluator evaluator, SubstitutionService substitutions) {
        this.recipes = recipes;
        this.evaluator = evaluator;
        this.substitutions = substitutions;
    }

    public record Hit(RecipeEvaluation evaluation, ProfileFit fit) {

        public boolean adapted() {
            return !evaluation.swaps().isEmpty();
        }
    }

    public Optional<Recipe> recipe(String id) {
        return recipes.recipe(id);
    }

    public List<Recipe> all() {
        return recipes.recipes();
    }

    public RecipeEvaluation base(Recipe recipe) {
        return baseEvaluations.computeIfAbsent(recipe.id(), id -> evaluator.evaluate(recipe));
    }

    public List<Hit> search(RecipeQuery query) {
        DietProfile profile = query.profile();
        List<String> terms = List.of(query.text().toLowerCase(Locale.ROOT).split("\\s+")).stream()
                .filter(t -> !t.isBlank()).toList();
        List<Hit> hits = new ArrayList<>();
        for (Recipe recipe : recipes.recipes()) {
            if (!matchesAny(query.regions(), recipe.region()) || !matchesAny(query.cuisines(), recipe.cuisine())) {
                continue;
            }
            if (query.blueZonesOnly() && recipe.blueZone() == null) {
                continue;
            }
            if (!query.mealTypes().isEmpty() && recipe.mealTypes().stream().noneMatch(m -> containsIgnoreCase(query.mealTypes(), m))) {
                continue;
            }
            RecipeEvaluation evaluation = base(recipe);
            if (!terms.isEmpty() && !matchesText(evaluation, terms)) {
                continue;
            }
            ProfileFit fit = evaluator.assess(evaluation, profile);
            if (!fit.meetsRequirements() && query.includeAdaptable()) {
                AdaptOutcome adapted = substitutions.adapt(recipe, List.of(), profile);
                evaluation = adapted.adapted();
                fit = adapted.fit();
            }
            if (!fit.meetsRequirements() || !fit.limitNotes().isEmpty()) {
                continue;
            }
            if (profile.hideDisliked() && !fit.dislikedIngredientIds().isEmpty()) {
                continue;
            }
            hits.add(new Hit(evaluation, fit));
        }
        hits.sort(comparator(query.sort()));
        return hits;
    }

    private static Comparator<Hit> comparator(SortOrder sort) {
        return switch (sort) {
            case BEST_MATCH -> Comparator.<Hit>comparingInt(h -> h.evaluation().swaps().size())
                    .thenComparingInt(h -> h.fit().conflicts().size())
                    .thenComparingInt(h -> h.fit().verifyNotes().size());
            case PROTEIN -> Comparator.comparingDouble((Hit h) -> n(h).protein()).reversed();
            case PROTEIN_DENSITY -> Comparator.comparingDouble((Hit h) -> n(h).calories() <= 0 ? 0 : n(h).protein() / n(h).calories()).reversed();
            case CALORIES -> Comparator.comparingDouble(h -> n(h).calories());
            case QUICKEST -> Comparator.comparingInt(h -> h.evaluation().recipe().minutes());
            case FIBER -> Comparator.comparingDouble((Hit h) -> n(h).fiber()).reversed();
        };
    }

    private static NutrientValues n(Hit hit) {
        return hit.evaluation().perServing();
    }

    private static boolean matchesAny(Set<String> selected, String value) {
        return selected.isEmpty() || containsIgnoreCase(selected, value);
    }

    private static boolean containsIgnoreCase(Set<String> values, String value) {
        return values.stream().anyMatch(v -> v.equalsIgnoreCase(value));
    }

    private static boolean matchesText(RecipeEvaluation evaluation, List<String> terms) {
        Recipe recipe = evaluation.recipe();
        StringBuilder text = new StringBuilder()
                .append(recipe.name()).append(' ')
                .append(recipe.cuisine()).append(' ')
                .append(recipe.region()).append(' ')
                .append(recipe.blueZone() == null ? "" : recipe.blueZone() + " blue zone").append(' ')
                .append(recipe.description()).append(' ');
        for (Ingredient ingredient : evaluation.ingredients()) {
            text.append(ingredient.name()).append(' ');
            ingredient.aliases().forEach(a -> text.append(a).append(' '));
        }
        String haystack = text.toString().toLowerCase(Locale.ROOT);
        return terms.stream().allMatch(haystack::contains);
    }
}
