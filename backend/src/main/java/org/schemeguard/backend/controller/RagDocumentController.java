package org.schemeguard.backend.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.schemeguard.backend.dto.Rag.RagDocumentRequest;
import org.schemeguard.backend.dto.Rag.RagDocumentResponse;
import org.schemeguard.backend.service.rag.RagDocumentService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rag")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class RagDocumentController {

    private final RagDocumentService ragDocumentService;

    @PostMapping("/documents")
    public ResponseEntity<RagDocumentResponse> indexDocument(
            @Valid @RequestBody RagDocumentRequest request
    ) {
        int chunks = ragDocumentService.indexDocument(
                request.title(),
                request.source(),
                request.content()
        );
        return ResponseEntity.ok(new RagDocumentResponse(request.source(), chunks));
    }

    @PostMapping("/rules/reindex")
    public ResponseEntity<RagDocumentResponse> reindexRules() {
        int chunks = ragDocumentService.indexAllRules();
        return ResponseEntity.ok(new RagDocumentResponse("database:interchange_rules", chunks));
    }
}
