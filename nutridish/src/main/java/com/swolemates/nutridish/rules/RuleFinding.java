package com.swolemates.nutridish.rules;

import java.util.List;

public record RuleFinding(Compatibility level, List<String> ingredientIds, String message) {

    public RuleFinding {
        ingredientIds = List.copyOf(ingredientIds);
    }
}
