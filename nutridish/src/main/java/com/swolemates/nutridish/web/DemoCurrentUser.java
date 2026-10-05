package com.swolemates.nutridish.web;

import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class DemoCurrentUser implements CurrentUser {

    private final UUID id;

    public DemoCurrentUser(@Value("${nutridish.demo-user-id}") UUID id) {
        this.id = id;
    }

    @Override
    public UUID id() {
        return id;
    }
}
