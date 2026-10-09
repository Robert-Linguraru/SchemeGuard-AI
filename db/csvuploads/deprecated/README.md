# Deprecated upload SQL migrations

These standalone scripts were consolidated into `../upload_system.sql` and moved here
to preserve the migration history. For new database setup or upload-schema updates, use
`db/csvuploads/upload_system.sql` after `db/create_schema.sql` instead of running these
files individually.
