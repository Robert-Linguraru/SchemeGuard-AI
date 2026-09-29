package org.schemeguard.backend.config;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

import java.util.List;

@Component
@ConfigurationProperties(prefix = "app.currency-rates")
@Validated
@Getter
@Setter
public class CurrencyRatesProperties {
    @NotEmpty
    private List<@Pattern(regexp = "[A-Z]{3}") String> currencies = List.of("EUR", "RON", "USD", "GBP", "CHF");
    private boolean refreshOnStartup = true;
}
