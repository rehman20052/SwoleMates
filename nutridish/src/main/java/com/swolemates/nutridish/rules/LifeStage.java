package com.swolemates.nutridish.rules;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import com.swolemates.nutridish.common.Coded;

public enum LifeStage implements Coded {
    NONE("none", "None", null),
    PREGNANCY("pregnancy", "Pregnancy",
            "NutriDish flags common food-safety concerns from FDA/CDC guidance for pregnancy. It does not set calorie or nutrient targets. Your prenatal care provider can."),
    BREASTFEEDING("breastfeeding", "Breastfeeding / postpartum",
            "NutriDish flags alcohol and high-mercury fish. Energy and nutrient needs after birth vary; ask your care provider or a registered dietitian."),
    OLDER_ADULT("older-adult", "Older adult (65+)",
            "NutriDish flags foods that FDA food-safety guidance for older adults says to avoid or cook thoroughly. Protein and vitamin needs can change with age; a dietitian can personalise targets."),
    WEAKENED_IMMUNITY("weakened-immunity", "Illness recovery / weakened immunity",
            "NutriDish flags foods that FDA guidance for people with weakened immune systems says to avoid or cook thoroughly. Follow your care team's diet instructions first."),
    POST_SURGERY("post-surgery", "Recovering from surgery",
            "Recovery can change protein, energy and fluid needs, and some procedures require texture or other diet changes. Use the plan and targets your care team gives you; NutriDish does not generate clinical plans."),
    BURN_RECOVERY("burn-recovery", "Burn recovery",
            "Burn recovery often needs substantially more energy and protein under clinical supervision. Use targets from your burn care team; NutriDish does not generate clinical plans.");

    private final String id;
    private final String label;
    private final String guidance;

    LifeStage(String id, String label, String guidance) {
        this.id = id;
        this.label = label;
        this.guidance = guidance;
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

    public String guidance() {
        return guidance;
    }

    @JsonCreator
    public static LifeStage from(String value) {
        return Coded.parse(LifeStage.class, value);
    }
}
