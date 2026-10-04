package com.swolemates.nutridish.common;

import java.util.Arrays;
import java.util.Locale;

public interface Coded {

    String id();

    String label();

    static <E extends Enum<E> & Coded> E parse(Class<E> type, String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("Missing " + describe(type) + " value");
        }
        String value = raw.trim();
        for (E constant : type.getEnumConstants()) {
            if (constant.id().equalsIgnoreCase(value)
                    || constant.name().equalsIgnoreCase(value)
                    || constant.label().equalsIgnoreCase(value)) {
                return constant;
            }
        }
        throw new IllegalArgumentException("Unknown " + describe(type) + " '" + value + "'. Use one of: "
                + String.join(", ", Arrays.stream(type.getEnumConstants()).map(Coded::id).toList()));
    }

    private static String describe(Class<?> type) {
        return type.getSimpleName().replaceAll("([a-z])([A-Z])", "$1 $2").toLowerCase(Locale.ROOT);
    }
}
