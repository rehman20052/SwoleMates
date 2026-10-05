package com.swolemates.nutridish.recipe;

import com.fasterxml.jackson.annotation.JsonValue;
import com.swolemates.nutridish.catalog.NutrientValues;
import com.swolemates.nutridish.common.Coded;

public enum GoalTag implements Coded {
    HIGH_PROTEIN("high-protein", "High protein", "At least 30 g protein per serving"),
    LOWER_CALORIE("lower-calorie", "Lower calorie", "450 kcal or less per serving"),
    LOWER_CARB("lower-carb", "Lower carb", "30 g carbohydrate or less per serving"),
    HIGH_FIBER("high-fiber", "High fiber", "At least 8 g fiber per serving");

    private final String id;
    private final String label;
    private final String rule;

    GoalTag(String id, String label, String rule) {
        this.id = id;
        this.label = label;
        this.rule = rule;
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

    public String rule() {
        return rule;
    }

    public boolean appliesTo(NutrientValues perServing) {
        return switch (this) {
            case HIGH_PROTEIN -> perServing.protein() >= 30;
            case LOWER_CALORIE -> perServing.calories() <= 450;
            case LOWER_CARB -> perServing.carbs() <= 30;
            case HIGH_FIBER -> perServing.fiber() >= 8;
        };
    }
}
