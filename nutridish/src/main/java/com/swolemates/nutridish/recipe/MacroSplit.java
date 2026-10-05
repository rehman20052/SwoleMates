package com.swolemates.nutridish.recipe;

import com.swolemates.nutridish.catalog.NutrientValues;

public record MacroSplit(int protein, int carbs, int fat) {

    public static MacroSplit of(NutrientValues values) {
        double p = values.protein() * 4;
        double c = values.carbs() * 4;
        double f = values.fat() * 9;
        double total = p + c + f;
        if (total <= 0) {
            return new MacroSplit(0, 0, 0);
        }
        int protein = (int) Math.round(p * 100 / total);
        int fat = (int) Math.round(f * 100 / total);
        return new MacroSplit(protein, 100 - protein - fat, fat);
    }
}
