package org.schemeguard.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record NukeConfirmationRequest(
        @NotBlank
        @Pattern(regexp = "DELETE ALL DATA", message = "Confirmation phrase does not match")
        String confirmationPhrase
) {
}
