package com.swolemates.nutridish.substitution;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.swolemates.nutridish.catalog.Ingredient;
import com.swolemates.nutridish.catalog.LocalCatalog;
import com.swolemates.nutridish.catalog.SwapRule;
import com.swolemates.nutridish.recipe.ResolvedLine;

@Component
public class RuleBasedSubstitutionProvider {

    private static final Set<String> BROAD_GROUPS = Set.of("vegetable", "fruit", "meat", "fat", "sauce", "spice");
    private static final int FALLBACK_LIMIT = 4;

    private final LocalCatalog catalog;

    public RuleBasedSubstitutionProvider(LocalCatalog catalog) {
        this.catalog = catalog;
    }

    public List<Proposal> propose(SubstitutionContext context) {
        ResolvedLine target = context.target();
        List<SwapRule> rules = catalog.swapRules(target.ingredient().id());
        List<Proposal> proposals = new ArrayList<>();
        for (SwapRule rule : rules) {
            if (rule.omits()) {
                proposals.add(new Proposal(null, null, rule.note(), "Leave it out"));
            } else {
                Ingredient to = catalog.require(rule.to());
                double grams = Math.max(1, Math.round(target.grams() * rule.ratio()));
                proposals.add(new Proposal(to.id(), grams, rule.note(), to.name()));
            }
        }
        if (proposals.isEmpty()) {
            for (Ingredient candidate : context.candidatePool()) {
                if (proposals.size() >= FALLBACK_LIMIT) {
                    break;
                }
                String shared = sharedGroup(target.ingredient(), candidate);
                if (shared != null) {
                    proposals.add(new Proposal(candidate.id(), target.grams(),
                            "Another " + shared + "; adjust to taste.", candidate.name()));
                }
            }
        }
        return proposals;
    }

    private static String sharedGroup(Ingredient a, Ingredient b) {
        if (a.id().equals(b.id())) {
            return null;
        }
        for (String group : a.groups()) {
            if (!BROAD_GROUPS.contains(group) && b.groups().contains(group)) {
                return group;
            }
        }
        return null;
    }
}
