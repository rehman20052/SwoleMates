package com.swolemates.nutridish.catalog;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import com.swolemates.nutridish.common.Coded;

public enum IngredientTrait implements Coded {
    RED_MEAT("red-meat", "Red meat"),
    PORK("pork", "Pork"),
    POULTRY("poultry", "Poultry"),
    FISH("fish", "Fish"),
    SHELLFISH("shellfish", "Shellfish"),
    DAIRY("dairy", "Dairy"),
    EGG("egg", "Egg"),
    HONEY("honey", "Honey"),
    GELATIN("gelatin", "Gelatin"),
    ALCOHOL("alcohol", "Contains alcohol"),
    GRAPE_WINE("grape-wine", "Grape wine"),
    ANIMAL_RENNET("animal-rennet", "Cheese often made with animal rennet"),
    GLUTEN("gluten", "Contains gluten"),
    GLUTEN_CROSS_CONTACT("gluten-cross-contact", "Often cross-contacted with gluten"),
    SMOKED_SEAFOOD("smoked-seafood", "Refrigerated smoked seafood"),
    SOFT_CHEESE("soft-cheese", "Soft or fresh cheese"),
    RAW_SPROUTS("raw-sprouts", "Raw sprouts"),
    RUNNY_EGG_RISK("runny-egg-risk", "Eggs that may be served soft"),
    HIGH_MERCURY_FISH("high-mercury-fish", "High-mercury fish");

    private final String id;
    private final String label;

    IngredientTrait(String id, String label) {
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
    public static IngredientTrait from(String value) {
        return Coded.parse(IngredientTrait.class, value);
    }
}
