package com.swolemates.nutridish.catalog;

import java.util.List;
import java.util.Optional;

public interface RecipeProvider {

    List<Recipe> recipes();

    Optional<Recipe> recipe(String id);
}
