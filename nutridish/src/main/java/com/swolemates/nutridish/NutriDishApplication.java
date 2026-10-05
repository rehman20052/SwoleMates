package com.swolemates.nutridish;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;

@SpringBootApplication
@ConfigurationPropertiesScan
public class NutriDishApplication {

    private static final Logger log = LoggerFactory.getLogger(NutriDishApplication.class);

    public static void main(String[] args) {
        SpringApplication.run(NutriDishApplication.class, args);
    }

    @EventListener(ApplicationReadyEvent.class)
    void ready(ApplicationReadyEvent event) {
        Environment env = event.getApplicationContext().getEnvironment();
        log.info("NutriDish is ready: http://localhost:{}", env.getProperty("local.server.port", env.getProperty("server.port", "8080")));
    }
}
