package com.swolemates.nutridish.recipe;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import com.swolemates.nutridish.catalog.Allergen;
import com.swolemates.nutridish.catalog.Ingredient;
import com.swolemates.nutridish.catalog.IngredientCatalog;
import com.swolemates.nutridish.catalog.NutrientValues;
import com.swolemates.nutridish.catalog.Recipe;
import com.swolemates.nutridish.nutrition.NutritionProvider;
import com.swolemates.nutridish.profile.DietProfile;
import com.swolemates.nutridish.rules.Compatibility;
import com.swolemates.nutridish.rules.DietaryRestriction;
import com.swolemates.nutridish.rules.DietaryRuleEngine;
import com.swolemates.nutridish.rules.DislikeMatcher;
import com.swolemates.nutridish.rules.RestrictionVerdict;
import com.swolemates.nutridish.rules.RuleFinding;
import com.swolemates.nutridish.rules.SafetyCaution;

@Service
public class RecipeEvaluator {

    public static final int MAX_SWAPS = 20;

    private final IngredientCatalog catalog;
    private final NutritionProvider nutrition;
    private final DietaryRuleEngine rules;
    private final DislikeMatcher dislikes;

    public RecipeEvaluator(IngredientCatalog catalog, NutritionProvider nutrition, DietaryRuleEngine rules, DislikeMatcher dislikes) {
        this.catalog = catalog;
        this.nutrition = nutrition;
        this.rules = rules;
        this.dislikes = dislikes;
    }

    public RecipeEvaluation evaluate(Recipe recipe) {
        return evaluate(recipe, List.of());
    }

    public RecipeEvaluation evaluate(Recipe recipe, List<Swap> swaps) {
        List<Swap> applied = swaps == null ? List.of() : List.copyOf(swaps);
        if (applied.size() > MAX_SWAPS) {
            throw new IllegalArgumentException("At most " + MAX_SWAPS + " swaps can be applied to a recipe");
        }
        List<ResolvedLine> lines = new ArrayList<>();
        for (Recipe.Line line : recipe.ingredients()) {
            lines.add(new ResolvedLine(catalog.require(line.ingredientId()), line.grams(), line.amount(), line.optional(), null));
        }
        for (Swap swap : applied) {
            apply(lines, swap);
        }
        NutrientValues total = NutrientValues.ZERO;
        for (ResolvedLine line : lines) {
            total = total.plus(contribution(line));
        }
        List<Ingredient> ingredients = lines.stream().map(ResolvedLine::ingredient).toList();
        return new RecipeEvaluation(
                recipe,
                applied,
                List.copyOf(lines),
                total.times(1.0 / recipe.servings()),
                rules.evaluateAll(ingredients),
                rules.allergens(ingredients));
    }

    public NutrientValues contribution(ResolvedLine line) {
        return nutrition.per100g(line.ingredient()).times(line.grams() / 100.0);
    }

    public ProfileFit assess(RecipeEvaluation evaluation, DietProfile profile) {
        List<ProfileFit.Conflict> conflicts = new ArrayList<>();
        List<RuleFinding> verifyNotes = new ArrayList<>();
        boolean meets = true;

        for (DietaryRestriction restriction : DietaryRestriction.values()) {
            if (!profile.restrictions().contains(restriction)) {
                continue;
            }
            RestrictionVerdict verdict = evaluation.restrictions().get(restriction);
            for (RuleFinding finding : verdict.findings()) {
                if (finding.level() == Compatibility.INCOMPATIBLE) {
                    meets = false;
                    conflicts.add(new ProfileFit.Conflict(ProfileFit.Kind.RESTRICTION, true, finding.ingredientIds(),
                            restriction.label() + ": " + finding.message()));
                } else if (finding.level() == Compatibility.VERIFY) {
                    verifyNotes.add(finding);
                }
            }
        }
        for (Allergen allergen : Allergen.values()) {
            if (!profile.allergens().contains(allergen) || !evaluation.allergens().contains(allergen)) {
                continue;
            }
            meets = false;
            List<Ingredient> sources = evaluation.ingredients().stream()
                    .filter(i -> i.allergens().contains(allergen)).toList();
            conflicts.add(new ProfileFit.Conflict(ProfileFit.Kind.ALLERGEN, true,
                    sources.stream().map(Ingredient::id).toList(),
                    "Contains " + allergen.label().toLowerCase() + " (" + names(sources) + ")."));
        }
        List<String> disliked = new ArrayList<>();
        for (Ingredient ingredient : evaluation.ingredients()) {
            List<String> terms = dislikes.matchingTerms(ingredient, profile.dislikes());
            if (!terms.isEmpty()) {
                disliked.add(ingredient.id());
                conflicts.add(new ProfileFit.Conflict(ProfileFit.Kind.DISLIKE, false, List.of(ingredient.id()),
                        ingredient.name() + " matches your dislike \"" + String.join("\", \"", terms) + "\"."));
            }
        }
        List<SafetyCaution> cautions = rules.cautions(profile.lifeStage(), evaluation.ingredients());
        for (SafetyCaution caution : cautions) {
            conflicts.add(new ProfileFit.Conflict(ProfileFit.Kind.CAUTION, false, List.of(caution.ingredientId()), caution.message()));
        }
        return new ProfileFit(meets, conflicts, verifyNotes, cautions, disliked,
                limitNotes(evaluation, profile.limits()), profile.lifeStage().guidance());
    }

