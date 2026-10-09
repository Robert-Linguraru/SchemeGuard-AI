-- Run after upload_tables.sql. Existing uploads and transactions are preserved.
-- Existing uploads keep source_id NULL until an analyst explicitly associates them.

CREATE TABLE IF NOT EXISTS transaction_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL CHECK (BTRIM(name) <> ''),
    normalized_name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE upload_sessions
    ADD COLUMN IF NOT EXISTS user_id UUID
        REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE uploads
    ADD COLUMN IF NOT EXISTS source_id UUID
        REFERENCES transaction_sources(id);

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS user_id UUID
        REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS source_id UUID
        REFERENCES transaction_sources(id);

-- Backfill ownership only where the source is already known. Existing rows
-- stay source-less and are not deleted or assigned an inferred bank.
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

-- Old records remain unaffected because their source_id/user_id pair is NULL.
-- New records are protected against duplicate imports for one user and source.
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_user_source_external_id
    ON transactions (user_id, source_id, external_id)
    WHERE user_id IS NOT NULL AND source_id IS NOT NULL;

ALTER TABLE upload_sessions
    ADD COLUMN IF NOT EXISTS duplicate_rows BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS duplicate_signature VARCHAR(32);

ALTER TABLE transaction_import_staging
    ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS duplicate_reason VARCHAR(30),
    ADD COLUMN IF NOT EXISTS duplicate_transaction_id UUID,
    ADD COLUMN IF NOT EXISTS duplicate_upload_id UUID;

CREATE INDEX IF NOT EXISTS idx_transaction_import_staging_upload_external_id
    ON transaction_import_staging (upload_id, external_id, row_number);
