package com.swolemates.nutridish.api;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.swolemates.nutridish.catalog.Recipe;
import com.swolemates.nutridish.profile.DietProfile;
import com.swolemates.nutridish.profile.ProfileSanitizer;
import com.swolemates.nutridish.search.RecipeSearchService;
import com.swolemates.nutridish.substitution.SubstitutionOutcome;
import com.swolemates.nutridish.substitution.SubstitutionReason;
import com.swolemates.nutridish.substitution.SubstitutionService;
import com.swolemates.nutridish.web.CurrentUser;
import com.swolemates.nutridish.web.NotFoundException;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/nutrition/substitutions")
public class SubstitutionController {

    static final String NOTICE = "Suggestions are checked against your dietary rules using ingredient data. "
            + "Halal and kosher checks cover ingredients only, not certification. Nutrition is recalculated from USDA data "
            + "and is approximate. Check labels for allergens and cross-contact.";

    private final RecipeSearchService recipes;
    private final SubstitutionService substitutions;
    private final ProfileSanitizer sanitizer;
    private final RecipeViews views;
    private final CurrentUser currentUser;

    public SubstitutionController(RecipeSearchService recipes, SubstitutionService substitutions,
            ProfileSanitizer sanitizer, RecipeViews views, CurrentUser currentUser) {
        this.recipes = recipes;
        this.substitutions = substitutions;
        this.sanitizer = sanitizer;
        this.views = views;
        this.currentUser = currentUser;
    }

    @PostMapping
    public Views.SubstitutionResponse suggest(@Valid @RequestBody Views.SubstitutionRequest request) {
        Recipe recipe = recipes.recipe(request.recipeId())
                .orElseThrow(() -> new NotFoundException("No recipe with id '" + request.recipeId() + "'"));
        DietProfile profile = sanitizer.sanitize(request.profile());
        SubstitutionOutcome outcome = substitutions.suggest(
                currentUser.id(),
                recipe,
                request.swaps(),
                request.ingredientId(),
                profile,
                request.reason() == null ? SubstitutionReason.OTHER : request.reason());
        return new Views.SubstitutionResponse(
                recipe.id(),
                RecipeViews.ref(outcome.target().ingredient()),
                Math.round(outcome.target().grams() * 10) / 10.0,
                outcome.reason().id(),
                outcome.accepted().stream().map(views::candidate).toList(),
                outcome.rejected().stream().map(views::candidate).toList(),
                NOTICE);
    }
}
