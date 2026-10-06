package org.schemeguard.backend.service.csvuploads;

public class UploadCancelledException extends RuntimeException {

    public UploadCancelledException() {
        super("Upload was cancelled.");
    }
}
