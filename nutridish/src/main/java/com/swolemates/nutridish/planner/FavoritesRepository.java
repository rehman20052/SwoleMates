package com.swolemates.nutridish.planner;

import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class FavoritesRepository {

    public static final int MAX_FAVORITES = 500;

    private final JdbcClient jdbc;

    public FavoritesRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<String> list(UUID userId) {
        return jdbc.sql("select recipe_id from favorite_recipes where user_id = :user order by created_at desc, recipe_id")
                .param("user", userId).query(String.class).list();
    }

    @Transactional
    public void add(UUID userId, String recipeId) {
        boolean exists = jdbc.sql("select count(*) from favorite_recipes where user_id = :user and recipe_id = :recipe")
                .param("user", userId).param("recipe", recipeId).query(Integer.class).single() > 0;
        if (exists) {
            return;
        }
        int count = jdbc.sql("select count(*) from favorite_recipes where user_id = :user")
                .param("user", userId).query(Integer.class).single();
        if (count >= MAX_FAVORITES) {
            throw new IllegalArgumentException("You can save at most " + MAX_FAVORITES + " recipes");
        }
        jdbc.sql("insert into favorite_recipes (user_id, recipe_id) values (:user, :recipe)")
                .param("user", userId).param("recipe", recipeId).update();
    }

    public void remove(UUID userId, String recipeId) {
        jdbc.sql("delete from favorite_recipes where user_id = :user and recipe_id = :recipe")
                .param("user", userId).param("recipe", recipeId).update();
    }
}
