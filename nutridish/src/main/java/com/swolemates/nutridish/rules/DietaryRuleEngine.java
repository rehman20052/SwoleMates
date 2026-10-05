package com.swolemates.nutridish.rules;

import java.util.ArrayList;
import java.util.Collection;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.stereotype.Component;

import com.swolemates.nutridish.catalog.Allergen;
import com.swolemates.nutridish.catalog.Ingredient;
import com.swolemates.nutridish.catalog.IngredientTrait;

import static com.swolemates.nutridish.catalog.IngredientTrait.*;
import static com.swolemates.nutridish.rules.Compatibility.INCOMPATIBLE;
import static com.swolemates.nutridish.rules.Compatibility.VERIFY;

@Component
public class DietaryRuleEngine {

    public Map<DietaryRestriction, RestrictionVerdict> evaluateAll(Collection<Ingredient> ingredients) {
        Map<DietaryRestriction, RestrictionVerdict> verdicts = new EnumMap<>(DietaryRestriction.class);
        for (DietaryRestriction restriction : DietaryRestriction.values()) {
            verdicts.put(restriction, evaluate(restriction, ingredients));
        }
        return verdicts;
    }

    public RestrictionVerdict evaluate(DietaryRestriction restriction, Collection<Ingredient> ingredients) {
        List<RuleFinding> findings = new ArrayList<>();
        Rules rules = new Rules(ingredients, findings);
        switch (restriction) {
            case HALAL -> {
                rules.flag(INCOMPATIBLE, has(PORK), "Contains pork (%s), which is not halal.");
                rules.flag(INCOMPATIBLE, has(ALCOHOL),
                        "Contains alcohol (%s). Alcohol used as an ingredient is generally not considered halal, even when cooked.");
                rules.flag(INCOMPATIBLE, has(GELATIN), "Contains gelatin (%s), which is usually pork-derived unless certified halal.");
                rules.flag(VERIFY, has(RED_MEAT).or(has(POULTRY)),
                        "Choose halal-certified (zabiha) %s.");
                rules.flag(VERIFY, has(ANIMAL_RENNET),
                        "%s is often made with animal rennet. Check the enzyme source or look for a halal-certified cheese.");
                rules.flag(VERIFY, has(SHELLFISH),
                        "Most schools of thought treat shellfish (%s) as halal, but some (including many Hanafi scholars) avoid it.");
            }
            case KOSHER -> {
                rules.flag(INCOMPATIBLE, has(PORK), "Contains pork (%s), which is not kosher.");
                rules.flag(INCOMPATIBLE, has(SHELLFISH), "Contains shellfish (%s), which is not kosher.");
                List<Ingredient> meat = rules.matching(has(RED_MEAT).or(has(POULTRY)));
                List<Ingredient> dairy = rules.matching(has(DAIRY));
                if (!meat.isEmpty() && !dairy.isEmpty()) {
                    findings.add(new RuleFinding(INCOMPATIBLE,
                            Stream.concat(dairy.stream(), meat.stream()).map(Ingredient::id).toList(),
                            "Combines meat or poultry (" + names(meat) + ") with dairy (" + names(dairy)
                                    + "). Kosher practice keeps them separate; swapping the dairy usually keeps the dish closest to the original."));
                }
                rules.flag(INCOMPATIBLE, has(GELATIN), "Contains gelatin (%s); use only kosher-certified gelatin.");
                rules.flag(VERIFY, has(RED_MEAT).or(has(POULTRY)), "Choose kosher-certified %s.");
                List<Ingredient> fish = rules.matching(has(FISH));
                if (!fish.isEmpty() && !meat.isEmpty()) {
                    findings.add(new RuleFinding(VERIFY,
                            Stream.concat(fish.stream(), meat.stream()).map(Ingredient::id).toList(),
                            "Many kosher traditions avoid cooking fish (" + names(fish) + ") together with meat (" + names(meat) + ")."));
                }
                rules.flag(VERIFY, has(ANIMAL_RENNET), "Choose kosher-certified %s (rennet source matters).");
                rules.flag(VERIFY, has(GRAPE_WINE), "Grape wine (%s) must be kosher-certified.");
            }
            case VEGAN -> rules.flag(INCOMPATIBLE,
                    has(RED_MEAT).or(has(PORK)).or(has(POULTRY)).or(has(FISH)).or(has(SHELLFISH))
                            .or(has(DAIRY)).or(has(EGG)).or(has(HONEY)).or(has(GELATIN)),
                    "Contains animal-derived ingredients: %s.");
            case VEGETARIAN -> {
                rules.flag(INCOMPATIBLE,
                        has(RED_MEAT).or(has(PORK)).or(has(POULTRY)).or(has(FISH)).or(has(SHELLFISH)).or(has(GELATIN)),
                        "Contains meat, poultry or seafood: %s.");
                rules.flag(VERIFY, has(ANIMAL_RENNET),
                        "%s is often made with animal rennet. Look for a vegetarian (microbial rennet) label.");
            }
            case PESCATARIAN -> {
                rules.flag(INCOMPATIBLE, has(RED_MEAT).or(has(PORK)).or(has(POULTRY)).or(has(GELATIN)),
                        "Contains meat or poultry: %s.");
                rules.flag(VERIFY, has(ANIMAL_RENNET),
                        "%s is often made with animal rennet. Look for a vegetarian (microbial rennet) label.");
            }
            case GLUTEN_FREE -> {
                rules.flag(INCOMPATIBLE, has(GLUTEN), "Contains gluten: %s.");
                rules.flag(VERIFY, has(GLUTEN_CROSS_CONTACT),
                        "%s is often cross-contacted with or made from gluten grains. Choose a product labeled gluten-free.");
            }
        }
        return RestrictionVerdict.of(restriction, findings);
    }

