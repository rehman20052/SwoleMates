package com.swolemates.nutridish.planner;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class MealLogRepository {

    public static final int MAX_ENTRIES_PER_DAY = 40;

    private final JdbcClient jdbc;

    public MealLogRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<MealLogEntry> list(UUID userId, LocalDate date) {
        return jdbc.sql("""
                select id, eaten_on, meal_type, recipe_id, recipe_name, servings, swaps,
                       calories, protein, carbs, fat, fiber, nutrition_source
                from meal_log_entries where user_id = :user and eaten_on = :date order by id
                """)
                .param("user", userId)
                .param("date", date)
                .query((rs, row) -> new MealLogEntry(
                        rs.getLong("id"),
                        rs.getObject("eaten_on", LocalDate.class),
                        rs.getString("meal_type"),
                        rs.getString("recipe_id"),
                        rs.getString("recipe_name"),
                        rs.getBigDecimal("servings").doubleValue(),
                        rs.getString("swaps"),
                        new MealLogEntry.Snapshot(
                                rs.getBigDecimal("calories").doubleValue(),
                                rs.getBigDecimal("protein").doubleValue(),
                                rs.getBigDecimal("carbs").doubleValue(),
                                rs.getBigDecimal("fat").doubleValue(),
                                rs.getBigDecimal("fiber").doubleValue()),
                        rs.getString("nutrition_source")))
                .list();
    }

    @Transactional
    public long add(UUID userId, MealLogEntry entry) {
        int existing = jdbc.sql("select count(*) from meal_log_entries where user_id = :user and eaten_on = :date")
                .param("user", userId).param("date", entry.date()).query(Integer.class).single();
        if (existing >= MAX_ENTRIES_PER_DAY) {
            throw new IllegalArgumentException("At most " + MAX_ENTRIES_PER_DAY + " meals can be logged per day");
        }
        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.sql("""
                insert into meal_log_entries (user_id, eaten_on, meal_type, recipe_id, recipe_name, servings, swaps,
                    calories, protein, carbs, fat, fiber, nutrition_source)
                values (:user, :date, :mealType, :recipeId, :recipeName, :servings, :swaps,
                    :calories, :protein, :carbs, :fat, :fiber, :source)
                """)
                .param("user", userId)
                .param("date", entry.date())
                .param("mealType", entry.mealType())
                .param("recipeId", entry.recipeId())
                .param("recipeName", entry.recipeName())
                .param("servings", decimal(entry.servings(), 2))
                .param("swaps", entry.swapsJson())
                .param("calories", decimal(entry.nutrition().calories(), 1))
                .param("protein", decimal(entry.nutrition().protein(), 1))
                .param("carbs", decimal(entry.nutrition().carbs(), 1))
                .param("fat", decimal(entry.nutrition().fat(), 1))
                .param("fiber", decimal(entry.nutrition().fiber(), 1))
                .param("source", entry.nutritionSource())
                .update(keys, "id");
        Number key = keys.getKey();
        if (key == null) {
            throw new IllegalStateException("Database did not return the new meal log id");
        }
        return key.longValue();
    }

    public boolean delete(UUID userId, long id) {
        return jdbc.sql("delete from meal_log_entries where id = :id and user_id = :user")
                .param("id", id).param("user", userId).update() > 0;
    }

    private static BigDecimal decimal(double value, int scale) {
        return BigDecimal.valueOf(value).setScale(scale, RoundingMode.HALF_UP);
    }
}
