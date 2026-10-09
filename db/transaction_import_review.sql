-- Run after db/transaction_sources_and_deduplication.sql.
-- Duplicate-review rows need WAL-backed storage so they survive a database restart.

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

CREATE INDEX IF NOT EXISTS idx_transaction_import_review_upload_external_id
    ON transaction_import_review (upload_id, external_id, row_number);

-- Preserve any review sessions created before this migration was applied.
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
