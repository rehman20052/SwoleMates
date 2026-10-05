package com.swolemates.nutridish.substitution;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Component;

import com.swolemates.nutridish.catalog.Allergen;
import com.swolemates.nutridish.catalog.Ingredient;
import com.swolemates.nutridish.catalog.IngredientCatalog;
import com.swolemates.nutridish.profile.DietProfile;
import com.swolemates.nutridish.recipe.RecipeEvaluation;
import com.swolemates.nutridish.recipe.RecipeEvaluator;
import com.swolemates.nutridish.recipe.ResolvedLine;
import com.swolemates.nutridish.recipe.Swap;
import com.swolemates.nutridish.rules.Compatibility;
import com.swolemates.nutridish.rules.DietaryRestriction;
import com.swolemates.nutridish.rules.DietaryRuleEngine;
import com.swolemates.nutridish.rules.DislikeMatcher;
import com.swolemates.nutridish.rules.RestrictionVerdict;
import com.swolemates.nutridish.rules.RuleFinding;
import com.swolemates.nutridish.rules.SafetyCaution;

@Component
public class SubstitutionValidator {

    private final IngredientCatalog catalog;
    private final RecipeEvaluator evaluator;
    private final DietaryRuleEngine rules;
    private final DislikeMatcher dislikes;

    public SubstitutionValidator(IngredientCatalog catalog, RecipeEvaluator evaluator, DietaryRuleEngine rules, DislikeMatcher dislikes) {
        this.catalog = catalog;
        this.evaluator = evaluator;
        this.rules = rules;
        this.dislikes = dislikes;
    }

    public CandidateVerdict validate(SubstitutionContext context, Proposal proposal) {
        ResolvedLine target = context.target();
        String targetId = target.ingredient().id();
        DietProfile profile = context.profile();

        if (proposal.omits()) {
            return evaluate(context, proposal, null, new Swap(targetId, null, null));
        }

        Optional<Ingredient> found = catalog.ingredient(proposal.ingredientId());
        if (found.isEmpty()) {
            return CandidateVerdict.rejected(proposal, null, null,
                    List.of("\"" + displayName(proposal) + "\" is not in the verified ingredient database, so its dietary facts and nutrition cannot be checked."));
        }
        Ingredient candidate = found.get();
        if (candidate.id().equals(targetId)) {
            return CandidateVerdict.rejected(proposal, candidate, null, List.of("Suggested the same ingredient."));
        }
        double grams = proposal.grams() == null ? target.grams() : proposal.grams();
        double max = maxGrams(target.grams());
        if (!(grams > 0) || grams > max) {
            return CandidateVerdict.rejected(proposal, candidate, null, List.of(String.format(
                    "Amount %.0f g is outside the sensible range (1–%.0f g) for replacing %.0f g of %s.",
                    grams, max, target.grams(), target.ingredient().name())));
        }
        Swap swap = new Swap(targetId, candidate.id(), (double) Math.round(grams));
        List<String> reasons = new ArrayList<>();
        for (Allergen allergen : candidate.allergens()) {
            if (profile.allergens().contains(allergen)) {
                reasons.add("Contains " + allergen.label().toLowerCase() + ", which you avoid.");
            }
        }
        List<String> disliked = dislikes.matchingTerms(candidate, profile.dislikes());
        if (!disliked.isEmpty()) {
            reasons.add("Matches your dislike \"" + String.join("\", \"", disliked) + "\".");
        }
        if (!reasons.isEmpty()) {
            return CandidateVerdict.rejected(proposal, candidate, swap, reasons);
        }
        return evaluate(context, proposal, candidate, swap);
    }

    public static double maxGrams(double originalGrams) {
        return Math.max(originalGrams * 3, originalGrams + 100);
    }

    public List<Ingredient> candidatePool(DietProfile profile, Ingredient exclude) {
        List<Ingredient> pool = new ArrayList<>();
        for (Ingredient ingredient : catalog.ingredients()) {
            if (ingredient.id().equals(exclude.id())) {
                continue;
            }
            List<Ingredient> alone = List.of(ingredient);
            boolean ok = profile.restrictions().stream()
                    .allMatch(r -> rules.evaluate(r, alone).status() != Compatibility.INCOMPATIBLE);
            ok &= ingredient.allergens().stream().noneMatch(profile.allergens()::contains);
            ok &= dislikes.matchingTerms(ingredient, profile.dislikes()).isEmpty();
            ok &= rules.cautions(profile.lifeStage(), alone).isEmpty();
            if (ok) {
                pool.add(ingredient);
            }
        }
        return pool;
    }

    private CandidateVerdict evaluate(SubstitutionContext context, Proposal proposal, Ingredient candidate, Swap swap) {
        RecipeEvaluation current = context.current();
        List<Swap> swaps = new ArrayList<>(current.swaps());
        swaps.add(swap);
        RecipeEvaluation adapted = evaluator.evaluate(current.recipe(), swaps);
        DietProfile profile = context.profile();
        List<String> reasons = new ArrayList<>();
        List<RuleFinding> verifyNotes = new ArrayList<>();

        if (candidate != null) {
            for (DietaryRestriction restriction : profile.restrictions()) {
                RestrictionVerdict verdict = adapted.restrictions().get(restriction);
                for (RuleFinding finding : verdict.findings()) {
                    if (!finding.ingredientIds().contains(candidate.id())) {
                        continue;
                    }
                    if (finding.level() == Compatibility.INCOMPATIBLE) {
                        reasons.add(restriction.label() + ": " + finding.message());
                    } else if (finding.level() == Compatibility.VERIFY) {
                        verifyNotes.add(finding);
                    }
                }
            }
            for (SafetyCaution caution : rules.cautions(profile.lifeStage(), List.of(candidate))) {
                reasons.add("Food-safety concern for " + profile.lifeStage().label().toLowerCase() + ": " + caution.message());
            }
        }
        if (!reasons.isEmpty()) {
            return new CandidateVerdict(proposal, candidate, swap, false, reasons, adapted, null, List.of());
        }
        return new CandidateVerdict(proposal, candidate, swap, true, List.of(), adapted,
                adapted.perServing().minus(current.perServing()), verifyNotes);
    }

    private static String displayName(Proposal proposal) {
        if (proposal.label() != null && !proposal.label().isBlank()) {
            return proposal.label();
        }
        return proposal.ingredientId();
    }

    static ResolvedLine line(RecipeEvaluation evaluation, String ingredientId) {
        return evaluation.lines().stream()
                .filter(l -> l.ingredient().id().equals(ingredientId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("'" + ingredientId + "' is not in this recipe"));
    }
}
