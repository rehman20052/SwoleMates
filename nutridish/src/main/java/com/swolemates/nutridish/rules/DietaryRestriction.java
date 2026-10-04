package com.swolemates.nutridish.rules;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import com.swolemates.nutridish.common.Coded;

public enum DietaryRestriction implements Coded {
    HALAL("halal", "Halal", "Ingredient compatibility only — not halal certification. Verify meat sourcing, processing and preparation."),
    KOSHER("kosher", "Kosher", "Ingredient compatibility only — not kosher certification. Verify certification (hechsher), utensils and preparation."),
    VEGAN("vegan", "Vegan", "No animal-derived ingredients."),
    VEGETARIAN("vegetarian", "Vegetarian", "No meat, poultry or seafood."),
    PESCATARIAN("pescatarian", "Pescatarian", "No meat or poultry; fish and seafood allowed."),
    GLUTEN_FREE("gluten-free", "Gluten-free", "No wheat, barley or rye. Cross-contact is not assessed; celiac users should check labels.");

    private final String id;
    private final String label;
    private final String disclaimer;

    DietaryRestriction(String id, String label, String disclaimer) {
        this.id = id;
        this.label = label;
        this.disclaimer = disclaimer;
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

    public String disclaimer() {
        return disclaimer;
    }

    @JsonCreator
    public static DietaryRestriction from(String value) {
        return Coded.parse(DietaryRestriction.class, value);
    }
}
