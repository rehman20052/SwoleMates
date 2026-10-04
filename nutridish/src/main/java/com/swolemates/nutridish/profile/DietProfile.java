package com.swolemates.nutridish.profile;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

import com.swolemates.nutridish.catalog.Allergen;
import com.swolemates.nutridish.rules.DietaryRestriction;
import com.swolemates.nutridish.rules.LifeStage;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

public record DietProfile(
        Set<DietaryRestriction> restrictions,
        Set<Allergen> allergens,
        @Size(max = 30) List<String> dislikes,
        LifeStage lifeStage,
        boolean hideDisliked,
        @Valid NutritionLimits limits,
        @Valid DailyTargets targets) {

    public DietProfile {
        restrictions = restrictions == null || restrictions.isEmpty()
                ? Set.of() : Set.copyOf(EnumSet.copyOf(restrictions));
        allergens = allergens == null || allergens.isEmpty() ? Set.of() : Set.copyOf(EnumSet.copyOf(allergens));
        dislikes = dislikes == null ? List.of() : List.copyOf(dislikes);
        lifeStage = lifeStage == null ? LifeStage.NONE : lifeStage;
        limits = limits == null ? NutritionLimits.NONE : limits;
        targets = targets == null ? DailyTargets.NONE : targets;
    }

    public static final DietProfile EMPTY = new DietProfile(null, null, null, null, false, null, null);

    public DietProfile withDislikes(List<String> normalized) {
        return new DietProfile(restrictions, allergens, normalized, lifeStage, hideDisliked, limits, targets);
    }

    public record NutritionLimits(
            @Min(50) @Max(3000) Integer maxCalories,
            @Min(0) @Max(200) Integer minProtein,
            @Min(0) @Max(400) Integer maxCarbs,
            @Min(0) @Max(200) Integer maxFat,
            @Min(0) @Max(60) Integer minFiber,
            @Min(1) @Max(600) Integer maxMinutes) {

        public static final NutritionLimits NONE = new NutritionLimits(null, null, null, null, null, null);
    }

    public record DailyTargets(
            @Min(800) @Max(8000) Integer calories,
            @Min(0) @Max(400) Integer protein,
            @Min(0) @Max(1000) Integer carbs,
            @Min(0) @Max(400) Integer fat) {

        public static final DailyTargets NONE = new DailyTargets(null, null, null, null);
    }
}
