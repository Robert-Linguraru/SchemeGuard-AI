-- Run this after db/create_schema.sql.

CREATE TABLE IF NOT EXISTS upload_sessions (
    id UUID PRIMARY KEY,
    processing_job_id UUID REFERENCES processing_jobs(id) ON DELETE SET NULL,
    original_file_name VARCHAR(255) NOT NULL,
    expected_file_size_bytes BIGINT NOT NULL CHECK (expected_file_size_bytes > 0),
    expected_total_parts INTEGER NOT NULL CHECK (expected_total_parts > 0),
    expected_file_sha256 VARCHAR(64),
    status VARCHAR(20) NOT NULL,
    uploaded_bytes BIGINT NOT NULL DEFAULT 0 CHECK (uploaded_bytes >= 0),
    uploaded_parts INTEGER NOT NULL DEFAULT 0 CHECK (uploaded_parts >= 0),
    processed_rows BIGINT NOT NULL DEFAULT 0 CHECK (processed_rows >= 0),
    error_message VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    version BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS upload_parts (
    id BIGSERIAL PRIMARY KEY,
    upload_id UUID NOT NULL REFERENCES upload_sessions(id) ON DELETE CASCADE,
    part_number INTEGER NOT NULL CHECK (part_number >= 0),
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
    sha256 VARCHAR(64) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    CONSTRAINT uq_upload_parts_session_number
        UNIQUE (upload_id, part_number)
);

CREATE TABLE IF NOT EXISTS uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    session_id UUID NOT NULL REFERENCES upload_sessions(id) ON DELETE CASCADE,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    document BYTEA NOT NULL
);

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS upload_id UUID
        REFERENCES uploads(id) ON DELETE RESTRICT;

ALTER TABLE transactions
    ALTER COLUMN upload_id DROP NOT NULL;

ALTER TABLE upload_sessions
    ADD COLUMN IF NOT EXISTS processing_job_id UUID
        REFERENCES processing_jobs(id) ON DELETE SET NULL;


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

CREATE INDEX IF NOT EXISTS idx_upload_sessions_status
    ON upload_sessions(status);

-- Unlogged staging rows are copied in batches and merged set-wise into the
-- normalized transaction tables. Rows are deleted after every successful batch.
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
    PRIMARY KEY (upload_id, row_number)
);
