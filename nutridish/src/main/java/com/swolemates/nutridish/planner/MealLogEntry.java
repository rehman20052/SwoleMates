package com.swolemates.nutridish.planner;

import java.time.LocalDate;

public record MealLogEntry(
        long id,
        LocalDate date,
        String mealType,
        String recipeId,
        String recipeName,
        double servings,
        String swapsJson,
        Snapshot nutrition,
        String nutritionSource) {

    public record Snapshot(double calories, double protein, double carbs, double fat, double fiber) {

        public static final Snapshot ZERO = new Snapshot(0, 0, 0, 0, 0);

        public Snapshot plus(Snapshot other) {
            return new Snapshot(calories + other.calories, protein + other.protein, carbs + other.carbs,
                    fat + other.fat, fiber + other.fiber);
        }

        public Snapshot rounded() {
            return new Snapshot(Math.round(calories), r(protein), r(carbs), r(fat), r(fiber));
        }

        private static double r(double value) {
            return Math.round(value * 10) / 10.0;
        }
    }
}
