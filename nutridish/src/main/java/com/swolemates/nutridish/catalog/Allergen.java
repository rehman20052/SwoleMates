package com.swolemates.nutridish.catalog;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import com.swolemates.nutridish.common.Coded;

public enum Allergen implements Coded {
    MILK("milk", "Milk"),
    EGG("egg", "Egg"),
    FISH("fish", "Fish"),
    SHELLFISH("shellfish", "Shellfish"),
    TREE_NUTS("tree-nuts", "Tree nuts"),
    PEANUTS("peanuts", "Peanuts"),
    WHEAT("wheat", "Wheat"),
    SOY("soy", "Soy"),
    SESAME("sesame", "Sesame");

    private final String id;
    private final String label;

    Allergen(String id, String label) {
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
    public static Allergen from(String value) {
        return Coded.parse(Allergen.class, value);
    }
}
