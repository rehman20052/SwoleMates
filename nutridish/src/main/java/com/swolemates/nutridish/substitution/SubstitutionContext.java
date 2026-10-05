package com.swolemates.nutridish.substitution;

import java.util.List;

import com.swolemates.nutridish.catalog.Ingredient;
import com.swolemates.nutridish.profile.DietProfile;
import com.swolemates.nutridish.recipe.RecipeEvaluation;
import com.swolemates.nutridish.recipe.ResolvedLine;

public record SubstitutionContext(
        RecipeEvaluation current,
        ResolvedLine target,
        DietProfile profile,
        SubstitutionReason reason,
        List<Ingredient> candidatePool) {}
