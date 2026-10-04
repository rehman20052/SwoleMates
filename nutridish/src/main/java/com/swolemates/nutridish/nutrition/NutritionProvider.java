package com.swolemates.nutridish.nutrition;

import com.swolemates.nutridish.catalog.Ingredient;
import com.swolemates.nutridish.catalog.NutrientValues;

public interface NutritionProvider {

    NutrientValues per100g(Ingredient ingredient);

    String sourceDescription();
}
