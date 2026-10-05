package com.swolemates.nutridish.catalog;

import java.util.Collection;
import java.util.Optional;

public interface IngredientCatalog {

    Collection<Ingredient> ingredients();

    Optional<Ingredient> ingredient(String id);

    default Ingredient require(String id) {
        return ingredient(id).orElseThrow(() -> new IllegalArgumentException("Unknown ingredient '" + id + "'"));
    }
}
