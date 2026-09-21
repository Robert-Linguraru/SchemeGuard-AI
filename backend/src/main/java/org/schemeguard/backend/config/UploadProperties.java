package org.schemeguard.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.upload")
public class UploadProperties {

    private String storageDirectory = "/tmp/schemeguard-transaction-uploads";
    private long chunkSizeBytes = 32L * 1024 * 1024;
    private long maxFileSizeBytes = 64L * 1024 * 1024 * 1024;
    private int maxParts = 2_000; //20
    private int maxParallelUploads = 1000; //20
    private int maxParallelImports = 2;
    private int apiRequestsPerMinute = 720;  //120
    private int chunkUploadsPerMinute = 1240; //240
    private int sessionTtlHours = 24;

    public String getStorageDirectory() {
        return storageDirectory;
    }

    public void setStorageDirectory(String storageDirectory) {
        this.storageDirectory = storageDirectory;
    }

    public long getChunkSizeBytes() {
        return chunkSizeBytes;
    }

    public void setChunkSizeBytes(long chunkSizeBytes) {
        this.chunkSizeBytes = chunkSizeBytes;
    }

    public long getMaxFileSizeBytes() {
        return maxFileSizeBytes;
    }

    public void setMaxFileSizeBytes(long maxFileSizeBytes) {
        this.maxFileSizeBytes = maxFileSizeBytes;
    }

    public int getMaxParts() {
        return maxParts;
    }

    public void setMaxParts(int maxParts) {
        this.maxParts = maxParts;
    }

    public int getMaxParallelUploads() {
        return maxParallelUploads;
    }

    public void setMaxParallelUploads(int maxParallelUploads) {
        this.maxParallelUploads = maxParallelUploads;
    }

    public int getMaxParallelImports() {
        return maxParallelImports;
    }

    public void setMaxParallelImports(int maxParallelImports) {
        this.maxParallelImports = maxParallelImports;
    }

    public int getApiRequestsPerMinute() {
        return apiRequestsPerMinute;
    }

    public void setApiRequestsPerMinute(int apiRequestsPerMinute) {
        this.apiRequestsPerMinute = apiRequestsPerMinute;
    }

    public int getChunkUploadsPerMinute() {
        return chunkUploadsPerMinute;
    }

    public void setChunkUploadsPerMinute(int chunkUploadsPerMinute) {
        this.chunkUploadsPerMinute = chunkUploadsPerMinute;
    }

    public int getSessionTtlHours() {
        return sessionTtlHours;
    }

    public void setSessionTtlHours(int sessionTtlHours) {
        this.sessionTtlHours = sessionTtlHours;
    }
}
