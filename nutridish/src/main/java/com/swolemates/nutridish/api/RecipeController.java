package com.swolemates.nutridish.api;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.swolemates.nutridish.catalog.Allergen;
import com.swolemates.nutridish.catalog.Recipe;
import com.swolemates.nutridish.common.Coded;
import com.swolemates.nutridish.profile.DietProfile;
import com.swolemates.nutridish.profile.ProfileSanitizer;
import com.swolemates.nutridish.recipe.RecipeEvaluation;
import com.swolemates.nutridish.recipe.RecipeEvaluator;
import com.swolemates.nutridish.rules.DietaryRestriction;
import com.swolemates.nutridish.rules.DislikeMatcher;
import com.swolemates.nutridish.rules.LifeStage;
import com.swolemates.nutridish.search.RecipeQuery;
import com.swolemates.nutridish.search.RecipeSearchService;
import com.swolemates.nutridish.search.SortOrder;
import com.swolemates.nutridish.substitution.AdaptOutcome;
import com.swolemates.nutridish.substitution.SubstitutionService;
import com.swolemates.nutridish.web.NotFoundException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api/nutrition/recipes")
public class RecipeController {

    private final RecipeSearchService search;
    private final RecipeEvaluator evaluator;
    private final SubstitutionService substitutions;
    private final DislikeMatcher dislikes;
    private final RecipeViews views;
    private final ProfileSanitizer sanitizer;

    public RecipeController(RecipeSearchService search, RecipeEvaluator evaluator, SubstitutionService substitutions,
            DislikeMatcher dislikes, RecipeViews views, ProfileSanitizer sanitizer) {
        this.search = search;
        this.evaluator = evaluator;
        this.substitutions = substitutions;
        this.dislikes = dislikes;
        this.views = views;
        this.sanitizer = sanitizer;
    }

    @GetMapping
    public Views.SearchResponse search(
            @RequestParam(defaultValue = "") @Size(max = 200) String q,
            @RequestParam(required = false) List<String> regions,
            @RequestParam(required = false) List<String> cuisines,
            @RequestParam(required = false) List<String> mealTypes,
            @RequestParam(required = false) List<String> restrictions,
            @RequestParam(required = false) List<String> allergens,
            @RequestParam(required = false) List<String> dislikes,
            @RequestParam(defaultValue = "none") String lifeStage,
            @RequestParam(defaultValue = "false") boolean hideDisliked,
            @RequestParam(required = false) @Min(50) @Max(3000) Integer maxCalories,
            @RequestParam(required = false) @Min(0) @Max(200) Integer minProtein,
            @RequestParam(required = false) @Min(0) @Max(400) Integer maxCarbs,
            @RequestParam(required = false) @Min(0) @Max(200) Integer maxFat,
            @RequestParam(required = false) @Min(0) @Max(60) Integer minFiber,
            @RequestParam(required = false) @Min(1) @Max(600) Integer maxMinutes,
            @RequestParam(defaultValue = "best-match") String sort,
            @RequestParam(defaultValue = "false") boolean includeAdaptable,
            @RequestParam(defaultValue = "false") boolean blueZones) {
        DietProfile profile = new DietProfile(
                parseAll(DietaryRestriction.class, restrictions),
                parseAll(Allergen.class, allergens),
                this.dislikes.normalize(dislikes),
                Coded.parse(LifeStage.class, lifeStage),
                hideDisliked,
                new DietProfile.NutritionLimits(maxCalories, minProtein, maxCarbs, maxFat, minFiber, maxMinutes),
                null);
        RecipeQuery query = new RecipeQuery(q, set(regions), set(cuisines), set(mealTypes), profile,
                Coded.parse(SortOrder.class, sort), includeAdaptable, blueZones);
        List<Views.RecipeSummary> results = search.search(query).stream()
                .map(hit -> views.summary(hit.evaluation(), hit.fit()))
                .toList();
        return new Views.SearchResponse(results.size(), search.all().size(), results);
    }

    @GetMapping("/{id}")
    public Views.RecipeDetail detail(@PathVariable String id) {
        return views.detail(search.base(recipe(id)), null);
    }

    @PostMapping("/{id}/evaluate")
    public Views.RecipeDetail evaluate(@PathVariable String id, @Valid @RequestBody Views.EvaluateRequest request) {
        DietProfile profile = sanitizer.sanitize(request.profile());
        RecipeEvaluation evaluation = evaluator.evaluate(recipe(id), request.swaps());
        return views.detail(evaluation, evaluator.assess(evaluation, profile));
    }

    @PostMapping("/{id}/adapt")
    public Views.AdaptResponse adapt(@PathVariable String id, @Valid @RequestBody Views.EvaluateRequest request) {
        DietProfile profile = sanitizer.sanitize(request.profile());
        AdaptOutcome outcome = substitutions.adapt(recipe(id), request.swaps(), profile);
        return new Views.AdaptResponse(
                outcome.adapted().swaps(),
                outcome.applied().stream().map(views::candidate).toList(),
                views.detail(outcome.adapted(), outcome.fit()));
    }

    private Recipe recipe(String id) {
        return search.recipe(id).orElseThrow(() -> new NotFoundException("No recipe with id '" + id + "'"));
    }

    private static <E extends Enum<E> & Coded> Set<E> parseAll(Class<E> type, List<String> raw) {
        Set<E> values = EnumSet.noneOf(type);
        if (raw != null) {
            raw.stream().filter(v -> !v.isBlank()).forEach(v -> values.add(Coded.parse(type, v)));
        }
        return values;
    }

    private static Set<String> set(List<String> values) {
        return values == null ? Set.of() : Set.copyOf(values.stream().map(String::trim).filter(v -> !v.isEmpty()).toList());
    }
}
