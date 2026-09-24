package org.schemeguard.backend.service.currency;

import lombok.extern.slf4j.Slf4j;
import org.schemeguard.backend.config.CurrencyRatesProperties;
import org.schemeguard.backend.dto.FrankfurterRateResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;

@Component
@Slf4j
@ConditionalOnProperty(prefix = "app.currency-rates", name = "enabled", havingValue = "true", matchIfMissing = true)
public class CurrencyRateJob {
    private final CurrencyRateService service;
    private final CurrencyRatesProperties properties;
    private final RestClient client;

    @Autowired
    public CurrencyRateJob(CurrencyRateService service, CurrencyRatesProperties properties) {
        this(service, properties, createClient());
    }

    CurrencyRateJob(CurrencyRateService service, CurrencyRatesProperties properties, RestClient client) {
        this.service = service;
        this.properties = properties;
        this.client = client;
    }

    private static RestClient createClient() {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000);
        factory.setReadTimeout(30_000);
        return RestClient.builder().baseUrl("https://api.frankfurter.dev")
                .requestFactory(factory).build();
    }

    @Scheduled(cron = "${app.currency-rates.cron:0 0 18 * * MON-FRI}",
            zone = "${app.currency-rates.zone:Europe/Bucharest}")
    public synchronized void refresh() {
        try {
            var currencies = properties.getCurrencies().stream().distinct().sorted().toList();
            var rates = new ArrayList<FrankfurterRateResponse>();
            for (String base : currencies) {
                var quotes = new HashSet<>(currencies);
                quotes.remove(base);
                if (quotes.isEmpty()) continue;
                var response = client.get().uri(uri -> uri.path("/v2/providers/ecb/rates")
                                .queryParam("base", base)
                                .queryParam("quotes", String.join(",", quotes.stream().sorted().toList())).build())
                        .retrieve().body(FrankfurterRateResponse[].class);
                if (response == null) throw new IllegalStateException("Empty Frankfurter response");
                for (var rate : response) {
                    if (rate == null || !base.equals(rate.base()) || !quotes.remove(rate.quote())) {
                        throw new IllegalStateException("Unexpected or duplicate Frankfurter pair");
                    }
                }
                if (!quotes.isEmpty()) throw new IllegalStateException("Missing Frankfurter rates: " + quotes);
                rates.addAll(Arrays.asList(response));
            }

            log.info("Currency rates refreshed: {} pairs written", service.saveRates(rates));
        } catch (RuntimeException ex) {
            log.error("Currency rate refresh failed; existing rates were retained", ex);
        }
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        if (properties.isRefreshOnStartup()) refresh();
    }
}
