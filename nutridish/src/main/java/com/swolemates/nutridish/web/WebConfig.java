package com.swolemates.nutridish.web;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final CorsProperties cors;

    public WebConfig(CorsProperties cors) {
        this.cors = cors;
    }

    @ConfigurationProperties("nutridish.cors")
    public record CorsProperties(List<String> allowedOrigins) {
        public CorsProperties {
            allowedOrigins = allowedOrigins == null ? List.of() : allowedOrigins.stream().filter(o -> !o.isBlank()).toList();
        }
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        if (!cors.allowedOrigins().isEmpty()) {
            registry.addMapping("/api/nutrition/**")
                    .allowedOrigins(cors.allowedOrigins().toArray(new String[0]))
                    .allowedMethods("GET", "POST", "PUT", "DELETE");
        }
    }
}
