package com.swolemates.nutridish.substitution;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import tools.jackson.databind.json.JsonMapper;

@Repository
public class SubstitutionAuditRepository {

    private static final int MAX_JSON = 20_000;

    private final JdbcClient jdbc;
    private final JsonMapper json;

    public SubstitutionAuditRepository(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public void record(UUID userId, SubstitutionOutcome outcome) {
        List<Map<String, Object>> proposals = new ArrayList<>();
        for (CandidateVerdict verdict : concat(outcome.accepted(), outcome.rejected())) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("ingredientId", verdict.proposal().ingredientId());
            row.put("label", verdict.proposal().label());
            row.put("grams", verdict.proposal().grams());
            row.put("accepted", verdict.accepted());
            row.put("reasons", verdict.reasons());
            proposals.add(row);
        }
        String text = json.writeValueAsString(proposals);
        if (text.length() > MAX_JSON) {
            text = text.substring(0, MAX_JSON);
        }
        jdbc.sql("""
                insert into substitution_audit
                    (user_id, recipe_id, ingredient_id, reason, proposals, accepted_count, rejected_count)
                values (:user, :recipe, :ingredient, :reason, :proposals, :accepted, :rejected)
                """)
                .param("user", userId)
                .param("recipe", outcome.current().recipe().id())
                .param("ingredient", outcome.target().ingredient().id())
                .param("reason", outcome.reason().id())
                .param("proposals", text)
                .param("accepted", outcome.accepted().size())
                .param("rejected", outcome.rejected().size())
                .update();
    }

    private static List<CandidateVerdict> concat(List<CandidateVerdict> a, List<CandidateVerdict> b) {
        List<CandidateVerdict> all = new ArrayList<>(a);
        all.addAll(b);
        return all;
    }
}
