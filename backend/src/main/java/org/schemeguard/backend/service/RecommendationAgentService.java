package org.schemeguard.backend.service;

import org.schemeguard.backend.dto.Recommendation.RecommendationResponse;
import org.schemeguard.backend.entity.QualificationResult;
import org.schemeguard.backend.entity.Transaction;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.exception.ResourceNotFoundException;
import org.schemeguard.backend.repository.QualificationResultRepository;
import org.schemeguard.backend.repository.TransactionRepository;
import org.schemeguard.backend.repository.UploadRepository;
import org.schemeguard.backend.service.rag.RagDocumentService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.text.Normalizer;

@Service
public class RecommendationAgentService {

    private final QualificationResultRepository qualificationResultRepository;
    private final TransactionRepository transactionRepository;
    private final UploadRepository uploadRepository;
    private final RagDocumentService ragDocumentService;

    private final RestClient restClient;
    private final String model;

    public RecommendationAgentService(
            QualificationResultRepository qualificationResultRepository,
            TransactionRepository transactionRepository,
            UploadRepository uploadRepository,
            RagDocumentService ragDocumentService,
            @Value("${app.llm.ollama-url}") String ollamaUrl,
            @Value("${app.llm.model}") String model
    ) {
        this.qualificationResultRepository = qualificationResultRepository;
        this.transactionRepository = transactionRepository;
        this.uploadRepository = uploadRepository;
        this.ragDocumentService = ragDocumentService;
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

    public RecommendationResponse recommend(
            User user,
            UUID uploadId,
            UUID transactionId,
            String userMessage
    ) {
        if (!uploadRepository.existsByIdAndUser_Id(uploadId, user.getId())
                || !transactionRepository.existsByIdAndUpload_Id(transactionId, uploadId)) {
            throw new ResourceNotFoundException("CSV upload or transaction not found");
        }

        QualificationResult result = qualificationResultRepository
                .findFirstByTransactionIdOrderByEvaluatedAtDescIdDesc(transactionId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No qualification result found for transaction"
                ));

        Transaction transaction = result.getTransaction();
        String guardResponse = guardResponse(userMessage);
        if (guardResponse != null) {
            return new RecommendationResponse(
                    transaction.getId(),
                    transaction.getExternalId(),
                    result.getQualificationStatus().name(),
                    guardResponse
            );
        }

        String context = buildContext(transaction, result);
        String retrievalQuery = userMessage + "\n"
                + "Qualification category: " + result.getQualificationCategory() + "\n"
                + "Failed conditions: " + result.getFailedConditions();
        String knowledgeContext = buildKnowledgeContext(ragDocumentService.search(retrievalQuery));
        String answer = askAgent(context, knowledgeContext, userMessage);

        return new RecommendationResponse(
                transaction.getId(),
                transaction.getExternalId(),
                result.getQualificationStatus().name(),
                answer
        );
    }

    private String askAgent(String context, String knowledgeContext, String userMessage) {
        String systemPrompt = """
                You are the SchemeGuard AI recommendation assistant.
                Respond exclusively in English.
                Provide concise, practical recommendations for improving a transaction and reducing its fee.
                Use the transaction context as supporting information, but do not automatically list or explain
                the qualification conditions or rules you used unless the user explicitly asks.
                Do not invent values, rules, rates, or features that are not present in the context.
                Do not claim that a change guarantees qualification.
                When explaining a failed transaction, identify the actual failed conditions and values.
                Do not recommend changing a condition that already passed.
                If the question is unrelated to improving the transaction, briefly say that you can help only
                with transaction improvement recommendations.
                Respond with at most 4 concise bullet points and focus on actionable improvements.
                """;

        String userPrompt = """
                Transaction and qualification context:
                %s

                Relevant knowledge retrieved from the rules and documentation:
                %s

                User question:
                %s

                Provide concrete, actionable recommendations. Use the retrieved knowledge when relevant,
                but do not mention the retrieval process or list the underlying conditions unless asked.
                """.formatted(context, knowledgeContext, userMessage);

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

    private String guardResponse(String userMessage) {
        String normalized = Normalizer.normalize(
                userMessage.toLowerCase(Locale.ROOT),
                Normalizer.Form.NFD
        ).replaceAll("\\p{M}+", "");
        String[] words = normalized.split("[^a-z0-9]+", -1);

        Set<String> romanianWords = Set.of(
                "explica", "romana", "tranzactie", "tranzactia", "comision",
                "regula", "calificata", "necalificata", "esuat", "esuata",
                "vreau", "poti", "putem", "pentru", "despre", "reduc"
        );
        for (String word : words) {
            if (romanianWords.contains(word)) {
                return "Sorry, I only accept questions in English.";
            }
        }

        String[] outOfDomainMarkers = {
                "weather", "recipe", "football", "soccer", "politics", "president",
                "movie", "music", "song", "joke", "restaurant", "hotel", "travel",
                "programming", "python", "java", "cryptocurrency", "stock market",
                "relationship", "homework", "capital of"
        };
        for (String marker : outOfDomainMarkers) {
            if (normalized.contains(marker)) {
                return "This question is not from this domain.";
            }
        }
        return null;
    }

    private String buildKnowledgeContext(List<RagDocumentService.RagSearchResult> results) {
        if (results.isEmpty()) {
            return "No additional rules or documentation were retrieved.";
        }

        StringBuilder context = new StringBuilder();
        for (int index = 0; index < results.size(); index++) {
            RagDocumentService.RagSearchResult result = results.get(index);
            context.append("[Snippet ")
                    .append(index + 1)
                    .append("] ")
                    .append(result.title())
                    .append(" (source: ")
                    .append(result.source())
                    .append(")\n")
                    .append(result.content())
                    .append("\n\n");
        }
        return context.toString().trim();
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
