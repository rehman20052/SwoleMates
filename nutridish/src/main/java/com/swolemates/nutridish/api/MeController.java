package com.swolemates.nutridish.api;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.swolemates.nutridish.catalog.NutrientValues;
import com.swolemates.nutridish.catalog.Recipe;
import com.swolemates.nutridish.nutrition.NutritionProvider;
import com.swolemates.nutridish.planner.FavoritesRepository;
import com.swolemates.nutridish.planner.MealLogEntry;
import com.swolemates.nutridish.planner.MealLogRepository;
import com.swolemates.nutridish.profile.DietProfile;
import com.swolemates.nutridish.profile.ProfileRepository;
import com.swolemates.nutridish.profile.ProfileSanitizer;
import com.swolemates.nutridish.recipe.RecipeEvaluation;
import com.swolemates.nutridish.recipe.RecipeEvaluator;
import com.swolemates.nutridish.recipe.Swap;
import com.swolemates.nutridish.search.RecipeSearchService;
import com.swolemates.nutridish.web.CurrentUser;
import com.swolemates.nutridish.web.NotFoundException;

import jakarta.validation.Valid;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequestMapping("/api/nutrition/me")
public class MeController {

    private final CurrentUser currentUser;
    private final ProfileRepository profiles;
    private final ProfileSanitizer sanitizer;
    private final FavoritesRepository favorites;
    private final MealLogRepository meals;
    private final RecipeSearchService recipes;
    private final RecipeEvaluator evaluator;
    private final NutritionProvider nutrition;
    private final RecipeViews views;
    private final JsonMapper json;

    public MeController(CurrentUser currentUser, ProfileRepository profiles, ProfileSanitizer sanitizer,
            FavoritesRepository favorites, MealLogRepository meals, RecipeSearchService recipes,
            RecipeEvaluator evaluator, NutritionProvider nutrition, RecipeViews views, JsonMapper json) {
        this.currentUser = currentUser;
        this.profiles = profiles;
        this.sanitizer = sanitizer;
        this.favorites = favorites;
        this.meals = meals;
        this.recipes = recipes;
        this.evaluator = evaluator;
        this.nutrition = nutrition;
        this.views = views;
        this.json = json;
    }

    @GetMapping("/profile")
    public DietProfile profile() {
        return profiles.find(currentUser.id()).orElse(DietProfile.EMPTY);
    }

    @PutMapping("/profile")
    public DietProfile saveProfile(@Valid @RequestBody DietProfile profile) {
        DietProfile clean = sanitizer.sanitize(profile);
        profiles.save(currentUser.id(), clean);
        return clean;
    }

    @GetMapping("/favorites")
    public List<Views.RecipeSummary> favorites() {
        DietProfile profile = profile();
        return favorites.list(currentUser.id()).stream()
                .flatMap(id -> recipes.recipe(id).stream())
                .map(recipe -> {
                    RecipeEvaluation evaluation = recipes.base(recipe);
                    return views.summary(evaluation, evaluator.assess(evaluation, profile));
                })
                .toList();
    }

    @PutMapping("/favorites/{recipeId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void addFavorite(@PathVariable String recipeId) {
        recipe(recipeId);
        favorites.add(currentUser.id(), recipeId);
    }

    @DeleteMapping("/favorites/{recipeId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeFavorite(@PathVariable String recipeId) {
        favorites.remove(currentUser.id(), recipeId);
    }

    @GetMapping("/meals")
    public Views.DayView day(@RequestParam LocalDate date) {
        List<MealLogEntry> entries = meals.list(currentUser.id(), date);
        MealLogEntry.Snapshot totals = MealLogEntry.Snapshot.ZERO;
        for (MealLogEntry entry : entries) {
            totals = totals.plus(entry.nutrition());
        }
        List<Views.MealView> views = entries.stream()
                .map(e -> new Views.MealView(e.id(), e.mealType(), e.recipeId(), e.recipeName(), e.servings(),
                        parseSwaps(e.swapsJson()), e.nutrition().rounded()))
                .toList();
        return new Views.DayView(date, views, totals.rounded(), profile().targets(), nutrition.sourceDescription());
    }

    @PostMapping("/meals")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> logMeal(@Valid @RequestBody Views.MealLogRequest request) {
        Recipe recipe = recipe(request.recipeId());
        RecipeEvaluation evaluation = evaluator.evaluate(recipe, request.swaps());
        NutrientValues eaten = evaluation.perServing().times(request.servings());
        MealLogEntry entry = new MealLogEntry(0, request.date(), request.mealType(), recipe.id(),
                evaluation.swaps().isEmpty() ? recipe.name() : recipe.name() + " (adapted)",
                request.servings(),
                json.writeValueAsString(evaluation.swaps()),
                new MealLogEntry.Snapshot(eaten.calories(), eaten.protein(), eaten.carbs(), eaten.fat(), eaten.fiber()),
                nutrition.sourceDescription());
        long id = meals.add(currentUser.id(), entry);
        return Map.of("id", id);
    }

    @DeleteMapping("/meals/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteMeal(@PathVariable long id) {
        if (!meals.delete(currentUser.id(), id)) {
            throw new NotFoundException("No meal log entry " + id);
        }
    }

    private Recipe recipe(String id) {
        return recipes.recipe(id).orElseThrow(() -> new NotFoundException("No recipe with id '" + id + "'"));
    }

    private List<Swap> parseSwaps(String text) {
        return json.readValue(text, new TypeReference<List<Swap>>() {});
    }
}
