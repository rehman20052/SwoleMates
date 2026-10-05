package com.swolemates.nutridish.substitution;

import java.util.List;

import com.swolemates.nutridish.catalog.Ingredient;
import com.swolemates.nutridish.catalog.NutrientValues;
import com.swolemates.nutridish.recipe.RecipeEvaluation;
import com.swolemates.nutridish.recipe.Swap;
import com.swolemates.nutridish.rules.RuleFinding;

public record CandidateVerdict(
        Proposal proposal,
        Ingredient ingredient,
        Swap swap,
        boolean accepted,
        List<String> reasons,
        RecipeEvaluation adapted,
        NutrientValues deltaPerServing,
        List<RuleFinding> verifyNotes) {

    public CandidateVerdict {
        reasons = List.copyOf(reasons);
        verifyNotes = List.copyOf(verifyNotes);
    }

    static CandidateVerdict rejected(Proposal proposal, Ingredient ingredient, Swap swap, List<String> reasons) {
        return new CandidateVerdict(proposal, ingredient, swap, false, reasons, null, null, List.of());
    }
}
