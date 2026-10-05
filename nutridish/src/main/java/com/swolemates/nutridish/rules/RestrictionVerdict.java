package com.swolemates.nutridish.rules;

import java.util.List;

public record RestrictionVerdict(DietaryRestriction restriction, Compatibility status, List<RuleFinding> findings) {

    public RestrictionVerdict {
        findings = List.copyOf(findings);
    }

    public static RestrictionVerdict of(DietaryRestriction restriction, List<RuleFinding> findings) {
        Compatibility status = findings.stream()
                .map(RuleFinding::level)
                .reduce(Compatibility.COMPATIBLE, Compatibility::worst);
        return new RestrictionVerdict(restriction, status, findings);
    }
}
