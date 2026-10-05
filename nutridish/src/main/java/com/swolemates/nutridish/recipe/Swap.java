package com.swolemates.nutridish.recipe;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record Swap(
        @NotBlank @Size(max = 80) String from,
        @Size(max = 80) String to,
        @DecimalMin("0.1") @DecimalMax("5000") Double grams) {

    public boolean omits() {
        return to == null || to.isBlank();
    }
}
