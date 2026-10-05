package com.swolemates.nutridish.nutrition;

import org.springframework.stereotype.Component;

import com.swolemates.nutridish.catalog.Ingredient;
import com.swolemates.nutridish.catalog.NutrientValues;

@Component
public class BundledNutritionProvider implements NutritionProvider {

    @Override
    public NutrientValues per100g(Ingredient ingredient) {
        return ingredient.nutrition().per100g();
    }

    @Override
    public String sourceDescription() {
        return "USDA FoodData Central SR Legacy per-100 g values × recipe ingredient weights";
    }
}
