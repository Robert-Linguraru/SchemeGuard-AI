package org.schemeguard.backend.service;

import org.schemeguard.backend.dto.Recommendation.RecommendationResponse;
import org.schemeguard.backend.entity.FeeCalculation;
import org.schemeguard.backend.entity.QualificationResult;
import org.schemeguard.backend.entity.Transaction;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.exception.ResourceNotFoundException;
import org.schemeguard.backend.repository.FeeCalculationRepository;
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
    private final FeeCalculationRepository feeCalculationRepository;
    private final TransactionRepository transactionRepository;
    private final UploadRepository uploadRepository;
    private final RagDocumentService ragDocumentService;

    private final RestClient restClient;
    private final String model;

    public RecommendationAgentService(
            QualificationResultRepository qualificationResultRepository,
            FeeCalculationRepository feeCalculationRepository,
            TransactionRepository transactionRepository,
            UploadRepository uploadRepository,
            RagDocumentService ragDocumentService,
            @Value("${app.llm.ollama-url}") String ollamaUrl,
            @Value("${app.llm.model}") String model
    ) {
        this.qualificationResultRepository = qualificationResultRepository;
        this.feeCalculationRepository = feeCalculationRepository;
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

        FeeCalculation feeCalculation = feeCalculationRepository
                .findByQualificationResultId(result.getId())
                .orElse(null);

        String context = buildContext(transaction, result, feeCalculation);
        String retrievalQuery = userMessage + "\n"
                + "Qualification category: " + result.getQualificationCategory() + "\n"
                + "Failed conditions: " + result.getFailedConditions();
        String knowledgeContext = buildKnowledgeContext(
                ragDocumentService.search(retrievalQuery),
                result.getRule() != null
        );
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
                Answer the user's exact question first and keep the answer focused on that question.
                For a direct factual question about one field, respond in one or two concise sentences.
                When comparing a transaction with a rule, explicitly state the required value, the actual value,
                and whether they match.
                Use the applicable rule context as the source of truth for required values.
                The official qualification status calculated by the rule engine is authoritative.
                The official rule-engine explanation is authoritative when no applicable rule was selected.
                Never describe a NOT_QUALIFIED transaction as qualified, even if some rule conditions passed.
                Never describe a QUALIFIED transaction as not qualified.
                If the selected applicable rule is NONE, do not treat any retrieved RAG snippet as the rule
                applied to this transaction.
                If the status is NOT_QUALIFIED and Failed conditions is empty, do not invent failed conditions,
                do not claim that all conditions passed, and do not infer a failed field from RAG.
                In that case, state that no specific failed condition was recorded and use the official explanation.
                If the status is NOT_QUALIFIED and Failed conditions contains entries while the selected rule is
                NONE, describe them as failed conditions from evaluated candidate rules, and clearly state that
                no applicable rule was selected. Do not call a candidate rule the selected applicable rule.
                Provide practical recommendations only when the user asks for recommendations or improvements.
                Do not automatically list or explain unrelated qualification conditions or rules.
                Do not invent values, rules, rates, or features that are not present in the context.
                Do not call values an allowed range unless the applicable rule explicitly defines a range.
                The rule interchange rate is not the same as the final transaction fee.
                Never label a rule interchange rate as the transaction fee.
                If the user asks for the transaction fee and an actual fee is not present in the context,
                explicitly say that the actual fee is unavailable.
                Do not use generic advice such as "verify" or "confirm" when the actual transaction value is
                already available; state the actual result instead.
                If the required value is not available in the applicable rule context, say that it is unavailable.
                Do not claim that a change guarantees qualification.
                When recommending a different card type, channel, 3DS setting, or other transaction value,
                refer to future transactions. Do not suggest modifying a historical transaction record.
                When explaining a failed transaction, identify the actual failed conditions and values.
                Do not recommend changing a condition that already passed.
                For a direct question about one field, do not add recommendations about other fields.
                Failed conditions take priority over general statements about what the rule allows.
                If the question is unrelated to improving the transaction, briefly say that you can help only
                with transaction improvement recommendations.
                Use at most 2 concise bullet points for direct factual questions and at most 4 for recommendations.
                """;

        String userPrompt = """
                Transaction and qualification context:
                %s

                The applicable rule context and official rule-engine result above have priority over the
                retrieved reference snippets.
                Relevant knowledge retrieved from the rules and documentation:
                %s

                User question:
                %s

                Before answering, check the official qualification status, selected rule, official explanation,
                and failed conditions.
                Use the retrieved knowledge only as supporting reference material for the selected rule.
                Do not mention the retrieval process.
                If the question is direct and factual, answer only that question.
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

    private String buildKnowledgeContext(
            List<RagDocumentService.RagSearchResult> results,
            boolean applicableRuleSelected
    ) {
        String referenceNotice = applicableRuleSelected
                ? "Reference snippets for the selected rule; they are not a substitute for the official result."
                : "No applicable rule was selected. These snippets are general reference material only and must not be treated as the applied rule.";

        if (results.isEmpty()) {
            return referenceNotice + "\nNo additional rules or documentation were retrieved.";
        }

        StringBuilder context = new StringBuilder(referenceNotice).append("\n");
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

    private String buildContext(
            Transaction transaction,
            QualificationResult result,
            FeeCalculation feeCalculation
    ) {
        var rule = result.getRule();
        String ruleContext = rule == null
                ? "Selected applicable rule: NONE\n"
                        + "No applicable rule was selected by the rule engine for this transaction."
                : """
                        Selected applicable rule:
                        Card scheme: %s
                        Rule code: %s
                        Rule name: %s
                        Rule region: %s
                        Rule version: %s
                        Required rule conditions: %s
                        Rule interchange rate: %s
                        """.formatted(
                        rule.getScheme() == null ? "unavailable" : rule.getScheme().getCode(),
                        rule.getRuleCode(),
                        rule.getRuleName(),
                        rule.getRegion(),
                        rule.getVersion(),
                        rule.getConditions(),
                        rule.getInterchangeRate()
                );
                String feeContext = feeCalculation == null
                ? "Final transaction fee: unavailable in this context; do not infer it from the rule rate."
                : """
                        Final transaction fee: %s %s
                        Interchange rate used for fee calculation: %s
                        """.formatted(
                        feeCalculation.getTotalFee(),
                        transaction.getCurrencyCode(),
                        feeCalculation.getInterchangeRate()
                );

        return """
                %s

                Actual transaction:
                External ID: %s
                Amount: %s %s
                Card type: %s
                Card category: %s
                Channel: %s
                Issuer country: %s
                Merchant country: %s
                3DS used: %s
                CVV present: %s
                Official rule-engine result:
                Qualification status: %s
                Qualification category: %s
                Passed conditions: %s
                Failed conditions: %s
                Official rule-engine explanation: %s
                %s
                """.formatted(
                ruleContext,
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
                result.getFailedConditions(),
                result.getExplanation(),
                feeContext
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
