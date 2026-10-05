package com.swolemates.nutridish.substitution;

public record Proposal(String ingredientId, Double grams, String note, String label) {

    public boolean omits() {
        return ingredientId == null;
    }
}
