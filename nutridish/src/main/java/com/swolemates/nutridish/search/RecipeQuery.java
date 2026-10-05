package com.swolemates.nutridish.search;

import java.util.Set;

import com.swolemates.nutridish.profile.DietProfile;

public record RecipeQuery(
        String text,
        Set<String> regions,
        Set<String> cuisines,
        Set<String> mealTypes,
        DietProfile profile,
        SortOrder sort,
        boolean includeAdaptable,
        boolean blueZonesOnly) {

    public RecipeQuery {
        text = text == null ? "" : text.trim();
        regions = regions == null ? Set.of() : Set.copyOf(regions);
        cuisines = cuisines == null ? Set.of() : Set.copyOf(cuisines);
        mealTypes = mealTypes == null ? Set.of() : Set.copyOf(mealTypes);
        profile = profile == null ? DietProfile.EMPTY : profile;
        sort = sort == null ? SortOrder.BEST_MATCH : sort;
    }
}
