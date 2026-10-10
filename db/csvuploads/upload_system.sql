-- Consolidated upload/import schema.
-- Run after db/create_schema.sql (users, processing_jobs, transactions, and
-- their referenced merchant/scheme tables must already exist).
-- This script consolidates the former db/csvuploads/deprecated migrations:
-- upload_tables.sql, upload_content_hash.sql,
-- transaction_sources_and_deduplication.sql, transaction_import_review.sql,
-- transaction_outliers.sql, anomaly_detection_jobs.sql,
-- anomaly_detection_inputs.sql, and upload_timing.sql.
-- DDL is safe to rerun against a database where those migrations were applied.

CREATE TABLE IF NOT EXISTS transaction_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL CHECK (BTRIM(name) <> ''),
    normalized_name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS upload_sessions (
    id UUID PRIMARY KEY,
    processing_job_id UUID REFERENCES processing_jobs(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    original_file_name VARCHAR(255) NOT NULL,
    expected_file_size_bytes BIGINT NOT NULL CHECK (expected_file_size_bytes > 0),
    expected_total_parts INTEGER NOT NULL CHECK (expected_total_parts > 0),
    expected_file_sha256 VARCHAR(64),
    status VARCHAR(20) NOT NULL,
    uploaded_bytes BIGINT NOT NULL DEFAULT 0 CHECK (uploaded_bytes >= 0),
    uploaded_parts INTEGER NOT NULL DEFAULT 0 CHECK (uploaded_parts >= 0),
    processed_rows BIGINT NOT NULL DEFAULT 0 CHECK (processed_rows >= 0),
    duplicate_rows BIGINT NOT NULL DEFAULT 0,
    duplicate_signature VARCHAR(32),
    error_message VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    first_part_request_at TIMESTAMPTZ,
    all_parts_received_at TIMESTAMPTZ,
    receive_duration_ms BIGINT,
    part_request_processing_duration_ms BIGINT,
    processing_started_at TIMESTAMPTZ,
    document_persistence_duration_ms BIGINT,
    csv_parse_validation_duration_ms BIGINT,
    staging_write_duration_ms BIGINT,
    final_merge_duration_ms BIGINT,
    finished_at TIMESTAMPTZ,
    total_duration_ms BIGINT
);

CREATE TABLE IF NOT EXISTS upload_parts (
    id BIGSERIAL PRIMARY KEY,
    upload_id UUID NOT NULL REFERENCES upload_sessions(id) ON DELETE CASCADE,
    part_number INTEGER NOT NULL CHECK (part_number >= 0),
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
    sha256 VARCHAR(64) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    CONSTRAINT uq_upload_parts_session_number UNIQUE (upload_id, part_number)
);

CREATE TABLE IF NOT EXISTS uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    session_id UUID NOT NULL REFERENCES upload_sessions(id) ON DELETE CASCADE,
    source_id UUID REFERENCES transaction_sources(id),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    document BYTEA NOT NULL,
    content_sha256 VARCHAR(64),
    was_evaluated BOOLEAN NOT NULL DEFAULT FALSE,
    total_duration_ms BIGINT
);

