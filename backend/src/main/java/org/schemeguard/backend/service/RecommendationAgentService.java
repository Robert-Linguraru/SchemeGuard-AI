package org.schemeguard.backend.service;

import org.schemeguard.backend.dto.Recommendation.RecommendationResponse;
import org.schemeguard.backend.entity.QualificationResult;
import org.schemeguard.backend.entity.Transaction;
import org.schemeguard.backend.exception.ResourceNotFoundException;
import org.schemeguard.backend.repository.QualificationResultRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class RecommendationAgentService {

    private final QualificationResultRepository qualificationResultRepository;

    private final RestClient restClient;
    private final String model;

    public RecommendationAgentService(
            QualificationResultRepository qualificationResultRepository,
            @Value("${app.llm.ollama-url}") String ollamaUrl,
            @Value("${app.llm.model}") String model
    ) {
        this.qualificationResultRepository = qualificationResultRepository;
        this.model = model;

        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(Duration.ofSeconds(120));
        this.restClient = RestClient.builder()
                .baseUrl(ollamaUrl)
                .requestFactory(requestFactory)
                .build();
    }

    public RecommendationResponse recommend(UUID transactionId, String userMessage) {
        QualificationResult result = qualificationResultRepository
                .findFirstByTransactionIdOrderByEvaluatedAtDescIdDesc(transactionId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No qualification result found for transaction"
                ));

        Transaction transaction = result.getTransaction();
        String context = buildContext(transaction, result);
        String answer = askAgent(context, userMessage);

        return new RecommendationResponse(
                transaction.getId(),
                transaction.getExternalId(),
                result.getQualificationStatus().name(),
                answer
        );
    }

    private String askAgent(String context, String userMessage) {
        String systemPrompt = """
                Ești asistentul de recomandări al aplicației SchemeGuard AI.
                Răspunde exclusiv în limba română.
                Oferă recomandări practice pentru îmbunătățirea calificării unei tranzacții.
                Folosește exclusiv feature-urile și condițiile din contextul primit.
                Nu explica rezultatul tranzacției și nu reproduce raportul de calificare.
                Nu inventa valori, reguli, rate sau feature-uri care nu apar în context.
                Nu promite că o schimbare va garanta calificarea.
                Dacă întrebarea nu are legătură cu îmbunătățirea tranzacției, spune scurt că poți ajuta
                doar cu recomandări bazate pe condițiile calificate.
                Răspunde în maximum 4 bullet-uri scurte și include feature-ul concret vizat.
                """;

        String userPrompt = """
                Contextul tranzacției și al calificării:
                %s

                Întrebarea utilizatorului:
                %s

                Formulează recomandări concrete, limitate la feature-urile din context.
                """.formatted(context, userMessage);

        OllamaResponse response = restClient.post()
                .uri("/api/chat")
                .body(new OllamaRequest(
                        model,
                        List.of(
                                new OllamaMessage("system", systemPrompt),
                                new OllamaMessage("user", userPrompt)
                        ),
                        false,
                        false,
                        Map.of("temperature", 0.2, "num_predict", 220, "num_ctx", 4096)
                ))
                .retrieve()
                .body(OllamaResponse.class);

        if (response == null || response.message() == null || response.message().content() == null
                || response.message().content().isBlank()) {
            throw new IllegalStateException("Recommendation agent did not return a response");
        }

        return cleanResponse(response.message().content());
    }

    private String buildContext(Transaction transaction, QualificationResult result) {
        return """
                External ID: %s
                Amount: %s %s
                Card type: %s
                Card category: %s
                Channel: %s
                Issuer country: %s
                Merchant country: %s
                3DS used: %s
                CVV present: %s
                Qualification status: %s
                Qualification category: %s
                Passed conditions: %s
                Failed conditions: %s
                """.formatted(
                transaction.getExternalId(),
                transaction.getAmount(),
                transaction.getCurrencyCode(),
                transaction.getCardType(),
                transaction.getCardCategory(),
                transaction.getChannel(),
                transaction.getIssuerCountry(),
                transaction.getMerchantCountry(),
                transaction.getThreeDsUsed(),
                transaction.getCvvPresent(),
                result.getQualificationStatus(),
                result.getQualificationCategory(),
                result.getPassedConditions(),
                result.getFailedConditions()
        );
    }

    private String cleanResponse(String content) {
        int thinkEnd = content.lastIndexOf("</think>");
        String result = thinkEnd >= 0 ? content.substring(thinkEnd + "</think>".length()) : content;
        return result.replace("<think>", "").replace("</think>", "").trim();
    }

    private record OllamaRequest(
            String model,
            List<OllamaMessage> messages,
            boolean stream,
            boolean think,
            Map<String, Object> options
    ) {
    }

    private record OllamaMessage(String role, String content) {
    }

    private record OllamaResponse(OllamaMessage message) {
    }
}
