package com.swolemates.nutridish.substitution;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.swolemates.nutridish.catalog.Recipe;
import com.swolemates.nutridish.profile.DietProfile;
import com.swolemates.nutridish.recipe.ProfileFit;
import com.swolemates.nutridish.recipe.RecipeEvaluation;
import com.swolemates.nutridish.recipe.RecipeEvaluator;
import com.swolemates.nutridish.recipe.ResolvedLine;
import com.swolemates.nutridish.recipe.Swap;

@Service
public class SubstitutionService {

    private static final Logger log = LoggerFactory.getLogger(SubstitutionService.class);
    private static final int MAX_ADAPT_ROUNDS = 12;

    private final RecipeEvaluator evaluator;
    private final SubstitutionValidator validator;
    private final RuleBasedSubstitutionProvider rules;
    private final SubstitutionAuditRepository audit;

    public SubstitutionService(RecipeEvaluator evaluator, SubstitutionValidator validator, RuleBasedSubstitutionProvider rules,
            SubstitutionAuditRepository audit) {
        this.evaluator = evaluator;
        this.validator = validator;
        this.rules = rules;
        this.audit = audit;
    }

    public SubstitutionOutcome suggest(
            UUID userId,
            Recipe recipe,
            List<Swap> swaps,
            String ingredientId,
            DietProfile profile,
            SubstitutionReason reason) {
        RecipeEvaluation current = evaluator.evaluate(recipe, swaps);
        ResolvedLine target = SubstitutionValidator.line(current, ingredientId);
        SubstitutionContext context = new SubstitutionContext(current, target, profile, reason,
                validator.candidatePool(profile, target.ingredient()));

        List<CandidateVerdict> verdicts = validateAll(context, rules.propose(context));

        SubstitutionOutcome outcome = new SubstitutionOutcome(current, target, reason,
                verdicts.stream().filter(CandidateVerdict::accepted).toList(),
                verdicts.stream().filter(v -> !v.accepted()).toList());
        try {
            audit.record(userId, outcome);
        } catch (RuntimeException e) {
            log.warn("Could not write substitution audit record", e);
        }
        return outcome;
    }

    public AdaptOutcome adapt(Recipe recipe, List<Swap> initialSwaps, DietProfile profile) {
        List<Swap> swaps = new ArrayList<>(initialSwaps == null ? List.of() : initialSwaps);
        List<CandidateVerdict> applied = new ArrayList<>();
        Set<String> unresolvable = new HashSet<>();
        for (int round = 0; round < MAX_ADAPT_ROUNDS && swaps.size() < RecipeEvaluator.MAX_SWAPS; round++) {
            RecipeEvaluation current = evaluator.evaluate(recipe, swaps);
            ProfileFit fit = evaluator.assess(current, profile);
            Optional<String> next = fit.conflicts().stream()
                    .flatMap(conflict -> conflict.ingredientIds().stream())
                    .filter(current::contains)
                    .filter(id -> !unresolvable.contains(id))
                    .findFirst();
            if (next.isEmpty()) {
                break;
            }
            ResolvedLine target = SubstitutionValidator.line(current, next.get());
            SubstitutionContext context = new SubstitutionContext(current, target, profile, SubstitutionReason.DIET,
                    validator.candidatePool(profile, target.ingredient()));
            Optional<CandidateVerdict> choice = rules.propose(context).stream()
                    .map(proposal -> validator.validate(context, proposal))
                    .filter(CandidateVerdict::accepted)
                    .findFirst();
            if (choice.isPresent()) {
                swaps.add(choice.get().swap());
                applied.add(choice.get());
            } else {
                unresolvable.add(next.get());
            }
        }
        RecipeEvaluation adapted = evaluator.evaluate(recipe, swaps);
        return new AdaptOutcome(adapted, evaluator.assess(adapted, profile), applied);
    }

    private List<CandidateVerdict> validateAll(SubstitutionContext context, List<Proposal> proposals) {
        List<CandidateVerdict> verdicts = new ArrayList<>();
        for (Proposal proposal : proposals) {
            verdicts.add(validator.validate(context, proposal));
        }
        return verdicts;
    }
}