ALTER TABLE upload_sessions
    ADD COLUMN IF NOT EXISTS processing_job_id UUID
        REFERENCES processing_jobs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS user_id UUID
        REFERENCES users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS duplicate_rows BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS duplicate_signature VARCHAR(32),
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
    ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES transaction_sources(id),
    ADD COLUMN IF NOT EXISTS content_sha256 VARCHAR(64),
    ADD COLUMN IF NOT EXISTS was_evaluated BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS total_duration_ms BIGINT;

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS upload_id UUID REFERENCES uploads(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES transaction_sources(id);

ALTER TABLE transactions
    ALTER COLUMN upload_id DROP NOT NULL;

-- External transaction identifiers are unique per user and source, not globally.
ALTER TABLE transactions
    DROP CONSTRAINT IF EXISTS transactions_external_id_key;
DROP INDEX IF EXISTS uq_transactions_upload_external_id;

-- Preserve known ownership/source associations on transactions already imported.
UPDATE transactions t
SET user_id = u.user_id,
    source_id = u.source_id
FROM uploads u
WHERE t.upload_id = u.id
  AND u.source_id IS NOT NULL
  AND (t.user_id IS DISTINCT FROM u.user_id OR t.source_id IS DISTINCT FROM u.source_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_uploads_id_user_source
    ON uploads (id, user_id, source_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_transactions_owner_source_pair'
          AND conrelid = 'transactions'::regclass
    ) THEN
        ALTER TABLE transactions
            ADD CONSTRAINT ck_transactions_owner_source_pair
            CHECK ((user_id IS NULL) = (source_id IS NULL));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_transactions_upload_owner_source'
          AND conrelid = 'transactions'::regclass
    ) THEN
        ALTER TABLE transactions
            ADD CONSTRAINT fk_transactions_upload_owner_source
            FOREIGN KEY (upload_id, user_id, source_id)
            REFERENCES uploads (id, user_id, source_id);
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_user_source_external_id
    ON transactions (user_id, source_id, external_id)
    WHERE user_id IS NOT NULL AND source_id IS NOT NULL;

-- Unlogged staging is used only while validating a complete CSV import.
CREATE UNLOGGED TABLE IF NOT EXISTS transaction_import_staging (
    upload_id UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    row_number BIGINT NOT NULL,
    external_id VARCHAR(100) NOT NULL,
    network VARCHAR(30) NOT NULL,
    amount NUMERIC(19,4) NOT NULL,
    currency_code VARCHAR(3) NOT NULL,
    merchant_id UUID NOT NULL,
    merchant_name VARCHAR(200) NOT NULL,
    merchant_mcc VARCHAR(4) NOT NULL,
    merchant_country VARCHAR(2) NOT NULL,
    issuer_country VARCHAR(2) NOT NULL,
    card_type VARCHAR(20) NOT NULL,
    card_category VARCHAR(20) NOT NULL,
    channel VARCHAR(20) NOT NULL,
    authorized_at TIMESTAMPTZ NOT NULL,
    cleared_at TIMESTAMPTZ,
    three_ds_used BOOLEAN NOT NULL,
    cvv_present BOOLEAN NOT NULL,
    raw_data JSONB NOT NULL,
    is_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
    duplicate_reason VARCHAR(30),
    duplicate_transaction_id UUID,
    duplicate_upload_id UUID,
    PRIMARY KEY (upload_id, row_number)
);

ALTER TABLE transaction_import_staging
    ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS duplicate_reason VARCHAR(30),
    ADD COLUMN IF NOT EXISTS duplicate_transaction_id UUID,
    ADD COLUMN IF NOT EXISTS duplicate_upload_id UUID;

-- WAL-backed review rows survive restart while duplicate decisions are pending.
CREATE TABLE IF NOT EXISTS transaction_import_review (
    upload_id UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    row_number BIGINT NOT NULL,
    external_id VARCHAR(100) NOT NULL,
    network VARCHAR(30) NOT NULL,
    amount NUMERIC(19,4) NOT NULL,
    currency_code VARCHAR(3) NOT NULL,
    merchant_id UUID NOT NULL,
    merchant_name VARCHAR(200) NOT NULL,
    merchant_mcc VARCHAR(4) NOT NULL,
    merchant_country VARCHAR(2) NOT NULL,
    issuer_country VARCHAR(2) NOT NULL,
    card_type VARCHAR(20) NOT NULL,
    card_category VARCHAR(20) NOT NULL,
    channel VARCHAR(20) NOT NULL,
    authorized_at TIMESTAMPTZ NOT NULL,
    cleared_at TIMESTAMPTZ,
    three_ds_used BOOLEAN NOT NULL,
    cvv_present BOOLEAN NOT NULL,
    raw_data JSONB NOT NULL,
    is_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
    duplicate_reason VARCHAR(30),
    duplicate_transaction_id UUID,
    duplicate_upload_id UUID,
    PRIMARY KEY (upload_id, row_number)
);

-- Move any pending review sessions from staging before deleting their staging rows.
INSERT INTO transaction_import_review (
    upload_id, row_number, external_id, network, amount, currency_code,
    merchant_id, merchant_name, merchant_mcc, merchant_country,
    issuer_country, card_type, card_category, channel,
    authorized_at, cleared_at, three_ds_used, cvv_present, raw_data,
    is_duplicate, duplicate_reason, duplicate_transaction_id, duplicate_upload_id
)
SELECT
    staging.upload_id, staging.row_number, staging.external_id, staging.network,
    staging.amount, staging.currency_code, staging.merchant_id, staging.merchant_name,
    staging.merchant_mcc, staging.merchant_country, staging.issuer_country,
    staging.card_type, staging.card_category, staging.channel, staging.authorized_at,
    staging.cleared_at, staging.three_ds_used, staging.cvv_present, staging.raw_data,
    staging.is_duplicate, staging.duplicate_reason, staging.duplicate_transaction_id,
    staging.duplicate_upload_id
FROM transaction_import_staging staging
JOIN uploads upload ON upload.id = staging.upload_id
JOIN upload_sessions session ON session.id = upload.session_id
WHERE session.status = 'DUPLICATES_FOUND'
ON CONFLICT (upload_id, row_number) DO NOTHING;

DELETE FROM transaction_import_staging staging
USING uploads upload, upload_sessions session
WHERE upload.id = staging.upload_id
  AND session.id = upload.session_id
  AND session.status = 'DUPLICATES_FOUND';

-- Duplicate attempts keep their session for polling but not an empty upload record.
DELETE FROM uploads u
USING upload_sessions s
WHERE s.id = u.session_id
  AND s.status = 'DUPLICATE'
  AND NOT EXISTS (
      SELECT 1 FROM transactions t WHERE t.upload_id = u.id
  );

CREATE INDEX IF NOT EXISTS idx_upload_parts_upload_id
    ON upload_parts(upload_id);
CREATE INDEX IF NOT EXISTS idx_uploads_user_id
    ON uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_session_id
    ON uploads(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_uploads_session_id
    ON uploads(session_id);
CREATE INDEX IF NOT EXISTS idx_transactions_upload_id
    ON transactions(upload_id);
CREATE INDEX IF NOT EXISTS idx_transactions_upload_authorized_at
    ON transactions(upload_id, authorized_at);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_status
    ON upload_sessions(status);
CREATE INDEX IF NOT EXISTS idx_transaction_import_staging_upload_external_id
    ON transaction_import_staging (upload_id, external_id, row_number);
CREATE INDEX IF NOT EXISTS idx_transaction_import_review_upload_external_id
    ON transaction_import_review (upload_id, external_id, row_number);
DROP INDEX IF EXISTS uq_uploads_user_content_sha256;
CREATE UNIQUE INDEX IF NOT EXISTS uq_uploads_user_source_content_sha256
    ON uploads (user_id, source_id, content_sha256)
    WHERE content_sha256 IS NOT NULL;

CREATE TABLE IF NOT EXISTS transaction_outliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    manually_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at TIMESTAMPTZ,
    CONSTRAINT uk_transaction_outlier_upload_transaction
        UNIQUE (upload_id, transaction_id)
);
CREATE INDEX IF NOT EXISTS idx_transaction_outliers_upload_id
    ON transaction_outliers(upload_id);

CREATE TABLE IF NOT EXISTS transaction_outlier_explanations (
    outlier_id UUID PRIMARY KEY REFERENCES transaction_outliers(id) ON DELETE CASCADE,
    reasons JSONB NOT NULL
);

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

CREATE TABLE IF NOT EXISTS anomaly_detection_inputs (
    job_id UUID PRIMARY KEY REFERENCES anomaly_detection_jobs(id) ON DELETE CASCADE,
    fingerprint VARCHAR(100) NOT NULL
);
