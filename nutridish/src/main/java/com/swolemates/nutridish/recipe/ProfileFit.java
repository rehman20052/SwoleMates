package com.swolemates.nutridish.recipe;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonValue;
import com.swolemates.nutridish.rules.RuleFinding;
import com.swolemates.nutridish.rules.SafetyCaution;

public record ProfileFit(
        boolean meetsRequirements,
        List<Conflict> conflicts,
        List<RuleFinding> verifyNotes,
        List<SafetyCaution> cautions,
        List<String> dislikedIngredientIds,
        List<String> limitNotes,
        String lifeStageGuidance) {

    public enum Kind {
        RESTRICTION, ALLERGEN, DISLIKE, CAUTION;

        @JsonValue
        public String id() {
            return name().toLowerCase();
        }
    }

    public record Conflict(Kind kind, boolean blocking, List<String> ingredientIds, String message) {

        public Conflict {
            ingredientIds = List.copyOf(ingredientIds);
        }
    }
}
