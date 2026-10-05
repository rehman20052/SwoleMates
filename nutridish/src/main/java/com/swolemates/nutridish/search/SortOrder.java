package com.swolemates.nutridish.search;

import com.fasterxml.jackson.annotation.JsonValue;
import com.swolemates.nutridish.common.Coded;

public enum SortOrder implements Coded {
    BEST_MATCH("best-match", "Best match for you"),
    PROTEIN("protein", "Most protein"),
    PROTEIN_DENSITY("protein-density", "Most protein per calorie"),
    CALORIES("calories", "Fewest calories"),
    QUICKEST("quickest", "Quickest"),
    FIBER("fiber", "Most fiber");

    private final String id;
    private final String label;

    SortOrder(String id, String label) {
        this.id = id;
        this.label = label;
    }

    @Override
    @JsonValue
    public String id() {
        return id;
    }

    @Override
    public String label() {
        return label;
    }
}
