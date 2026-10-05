-- Run after db/upload_tables.sql and before starting the backend.
CREATE TABLE IF NOT EXISTS anomaly_detection_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id UUID NOT NULL UNIQUE REFERENCES uploads(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    error_message VARCHAR(1000)
);
CREATE INDEX IF NOT EXISTS idx_anomaly_detection_jobs_pending
    ON anomaly_detection_jobs(status, requested_at);
