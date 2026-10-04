package com.swolemates.nutridish.recipe;

import com.swolemates.nutridish.catalog.Ingredient;

public record ResolvedLine(Ingredient ingredient, double grams, String amount, boolean optional, Ingredient replaces) {}
