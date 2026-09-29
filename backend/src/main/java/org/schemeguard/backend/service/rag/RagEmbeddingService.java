package org.schemeguard.backend.service.rag;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;

@Service
public class RagEmbeddingService {

    private final RestClient restClient;
    private final String model;

    public RagEmbeddingService(
            @Value("${app.llm.ollama-url}") String ollamaUrl,
            @Value("${app.rag.embedding-model:embeddinggemma}") String model
    ) {
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

    public List<Double> embed(String text) {
        EmbedResponse response = restClient.post()
                .uri("/api/embed")
                .body(new EmbedRequest(model, text))
                .retrieve()
                .body(EmbedResponse.class);

        if (response == null || response.embeddings() == null || response.embeddings().isEmpty()
                || response.embeddings().get(0) == null || response.embeddings().get(0).isEmpty()) {
            throw new IllegalStateException("Ollama did not return an embedding");
        }
        return response.embeddings().get(0);
    }

    private record EmbedRequest(String model, String input) {
    }

    private record EmbedResponse(List<List<Double>> embeddings) {
    }
}
