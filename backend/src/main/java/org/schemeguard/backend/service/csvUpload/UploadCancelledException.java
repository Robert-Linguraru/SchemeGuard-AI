package org.schemeguard.backend.service.csvUpload;

public class UploadCancelledException extends RuntimeException {

    public UploadCancelledException() {
        super("Upload was cancelled.");
    }
}
