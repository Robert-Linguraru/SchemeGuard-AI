package org.schemeguard.backend.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class CurrencyConversionException extends RuntimeException {
    private final HttpStatus status;

    public CurrencyConversionException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }
}
