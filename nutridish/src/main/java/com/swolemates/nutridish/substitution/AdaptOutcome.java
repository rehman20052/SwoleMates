package com.swolemates.nutridish.substitution;

import java.util.List;

import com.swolemates.nutridish.recipe.ProfileFit;
import com.swolemates.nutridish.recipe.RecipeEvaluation;

public record AdaptOutcome(RecipeEvaluation adapted, ProfileFit fit, List<CandidateVerdict> applied) {}
