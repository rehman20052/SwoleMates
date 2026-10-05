package com.swolemates.nutridish.catalog;

public record SwapRule(String to, double ratio, String note) {

    public boolean omits() {
        return to == null;
    }
}
