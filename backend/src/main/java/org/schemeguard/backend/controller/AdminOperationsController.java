package org.schemeguard.backend.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.schemeguard.backend.dto.NukeConfirmationRequest;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.service.NukeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminOperationsController {

    private static final Logger logger = LoggerFactory.getLogger(AdminOperationsController.class);

    private final NukeService nukeService;

    @PostMapping("/nuke")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> executeNuke(
            @Valid @RequestBody NukeConfirmationRequest request,
            @AuthenticationPrincipal User user
    ) {
        nukeService.executeNuke();
        logger.warn("Database nuke script executed by admin user {}", user.getId());
        return ResponseEntity.noContent().build();
    }
}
