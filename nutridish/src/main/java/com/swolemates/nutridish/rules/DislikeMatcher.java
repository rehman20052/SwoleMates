package com.swolemates.nutridish.rules;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import com.swolemates.nutridish.catalog.Ingredient;

@Component
public class DislikeMatcher {

    public static final int MAX_TERMS = 30;
    public static final int MAX_TERM_LENGTH = 40;
    private static final Pattern NON_WORD = Pattern.compile("[^a-z0-9]+");

    public List<String> normalize(Collection<String> raw) {
        if (raw == null) {
            return List.of();
        }
        Set<String> terms = new LinkedHashSet<>();
        for (String value : raw) {
            if (value == null) {
                continue;
            }
            String term = NON_WORD.matcher(value.toLowerCase(Locale.ROOT)).replaceAll(" ").trim();
            if (term.isEmpty()) {
                continue;
            }
            if (term.length() > MAX_TERM_LENGTH) {
                throw new IllegalArgumentException("Disliked ingredient names must be at most " + MAX_TERM_LENGTH + " characters");
            }
            terms.add(term);
        }
        if (terms.size() > MAX_TERMS) {
            throw new IllegalArgumentException("At most " + MAX_TERMS + " disliked ingredients are supported");
        }
        return List.copyOf(terms);
    }

    public boolean matches(Ingredient ingredient, String term) {
        String needle = " " + singularWords(term) + " ";
        if (needle.isBlank()) {
            return false;
        }
        if (ingredient.id().replace('-', ' ').equals(needle.trim())) {
            return true;
        }
        List<String> haystacks = new ArrayList<>();
        haystacks.add(ingredient.name());
        haystacks.addAll(ingredient.aliases());
        haystacks.addAll(ingredient.groups());
        for (String hay : haystacks) {
            if ((" " + singularWords(hay) + " ").contains(needle)) {
                return true;
            }
        }
        return false;
    }

    public List<String> matchingTerms(Ingredient ingredient, List<String> terms) {
        return terms.stream().filter(term -> matches(ingredient, term)).toList();
    }

    private static String singularWords(String text) {
        String[] words = NON_WORD.matcher(text.toLowerCase(Locale.ROOT)).replaceAll(" ").trim().split(" ");
        StringBuilder out = new StringBuilder();
        for (String word : words) {
            if (word.isEmpty()) {
                continue;
            }
            if (!out.isEmpty()) {
                out.append(' ');
            }
            out.append(singular(word));
        }
        return out.toString();
    }

    private static String singular(String word) {
        if (word.length() > 4 && word.endsWith("ies")) {
            return word.substring(0, word.length() - 3) + "y";
        }
        if (word.length() > 4 && (word.endsWith("oes") || word.endsWith("ches") || word.endsWith("shes"))) {
            return word.substring(0, word.length() - 2);
        }
        if (word.length() > 3 && word.endsWith("s") && !word.endsWith("ss")) {
            return word.substring(0, word.length() - 1);
        }
        return word;
    }
}
