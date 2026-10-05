package com.swolemates.nutridish.api;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.swolemates.nutridish.catalog.Allergen;
import com.swolemates.nutridish.catalog.Ingredient;
import com.swolemates.nutridish.catalog.IngredientCatalog;
import com.swolemates.nutridish.catalog.IngredientTrait;
import com.swolemates.nutridish.catalog.Recipe;
import com.swolemates.nutridish.common.Coded;
import com.swolemates.nutridish.nutrition.NutritionProvider;
import com.swolemates.nutridish.recipe.ProfileFit;
import com.swolemates.nutridish.recipe.RecipeEvaluation;
import com.swolemates.nutridish.recipe.RecipeEvaluator;
import com.swolemates.nutridish.recipe.ResolvedLine;
import com.swolemates.nutridish.rules.Compatibility;
import com.swolemates.nutridish.rules.DietaryRestriction;
import com.swolemates.nutridish.rules.RestrictionVerdict;
import com.swolemates.nutridish.substitution.CandidateVerdict;

@Component
public class RecipeViews {

    private final RecipeEvaluator evaluator;
    private final NutritionProvider nutrition;
    private final IngredientCatalog catalog;

    public RecipeViews(RecipeEvaluator evaluator, NutritionProvider nutrition, IngredientCatalog catalog) {
        this.evaluator = evaluator;
        this.nutrition = nutrition;
        this.catalog = catalog;
    }

    public Views.RecipeSummary summary(RecipeEvaluation evaluation, ProfileFit fit) {
        Recipe recipe = evaluation.recipe();
        List<String> compatible = new ArrayList<>();
        List<String> verify = new ArrayList<>();
        for (DietaryRestriction restriction : DietaryRestriction.values()) {
            Compatibility status = evaluation.restrictions().get(restriction).status();
            if (status != Compatibility.INCOMPATIBLE) {
                compatible.add(restriction.id());
            }
            if (status == Compatibility.VERIFY) {
                verify.add(restriction.id());
            }
        }
        Views.FitSummary fitSummary = null;
        if (fit != null) {
            List<Views.IngredientRef> disliked = evaluation.ingredients().stream()
                    .filter(i -> fit.dislikedIngredientIds().contains(i.id()))
                    .map(RecipeViews::ref)
                    .toList();
            fitSummary = new Views.FitSummary(fit.meetsRequirements(), disliked, fit.cautions().size(), fit.verifyNotes().size());
        }
        return new Views.RecipeSummary(
                recipe.id(),
                recipe.name(),
                recipe.cuisine(),
                recipe.region(),
                recipe.blueZone(),
                recipe.description(),
                recipe.minutes(),
                recipe.servings(),
                recipe.mealTypes(),
                evaluation.perServing().rounded(),
                evaluation.macroSplit(),
                evaluation.goalTags(),
                compatible,
                verify,
                evaluation.allergens().stream().map(Allergen::id).toList(),
                evaluation.swaps().stream()
                        .map(s -> new Views.Adaptation(ref(catalog.require(s.from())),
                                s.omits() ? null : ref(catalog.require(s.to())), s.grams()))
                        .toList(),
                fitSummary);
    }

    public Views.RecipeDetail detail(RecipeEvaluation evaluation, ProfileFit fit) {
        Recipe recipe = evaluation.recipe();
        Map<String, Set<String>> flags = new HashMap<>();
        if (fit != null) {
            for (ProfileFit.Conflict conflict : fit.conflicts()) {
                for (String id : conflict.ingredientIds()) {
                    flags.computeIfAbsent(id, k -> new LinkedHashSet<>()).add(conflict.kind().id());
                }
            }
        }
        List<Views.LineView> lines = new ArrayList<>();
        for (ResolvedLine line : evaluation.lines()) {
            Ingredient ingredient = line.ingredient();
            lines.add(new Views.LineView(
                    ingredient.id(),
                    ingredient.name(),
                    Math.round(line.grams() * 10) / 10.0,
                    line.amount(),
                    line.optional(),
                    line.replaces() == null ? null : ref(line.replaces()),
                    ingredient.allergens().stream().map(Allergen::id).sorted().toList(),
                    ingredient.traits().stream().map(IngredientTrait::id).sorted().toList(),
                    evaluator.contribution(line).times(1.0 / recipe.servings()).rounded(),
                    List.copyOf(flags.getOrDefault(ingredient.id(), Set.of())),
                    ingredient.note(),
                    ingredient.nutrition().fdcId(),
                    ingredient.nutrition().proxy()));
        }
        List<Views.RestrictionView> restrictions = new ArrayList<>();
        for (DietaryRestriction restriction : DietaryRestriction.values()) {
            RestrictionVerdict verdict = evaluation.restrictions().get(restriction);
            restrictions.add(new Views.RestrictionView(restriction.id(), restriction.label(), verdict.status(),
                    verdict.findings(), restriction.disclaimer()));
        }
        return new Views.RecipeDetail(summary(evaluation, fit), lines, recipe.steps(), restrictions,
                evaluation.swaps(), nutrition.sourceDescription(), fit);
    }

    public Views.CandidateView candidate(CandidateVerdict verdict) {
        return new Views.CandidateView(
                verdict.ingredient() == null ? null : ref(verdict.ingredient()),
                verdict.proposal().label(),
                verdict.swap() == null ? verdict.proposal().grams() : verdict.swap().grams(),
                verdict.swap(),
                verdict.proposal().note(),
                verdict.adapted() == null || !verdict.accepted() ? null : verdict.adapted().perServing().rounded(),
                verdict.deltaPerServing() == null ? null : verdict.deltaPerServing().rounded(),
                verdict.verifyNotes(),
                verdict.reasons());
    }

    public static Views.IngredientRef ref(Ingredient ingredient) {
        return new Views.IngredientRef(ingredient.id(), ingredient.name());
    }

    public static <E extends Enum<E> & Coded> Views.Option option(E value, String description) {
        return new Views.Option(value.id(), value.label(), description);
    }
}
