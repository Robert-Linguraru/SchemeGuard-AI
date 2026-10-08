package org.schemeguard.backend.service.csvuploads;

final class DuplicateUploadException extends RuntimeException {

    static final String USER_MESSAGE = "This file has already been imported by your account.";

    DuplicateUploadException() {
        super(USER_MESSAGE);
    }

    DuplicateUploadException(Throwable cause) {
        super(USER_MESSAGE, cause);
    }
}
