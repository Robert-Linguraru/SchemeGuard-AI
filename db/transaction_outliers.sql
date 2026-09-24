-- Run this after db/upload_tables.sql and before starting the backend.

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
