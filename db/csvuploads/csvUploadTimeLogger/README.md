# CSV upload timing

Run `upload_timing.sql` after `db/upload_tables.sql` and before starting or restarting
the backend. The backend validates its JPA schema at startup.

All durations are stored in milliseconds. Timing data is diagnostic and does not affect
the upload/import result.

- `upload_sessions.receive_duration_ms` is the server-observed time from session creation
  until every part has been registered. It includes client/network waiting time.
- `part_request_processing_duration_ms` sums backend handling time for part requests,
  including reading/checksumming the request body and registering the part.
- `document_persistence_duration_ms` measures storing the reconstructed document in
  PostgreSQL, including checksum and duplicate checks.
- `csv_parse_validation_duration_ms` measures CSV parsing and row validation outside
  staging writes; small progress and stream overhead is included.
- `staging_write_duration_ms` sums batch writes to the import staging table.
- `final_merge_duration_ms` measures the final merge from staging into application
  tables. It does not include the database transaction's final commit acknowledgement.
- `upload_sessions.total_duration_ms` and `uploads.total_duration_ms` measure from
  session creation to the terminal result recorded by the backend.

Unreached stages remain `NULL`. The existing cleanup policy still removes old failed,
cancelled, and duplicate sessions after the configured session TTL.
Duplicate attempts keep their measurements on `upload_sessions`; the existing flow
deletes their row from `uploads`, so they do not keep `uploads.total_duration_ms`.

To inspect recent measurements:

```sql
SELECT
    s.id,
    s.original_file_name,
    s.status,
    s.created_at,
    s.first_part_request_at,
    s.all_parts_received_at,
    s.receive_duration_ms,
    s.part_request_processing_duration_ms,
    s.processing_started_at,
    s.document_persistence_duration_ms,
    s.csv_parse_validation_duration_ms,
    s.staging_write_duration_ms,
    s.final_merge_duration_ms,
    s.finished_at,
    s.total_duration_ms AS session_total_duration_ms,
    u.total_duration_ms AS upload_total_duration_ms
FROM upload_sessions s
LEFT JOIN uploads u ON u.session_id = s.id
ORDER BY s.created_at DESC;
```
