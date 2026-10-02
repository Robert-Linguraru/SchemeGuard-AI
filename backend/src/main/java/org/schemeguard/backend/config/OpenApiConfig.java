package org.schemeguard.backend.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Info;
import org.springframework.context.annotation.Configuration;

@Configuration
@OpenAPIDefinition(info = @Info(
        title = "SchemeGuard API",
        version = "1.0.0",
        description = "Generated API contract for SchemeGuard backend endpoints. "
                + "File upload endpoints are intentionally excluded."
))
public class OpenApiConfig {
}
