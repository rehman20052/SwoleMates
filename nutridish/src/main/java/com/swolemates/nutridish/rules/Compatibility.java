package com.swolemates.nutridish.rules;

import com.fasterxml.jackson.annotation.JsonValue;

public enum Compatibility {
    COMPATIBLE,
    VERIFY,
    INCOMPATIBLE;

    @JsonValue
    public String id() {
        return name().toLowerCase();
    }

    public Compatibility worst(Compatibility other) {
        return compareTo(other) >= 0 ? this : other;
    }
}
