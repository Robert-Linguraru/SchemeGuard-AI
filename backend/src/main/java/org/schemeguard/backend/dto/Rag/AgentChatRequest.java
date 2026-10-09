package org.schemeguard.backend.dto.Rag;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public record AgentChatRequest(
        UUID uploadId,
        @NotBlank(message = "Message is required")
        @Size(max = 2000, message = "Message must be at most 2000 characters")
        String message,
        @Size(max = 2, message = "At most 2 transactions can be selected")
        List<UUID> transactionIds,
        @Valid @Size(max = 12) List<ChatTurn> history
) {
    public record ChatTurn(
        @NotBlank @Pattern(regexp = "user|assistant") String role,
            @NotBlank @Size(max = 2000) String content
    ) {}
}
