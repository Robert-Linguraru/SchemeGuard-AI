package org.schemeguard.backend.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.schemeguard.backend.dto.Rag.AgentChatRequest;
import org.schemeguard.backend.dto.Rag.AgentChatResponse;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.service.rag.UserTransactionRagService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/agent")
@RequiredArgsConstructor
public class AgentChatController {
    private final UserTransactionRagService agent;

    @PostMapping("/chat")
    public ResponseEntity<AgentChatResponse> chat(
            @Valid @RequestBody AgentChatRequest request,
            @AuthenticationPrincipal User user
    ) {
        return ResponseEntity.ok(agent.chat(user, request));
    }
}
