package com.swolemates.nutridish.catalog;

public record NutrientValues(
        double calories,
        double protein,
        double carbs,
        double fat,
        double fiber,
        double sugars,
        double sodium,
        double saturatedFat) {

    public static final NutrientValues ZERO = new NutrientValues(0, 0, 0, 0, 0, 0, 0, 0);

    public NutrientValues plus(NutrientValues other) {
        return new NutrientValues(
                calories + other.calories,
                protein + other.protein,
                carbs + other.carbs,
                fat + other.fat,
                fiber + other.fiber,
                sugars + other.sugars,
                sodium + other.sodium,
                saturatedFat + other.saturatedFat);
    }

    public NutrientValues minus(NutrientValues other) {
        return plus(other.times(-1));
    }

    public NutrientValues times(double factor) {
        return new NutrientValues(
                calories * factor,
                protein * factor,
                carbs * factor,
                fat * factor,
                fiber * factor,
                sugars * factor,
                sodium * factor,
                saturatedFat * factor);
    }

    public NutrientValues rounded() {
        return new NutrientValues(
                Math.round(calories),
                oneDecimal(protein),
                oneDecimal(carbs),
                oneDecimal(fat),
                oneDecimal(fiber),
                oneDecimal(sugars),
                Math.round(sodium),
                oneDecimal(saturatedFat));
    }

    private static double oneDecimal(double value) {
        return Math.round(value * 10) / 10.0;
    }
}
