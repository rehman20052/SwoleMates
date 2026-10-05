package com.swolemates.nutridish.api;

import java.time.LocalDate;
import java.util.List;

import com.swolemates.nutridish.catalog.NutrientValues;
import com.swolemates.nutridish.planner.MealLogEntry;
import com.swolemates.nutridish.profile.DietProfile;
import com.swolemates.nutridish.recipe.GoalTag;
import com.swolemates.nutridish.recipe.MacroSplit;
import com.swolemates.nutridish.recipe.ProfileFit;
import com.swolemates.nutridish.recipe.Swap;
import com.swolemates.nutridish.rules.Compatibility;
import com.swolemates.nutridish.rules.RuleFinding;
import com.swolemates.nutridish.substitution.SubstitutionReason;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class Views {

    private Views() {}

    public record EvaluateRequest(@Valid DietProfile profile, @Size(max = 20) List<@Valid Swap> swaps) {}

    public record SubstitutionRequest(
            @NotBlank @Size(max = 80) String recipeId,
            @NotBlank @Size(max = 80) String ingredientId,
            @Size(max = 20) List<@Valid Swap> swaps,
            @Valid DietProfile profile,
            SubstitutionReason reason) {}

    public record MealLogRequest(
            @NotNull LocalDate date,
            @NotBlank @Pattern(regexp = "breakfast|lunch|dinner|snack") String mealType,
            @NotBlank @Size(max = 80) String recipeId,
            @DecimalMin("0.25") @DecimalMax("20") double servings,
            @Size(max = 20) List<@Valid Swap> swaps) {}

    public record Option(String id, String label, String description) {}

    public record IngredientRef(String id, String name) {}

    public record RestrictionView(String id, String label, Compatibility status, List<RuleFinding> findings, String disclaimer) {}

    public record RecipeSummary(
            String id,
            String name,
            String cuisine,
            String region,
            String blueZone,
            String description,
            int minutes,
            int servings,
            List<String> mealTypes,
            NutrientValues nutrition,
            MacroSplit macroSplit,
            List<GoalTag> goalTags,
            List<String> compatibleWith,
            List<String> needsVerification,
            List<String> allergens,
            List<Adaptation> adaptations,
            FitSummary fit) {}

    public record Adaptation(IngredientRef from, IngredientRef to, Double grams) {}

    public record FitSummary(
            boolean meetsRequirements,
            List<IngredientRef> disliked,
            int cautions,
            int verifyNotes) {}

    public record SearchResponse(int count, int catalogSize, List<RecipeSummary> results) {}

    public record LineView(
            String ingredientId,
            String name,
            double grams,
            String amount,
            boolean optional,
            IngredientRef replaces,
            List<String> allergens,
            List<String> traits,
            NutrientValues nutrition,
            List<String> flags,
            String note,
            long fdcId,
            boolean nutrientProxy) {}

    public record RecipeDetail(
            RecipeSummary summary,
            List<LineView> ingredients,
            List<String> steps,
            List<RestrictionView> restrictions,
            List<Swap> swaps,
            String nutritionSource,
            ProfileFit fit) {}

    public record CandidateView(
            IngredientRef ingredient,
            String label,
            Double grams,
            Swap swap,
            String note,
            NutrientValues nutritionAfter,
            NutrientValues delta,
            List<RuleFinding> verifyNotes,
            List<String> reasons) {}

    public record SubstitutionResponse(
            String recipeId,
            IngredientRef target,
            double targetGrams,
            String reason,
            List<CandidateView> accepted,
            List<CandidateView> rejected,
            String notice) {}

    public record AdaptResponse(List<Swap> swaps, List<CandidateView> applied, RecipeDetail recipe) {}

    public record MealView(
            long id,
            String mealType,
            String recipeId,
            String recipeName,
            double servings,
            List<Swap> swaps,
            MealLogEntry.Snapshot nutrition) {}

    public record DayView(LocalDate date, List<MealView> meals, MealLogEntry.Snapshot totals, DietProfile.DailyTargets targets, String nutritionSource) {}

    public record RegionView(String name, List<String> cuisines, int recipeCount) {}

    public record MetaResponse(
            List<RegionView> regions,
            List<String> mealTypes,
            List<Option> restrictions,
            List<Option> allergens,
            List<Option> lifeStages,
            List<Option> goalTags,
            List<Option> sorts,
            List<Option> reasons) {}
}