    public Set<Allergen> allergens(Collection<Ingredient> ingredients) {
        Set<Allergen> found = EnumSet.noneOf(Allergen.class);
        ingredients.forEach(i -> found.addAll(i.allergens()));
        return found;
    }

    public List<SafetyCaution> cautions(LifeStage stage, Collection<Ingredient> ingredients) {
        Set<IngredientTrait> watch = switch (stage) {
            case PREGNANCY -> EnumSet.of(SMOKED_SEAFOOD, SOFT_CHEESE, RAW_SPROUTS, RUNNY_EGG_RISK, ALCOHOL, HIGH_MERCURY_FISH);
            case BREASTFEEDING -> EnumSet.of(ALCOHOL, HIGH_MERCURY_FISH);
            case OLDER_ADULT, WEAKENED_IMMUNITY -> EnumSet.of(SMOKED_SEAFOOD, SOFT_CHEESE, RAW_SPROUTS, RUNNY_EGG_RISK);
            case NONE, POST_SURGERY, BURN_RECOVERY -> EnumSet.noneOf(IngredientTrait.class);
        };
        List<SafetyCaution> cautions = new ArrayList<>();
        for (Ingredient ingredient : ingredients) {
            for (IngredientTrait trait : watch) {
                if (ingredient.has(trait)) {
                    cautions.add(new SafetyCaution(ingredient.id(), cautionText(stage, trait, ingredient)));
                }
            }
        }
        return cautions;
    }

    private static String cautionText(LifeStage stage, IngredientTrait trait, Ingredient ingredient) {
        String name = ingredient.name();
        return switch (trait) {
            case SMOKED_SEAFOOD -> name + ": refrigerated smoked fish can carry Listeria. Eat it only in a dish cooked to 74 °C (165 °F), or swap in fully cooked fish.";
            case SOFT_CHEESE -> name + ": choose cheese made from pasteurized milk (check the label). Unpasteurized soft and fresh cheeses can carry Listeria.";
            case RAW_SPROUTS -> name + ": raw or lightly cooked sprouts can carry E. coli or Salmonella. Cook them until steaming hot or leave them out.";
            case RUNNY_EGG_RISK -> name + ": cook until both the yolk and white are firm.";
            case ALCOHOL -> stage == LifeStage.PREGNANCY
                    ? name + ": no amount of alcohol is known to be safe during pregnancy, and cooking does not remove all of it."
                    : name + ": some cooking alcohol remains after cooking. Not drinking alcohol is the safest option while breastfeeding.";
            case HIGH_MERCURY_FISH -> name + ": on the FDA list of fish to avoid during pregnancy and breastfeeding because of mercury.";
            default -> name + ": check food-safety guidance for your situation.";
        };
    }

    private static Predicate<Ingredient> has(IngredientTrait trait) {
        return ingredient -> ingredient.has(trait);
    }

    private static String names(List<Ingredient> ingredients) {
        return ingredients.stream().map(Ingredient::name).collect(Collectors.joining(", "));
    }

    private record Rules(Collection<Ingredient> ingredients, List<RuleFinding> findings) {

        List<Ingredient> matching(Predicate<Ingredient> predicate) {
            return ingredients.stream().filter(predicate).toList();
        }

        void flag(Compatibility level, Predicate<Ingredient> predicate, String template) {
            List<Ingredient> hits = matching(predicate);
            if (!hits.isEmpty()) {
                String text = String.format(template, names(hits));
                findings.add(new RuleFinding(level, hits.stream().map(Ingredient::id).toList(),
                        Character.toUpperCase(text.charAt(0)) + text.substring(1)));
            }
        }
    }
}
