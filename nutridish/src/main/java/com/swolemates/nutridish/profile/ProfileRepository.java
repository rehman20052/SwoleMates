package com.swolemates.nutridish.profile;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.swolemates.nutridish.catalog.Allergen;
import com.swolemates.nutridish.rules.DietaryRestriction;
import com.swolemates.nutridish.rules.LifeStage;

@Repository
public class ProfileRepository {

    private final JdbcClient jdbc;

    public ProfileRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public Optional<DietProfile> find(UUID userId) {
        Optional<DietProfile> base = jdbc.sql("select * from diet_profiles where user_id = :user")
                .param("user", userId)
                .query((rs, row) -> map(rs))
                .optional();
        return base.map(profile -> withChildren(profile, userId));
    }

    @Transactional
    public void save(UUID userId, DietProfile profile) {
        DietProfile.NutritionLimits limits = profile.limits();
        DietProfile.DailyTargets targets = profile.targets();
        String columns = """
                life_stage = :lifeStage, hide_disliked = :hide,
                max_calories = :maxCalories, min_protein = :minProtein, max_carbs = :maxCarbs, max_fat = :maxFat,
                min_fiber = :minFiber, max_minutes = :maxMinutes,
                target_calories = :tCalories, target_protein = :tProtein, target_carbs = :tCarbs, target_fat = :tFat,
                updated_at = current_timestamp
                """;
        JdbcClient.StatementSpec update = bind(jdbc.sql("update diet_profiles set " + columns + " where user_id = :user"),
                userId, profile, limits, targets);
        if (update.update() == 0) {
            bind(jdbc.sql("""
                    insert into diet_profiles (user_id, life_stage, hide_disliked, max_calories, min_protein, max_carbs,
                        max_fat, min_fiber, max_minutes, target_calories, target_protein, target_carbs, target_fat)
                    values (:user, :lifeStage, :hide, :maxCalories, :minProtein, :maxCarbs, :maxFat, :minFiber,
                        :maxMinutes, :tCalories, :tProtein, :tCarbs, :tFat)
                    """), userId, profile, limits, targets).update();
        }
        for (String table : List.of("profile_restrictions", "profile_allergens", "profile_dislikes")) {
            jdbc.sql("delete from " + table + " where user_id = :user").param("user", userId).update();
        }
        for (DietaryRestriction restriction : profile.restrictions()) {
            jdbc.sql("insert into profile_restrictions (user_id, restriction) values (:user, :value)")
                    .param("user", userId).param("value", restriction.id()).update();
        }
        for (Allergen allergen : profile.allergens()) {
            jdbc.sql("insert into profile_allergens (user_id, allergen) values (:user, :value)")
                    .param("user", userId).param("value", allergen.id()).update();
        }
        for (String term : profile.dislikes()) {
            jdbc.sql("insert into profile_dislikes (user_id, term) values (:user, :value)")
                    .param("user", userId).param("value", term).update();
        }
    }

    private static JdbcClient.StatementSpec bind(JdbcClient.StatementSpec spec, UUID userId, DietProfile profile,
            DietProfile.NutritionLimits limits, DietProfile.DailyTargets targets) {
        return spec.param("user", userId)
                .param("lifeStage", profile.lifeStage().id())
                .param("hide", profile.hideDisliked())
                .param("maxCalories", limits.maxCalories())
                .param("minProtein", limits.minProtein())
                .param("maxCarbs", limits.maxCarbs())
                .param("maxFat", limits.maxFat())
                .param("minFiber", limits.minFiber())
                .param("maxMinutes", limits.maxMinutes())
                .param("tCalories", targets.calories())
                .param("tProtein", targets.protein())
                .param("tCarbs", targets.carbs())
                .param("tFat", targets.fat());
    }

    private DietProfile withChildren(DietProfile base, UUID userId) {
        Set<DietaryRestriction> restrictions = EnumSet.noneOf(DietaryRestriction.class);
        jdbc.sql("select restriction from profile_restrictions where user_id = :user").param("user", userId)
                .query(String.class).list().forEach(v -> restrictions.add(DietaryRestriction.from(v)));
        Set<Allergen> allergens = EnumSet.noneOf(Allergen.class);
        jdbc.sql("select allergen from profile_allergens where user_id = :user").param("user", userId)
                .query(String.class).list().forEach(v -> allergens.add(Allergen.from(v)));
        List<String> dislikes = jdbc.sql("select term from profile_dislikes where user_id = :user order by term")
                .param("user", userId).query(String.class).list();
        return new DietProfile(restrictions, allergens, dislikes, base.lifeStage(), base.hideDisliked(),
                base.limits(), base.targets());
    }

    private static DietProfile map(ResultSet rs) throws SQLException {
        return new DietProfile(
                null,
                null,
                null,
                LifeStage.from(rs.getString("life_stage")),
                rs.getBoolean("hide_disliked"),
                new DietProfile.NutritionLimits(
                        integer(rs, "max_calories"), integer(rs, "min_protein"), integer(rs, "max_carbs"),
                        integer(rs, "max_fat"), integer(rs, "min_fiber"), integer(rs, "max_minutes")),
                new DietProfile.DailyTargets(
                        integer(rs, "target_calories"), integer(rs, "target_protein"),
                        integer(rs, "target_carbs"), integer(rs, "target_fat")));
    }

    private static Integer integer(ResultSet rs, String column) throws SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }
}
