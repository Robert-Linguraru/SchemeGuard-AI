package org.schemeguard.backend.controller;

import lombok.RequiredArgsConstructor;
import org.schemeguard.backend.dto.CurrencyConversionResponse;
import org.schemeguard.backend.service.currency.CurrencyRateService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping("/api/currency")
@RequiredArgsConstructor
public class CurrencyConversionController {
    private final CurrencyRateService service;

    @GetMapping("/convert")
    public CurrencyConversionResponse convert(
            @RequestParam String sourceCurrency,
            @RequestParam String targetCurrency,
            @RequestParam BigDecimal sourceValue
    ) {
        return service.convert(sourceCurrency, targetCurrency, sourceValue);
    }

    @GetMapping("/available")
    public List<String> getAvailableCurrencies() {
        return service.getAvailableCurrencies();
    }
}
