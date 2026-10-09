-- Run after anomaly_detection_jobs.sql. Existing tables are unchanged.
CREATE TABLE IF NOT EXISTS anomaly_detection_inputs (
    job_id UUID PRIMARY KEY REFERENCES anomaly_detection_jobs(id) ON DELETE CASCADE,
    fingerprint VARCHAR(100) NOT NULL
);
