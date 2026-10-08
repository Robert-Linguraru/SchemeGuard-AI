-- ATENTIE: sterge toate datele din tabelele SchemeGuardAI din schema public.
-- Pastreaza structura bazei de date. Executati numai pe baza de date dorita.
-- TRUNCATE este atomic in PostgreSQL; ROLLBACK anuleaza stergerea inainte de COMMIT.

BEGIN;

DO $$
DECLARE
    table_list TEXT;
BEGIN
    SELECT string_agg(format('%I.%I', 'public', table_name), ', ')
    INTO table_list
    FROM unnest(ARRAY[
        'anomaly_detection_inputs',
        'anomaly_detection_jobs',
        'audit_logs',
        'card_schemes',
        'country_regions',
        'currency_rates',
        'fallback_interchange_rates',
        'fee_calculations',
        'interchange_rules',
        'merchant_users',
        'merchants',
        'ml_predictions',
        'processing_jobs',
        'qualification_results',
        'rag_document_chunks',
        'roles',
        'transaction_import_staging',
        'transaction_outliers',
        'transactions',
        'upload_parts',
        'upload_sessions',
        'uploads',
        'user_roles',
        'users'
    ]) AS tables(table_name)
    WHERE to_regclass(format('%I.%I', 'public', table_name)) IS NOT NULL;

    IF table_list IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || table_list || ' RESTART IDENTITY CASCADE';
    END IF;
END $$;

COMMIT;
