package com.swolemates.nutridish.profile;

import org.springframework.stereotype.Component;

import com.swolemates.nutridish.rules.DislikeMatcher;

@Component
public class ProfileSanitizer {

    private final DislikeMatcher dislikes;

    public ProfileSanitizer(DislikeMatcher dislikes) {
        this.dislikes = dislikes;
    }

    public DietProfile sanitize(DietProfile profile) {
        DietProfile base = profile == null ? DietProfile.EMPTY : profile;
        return base.withDislikes(dislikes.normalize(base.dislikes()));
    }
}
