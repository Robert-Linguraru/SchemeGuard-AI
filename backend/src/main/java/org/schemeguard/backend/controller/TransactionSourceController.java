package org.schemeguard.backend.controller;

import org.schemeguard.backend.dto.csvuploads.TransactionSourceResponse;
import org.schemeguard.backend.service.csvuploads.TransactionSourceService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/transaction-sources")
public class TransactionSourceController {

    private final TransactionSourceService sourceService;

    public TransactionSourceController(TransactionSourceService sourceService) {
        this.sourceService = sourceService;
    }

    @GetMapping
    public List<TransactionSourceResponse> getSources() {
        return sourceService.findAll();
    }
}