    private static List<String> limitNotes(RecipeEvaluation evaluation, DietProfile.NutritionLimits limits) {
        NutrientValues n = evaluation.perServing().rounded();
        List<String> notes = new ArrayList<>();
        if (limits.maxCalories() != null && n.calories() > limits.maxCalories()) {
            notes.add(String.format("%.0f kcal per serving is above your %d kcal limit.", n.calories(), limits.maxCalories()));
        }
        if (limits.minProtein() != null && n.protein() < limits.minProtein()) {
            notes.add(String.format("%.1f g protein per serving is below your %d g minimum.", n.protein(), limits.minProtein()));
        }
        if (limits.maxCarbs() != null && n.carbs() > limits.maxCarbs()) {
            notes.add(String.format("%.1f g carbs per serving is above your %d g limit.", n.carbs(), limits.maxCarbs()));
        }
        if (limits.maxFat() != null && n.fat() > limits.maxFat()) {
            notes.add(String.format("%.1f g fat per serving is above your %d g limit.", n.fat(), limits.maxFat()));
        }
        if (limits.minFiber() != null && n.fiber() < limits.minFiber()) {
            notes.add(String.format("%.1f g fiber per serving is below your %d g minimum.", n.fiber(), limits.minFiber()));
        }
        if (limits.maxMinutes() != null && evaluation.recipe().minutes() > limits.maxMinutes()) {
            notes.add(evaluation.recipe().minutes() + " minutes is longer than your " + limits.maxMinutes() + " minute limit.");
        }
        return notes;
    }

    private void apply(List<ResolvedLine> lines, Swap swap) {
        int index = -1;
        for (int i = 0; i < lines.size(); i++) {
            if (lines.get(i).ingredient().id().equals(swap.from())) {
                index = i;
                break;
            }
        }
        if (index < 0) {
            throw new IllegalArgumentException("Cannot swap '" + swap.from() + "': it is not in this recipe");
        }
        ResolvedLine current = lines.get(index);
        Ingredient original = current.replaces() != null ? current.replaces() : current.ingredient();
        if (swap.omits()) {
            lines.remove(index);
            return;
        }
        Ingredient replacement = catalog.require(swap.to());
        if (replacement.id().equals(current.ingredient().id())) {
            throw new IllegalArgumentException("Cannot swap '" + swap.from() + "' for itself");
        }
        double grams = swap.grams() != null ? swap.grams() : current.grams();
        for (int i = 0; i < lines.size(); i++) {
            ResolvedLine other = lines.get(i);
            if (i != index && other.ingredient().id().equals(replacement.id())) {
                lines.set(i, new ResolvedLine(other.ingredient(), other.grams() + grams, null, other.optional(), original));
                lines.remove(index);
                return;
            }
        }
        lines.set(index, new ResolvedLine(replacement, grams, null, current.optional(), original));
    }

    private static String names(List<Ingredient> ingredients) {
        return String.join(", ", ingredients.stream().map(Ingredient::name).toList());
    }
}
