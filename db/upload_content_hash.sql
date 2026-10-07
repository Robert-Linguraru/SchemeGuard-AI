-- Run after upload_tables.sql to enable exact-file deduplication per user.
-- Existing uploads intentionally keep a NULL hash; the backend hashes only
-- documents uploaded after this migration is applied.

ALTER TABLE uploads
    ADD COLUMN IF NOT EXISTS content_sha256 VARCHAR(64);

-- DUPLICATE sessions are retained temporarily so the upload client can poll
-- and display the result, but their document rows are not imported uploads and
-- should not appear in upload history. Preserve any row that already has
-- transactions attached, since that would be imported data rather than an
-- empty duplicate attempt.
DELETE FROM uploads u
USING upload_sessions s
WHERE s.id = u.session_id
  AND s.status = 'DUPLICATE'
  AND NOT EXISTS (
      SELECT 1
      FROM transactions t
      WHERE t.upload_id = u.id
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_uploads_user_content_sha256
    ON uploads (user_id, content_sha256)
    WHERE content_sha256 IS NOT NULL;
