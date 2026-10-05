package com.swolemates.nutridish.substitution;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import com.swolemates.nutridish.common.Coded;

public enum SubstitutionReason implements Coded {
    DISLIKE("dislike", "I don't like it"),
    ALLERGY("allergy", "Allergy or intolerance"),
    DIET("diet", "Doesn't fit my diet"),
    SAFETY("safety", "Food-safety concern for my situation"),
    UNAVAILABLE("unavailable", "I don't have it"),
    HEALTHIER("healthier", "Lighter or more protein"),
    OTHER("other", "Something else");

    private final String id;
    private final String label;

    SubstitutionReason(String id, String label) {
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

    @JsonCreator
    public static SubstitutionReason from(String value) {
        return Coded.parse(SubstitutionReason.class, value);
    }
}
