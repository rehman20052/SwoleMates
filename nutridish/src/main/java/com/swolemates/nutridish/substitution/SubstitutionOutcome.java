package com.swolemates.nutridish.substitution;

import java.util.List;

import com.swolemates.nutridish.recipe.RecipeEvaluation;
import com.swolemates.nutridish.recipe.ResolvedLine;

public record SubstitutionOutcome(
        RecipeEvaluation current,
        ResolvedLine target,
        SubstitutionReason reason,
        List<CandidateVerdict> accepted,
        List<CandidateVerdict> rejected) {}
