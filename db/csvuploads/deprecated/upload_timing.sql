-- Run after db/upload_tables.sql and before starting the backend.
-- Safe to rerun on an existing database.

ALTER TABLE upload_sessions
    ADD COLUMN IF NOT EXISTS first_part_request_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS all_parts_received_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS receive_duration_ms BIGINT,
    ADD COLUMN IF NOT EXISTS part_request_processing_duration_ms BIGINT,
    ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS document_persistence_duration_ms BIGINT,
    ADD COLUMN IF NOT EXISTS csv_parse_validation_duration_ms BIGINT,
    ADD COLUMN IF NOT EXISTS staging_write_duration_ms BIGINT,
    ADD COLUMN IF NOT EXISTS final_merge_duration_ms BIGINT,
    ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS total_duration_ms BIGINT;

ALTER TABLE uploads
    ADD COLUMN IF NOT EXISTS total_duration_ms BIGINT;
